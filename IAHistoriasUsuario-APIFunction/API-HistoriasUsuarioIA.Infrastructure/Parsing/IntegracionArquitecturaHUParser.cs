using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Parser de backlog markdown para construir una jerarquia Epic-Feature-Historia.
    /// </summary>
    /// <remarks>
    /// Reconoce encabezados markdown y pseudo-encabezados frecuentes en espanol/ingles, limpia numeracion y separa
    /// descripciones de criterios de aceptacion para que la funcion de integracion cree work items estructurados.
    /// </remarks>
    public static class IntegracionArquitecturaHUParser
    {
        // Markdown admite niveles 1..6; 7 representa la ausencia de un nivel activo.
        private const int NoActiveHeadingLevel = 7;

        private static readonly Regex HeadingRegex = new(@"^\s{0,3}(#{1,6})\s+(.+?)\s*$", RegexOptions.Compiled);
        private static readonly Regex HeadingTrailHashRegex = new(@"\s+#+\s*$", RegexOptions.Compiled);
        private static readonly Regex MarkdownLinkRegex = new(@"\[(?<text>[^\]]+)\]\((?<url>[^)]+)\)", RegexOptions.Compiled);
        private static readonly Regex LeadingNumberingRegex = new(@"^\s*(?:(?:\(?\d+\)?(?:\.\d+)*[.)]?)\s*)+", RegexOptions.Compiled);
        private static readonly Regex LeadingBulletRegex = new(@"^\s*[-*+•]\s*", RegexOptions.Compiled);
        private static readonly Regex FieldHeadingRegex = new(@"^\s*(?<label>t[ií]tulo|ttulo|descripci[oó]n|descripcin|criterios?\s+de\s+aceptaci[oó]n|criterios?\s+de\s+aceptacin|acceptance\s+criteria)\s*:?\s*(?<value>.*)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex EpicContainerWithNumberRegex = new(@"^\s*(?:epic|[eé]?pica)\s+\d+(?:\.\d+)*\s*$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex FeatureContainerWithNumberRegex = new(@"^\s*(?:feature|caracter[ií]stica|funcionalidad)\s+\d+(?:\.\d+)*\s*$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex StoryContainerWithNumberRegex = new(@"^\s*(?:historia(?:\s+de\s+usuario|\s+funcional|\s+no\s+funcional)?|user\s+story)\s+\d+(?:\.\d+)*\s*$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex EpicPrefixRegex = new(@"^\s*(?:(?:epic|[eé]?pica)s?)\s*[:\-]\s*(?<title>.+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex EpicPrefixWithSpaceRegex = new(@"^\s*(?:epic|[eé]?pica)\s+(?<title>.+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex FeaturePrefixRegex = new(@"^\s*(?:feature(?:s)?|caracter[ií]stica(?:s)?|funcionalidad(?:es)?)\s*[:\-]\s*(?<title>.+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex FeaturePrefixWithSpaceRegex = new(@"^\s*(?:feature|caracter[ií]stica|funcionalidad)\s+(?<title>.+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex StoryPrefixRegex = new(@"^\s*(?:historia(?:s)?\s+de\s+usuario|historia\s+funcional|historia\s+no\s+funcional|historia(?:s)?|user\s+story|user\s+stories)\s*[:\-]\s*(?<title>.+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex StoryPrefixWithSpaceRegex = new(@"^\s*(?:historia\s+de\s+usuario|historia\s+funcional|historia\s+no\s+funcional|historia|user\s+story)\s+(?<title>.+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex InlineAcceptanceRegex = new(@"^\s*(?:[-*+]\s*)?(?<label>criterios?\s+de\s+aceptaci[oó]n|acceptance\s+criteria)\s*:?\s*(?<rest>.*)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly HashSet<string> EpicContainerLabels = new(StringComparer.OrdinalIgnoreCase)
        {
            "epica",
            "epicas",
            "pica",
            "picas",
            "epic",
            "epics"
        };

        private static readonly HashSet<string> FeatureContainerLabels = new(StringComparer.OrdinalIgnoreCase)
        {
            "feature",
            "features",
            "caracteristica",
            "caracteristicas",
            "funcionalidad",
            "funcionalidades"
        };

        private static readonly HashSet<string> StoryContainerLabels = new(StringComparer.OrdinalIgnoreCase)
        {
            "historia",
            "historias",
            "historia de usuario",
            "historias de usuario",
            "historia funcional",
            "historias funcionales",
            "historia no funcional",
            "historias no funcionales",
            "user story",
            "user stories",
            "stories"
        };

        /// <summary>
        /// Convierte markdown en un documento jerarquico con advertencias cuando no se detectan secciones esperadas.
        /// </summary>
        /// <param name="markdown">Contenido markdown del backlog generado o cargado por el usuario.</param>
        /// <returns>Documento con epicas, features, historias y advertencias de parseo.</returns>
        public static ParsedIntegracionArquitecturaHUDocument Parse(string markdown)
        {
            var document = new ParsedIntegracionArquitecturaHUDocument();
            if (string.IsNullOrWhiteSpace(markdown))
            {
                document.Warnings.Add("El markdown recibido esta vacio.");
                return document;
            }

            var lines = SplitLines(markdown);
            var headings = ExtractHeadings(lines);
            if (headings.Count == 0)
            {
                document.Warnings.Add("No se detectaron encabezados Markdown (#) para construir la jerarquia.");
                return document;
            }

            var markers = BuildHierarchy(headings, document);
            PopulateDescriptions(lines, markers);
            return document;
        }

        private static string[] SplitLines(string markdown)
        {
            var normalized = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');
            return normalized.Split('\n');
        }

        private static List<HeadingToken> ExtractHeadings(IReadOnlyList<string> lines)
        {
            var tokens = new List<HeadingToken>();
            for (var lineIndex = 0; lineIndex < lines.Count; lineIndex++)
            {
                if (!TryParseHeading(lines[lineIndex], out var level, out var headingText))
                    continue;

                var classified = ClassifyHeading(lineIndex, level, headingText);
                tokens.Add(classified);
            }

            return tokens;
        }

        private static HeadingToken ClassifyHeading(int lineIndex, int level, string rawHeadingText)
        {
            var cleaned = CleanupHeadingText(rawHeadingText);

            if (TryParseFieldHeading(cleaned, out var fieldKind, out var fieldValue))
            {
                return new HeadingToken
                {
                    LineIndex = lineIndex,
                    Level = level,
                    Kind = fieldKind switch
                    {
                        FieldKind.Title => ParsedHeadingKind.TitleField,
                        FieldKind.Description => ParsedHeadingKind.DescriptionField,
                        FieldKind.Acceptance => ParsedHeadingKind.Acceptance,
                        _ => ParsedHeadingKind.Unknown
                    },
                    SemanticTitle = StripLeadingNumbering(fieldValue).Trim(),
                    RawText = cleaned
                };
            }

            var titleCandidate = StripLeadingNumbering(cleaned);
            var normalized = NormalizeForLookup(titleCandidate);

            if (IsAcceptanceHeading(normalized))
            {
                return new HeadingToken
                {
                    LineIndex = lineIndex,
                    Level = level,
                    Kind = ParsedHeadingKind.Acceptance,
                    SemanticTitle = titleCandidate,
                    RawText = cleaned
                };
            }

            if (IsEpicContainerHeading(titleCandidate, normalized))
            {
                return new HeadingToken
                {
                    LineIndex = lineIndex,
                    Level = level,
                    Kind = ParsedHeadingKind.EpicContainer,
                    SemanticTitle = titleCandidate,
                    RawText = cleaned
                };
            }

            if (IsFeatureContainerHeading(titleCandidate, normalized))
            {
                return new HeadingToken
                {
                    LineIndex = lineIndex,
                    Level = level,
                    Kind = ParsedHeadingKind.FeatureContainer,
                    SemanticTitle = titleCandidate,
                    RawText = cleaned
                };
            }

            if (IsStoryContainerHeading(titleCandidate, normalized))
            {
                return new HeadingToken
                {
                    LineIndex = lineIndex,
                    Level = level,
                    Kind = ParsedHeadingKind.StoryContainer,
                    SemanticTitle = titleCandidate,
                    RawText = cleaned
                };
            }

            if (TryClassifyItem(titleCandidate, out var itemKind, out var semanticTitle))
            {
                return new HeadingToken
                {
                    LineIndex = lineIndex,
                    Level = level,
                    Kind = itemKind,
                    SemanticTitle = semanticTitle,
                    RawText = cleaned
                };
            }

            return new HeadingToken
            {
                LineIndex = lineIndex,
                Level = level,
                Kind = ParsedHeadingKind.Unknown,
                SemanticTitle = titleCandidate,
                RawText = cleaned
            };
        }

        private static bool TryClassifyItem(string headingText, out ParsedHeadingKind kind, out string semanticTitle)
        {
            kind = ParsedHeadingKind.Unknown;
            semanticTitle = headingText;

            if (TryExtractTitle(headingText, EpicPrefixRegex, EpicPrefixWithSpaceRegex, out var epicTitle))
            {
                kind = ParsedHeadingKind.EpicItem;
                semanticTitle = epicTitle;
                return true;
            }

            if (TryExtractTitle(headingText, FeaturePrefixRegex, FeaturePrefixWithSpaceRegex, out var featureTitle))
            {
                kind = ParsedHeadingKind.FeatureItem;
                semanticTitle = featureTitle;
                return true;
            }

            if (TryExtractTitle(headingText, StoryPrefixRegex, StoryPrefixWithSpaceRegex, out var storyTitle))
            {
                kind = ParsedHeadingKind.StoryItem;
                semanticTitle = storyTitle;
                return true;
            }

            return false;
        }

        private static bool TryExtractTitle(
            string headingText,
            Regex prefixRegex,
            Regex prefixWithSpaceRegex,
            out string semanticTitle)
        {
            semanticTitle = string.Empty;

            var match = prefixRegex.Match(headingText);
            if (!match.Success)
                match = prefixWithSpaceRegex.Match(headingText);

            if (!match.Success)
                return false;

            semanticTitle = StripLeadingNumbering(match.Groups["title"].Value).Trim();
            return !string.IsNullOrWhiteSpace(semanticTitle);
        }

        private static List<NodeMarker> BuildHierarchy(
            IReadOnlyList<HeadingToken> headings,
            ParsedIntegracionArquitecturaHUDocument document)
        {
            var markers = new List<NodeMarker>();
            var activeContainers = new Dictionary<int, NodeKind>();

            MarkdownEpicNode? currentEpic = null;
            MarkdownFeatureNode? currentFeature = null;
            MarkdownStoryNode? currentStory = null;
            var currentEpicLevel = NoActiveHeadingLevel;
            var currentFeatureLevel = NoActiveHeadingLevel;
            var currentStoryLevel = NoActiveHeadingLevel;

            foreach (var heading in headings)
            {
                ClearContainersAtOrBelowLevel(activeContainers, heading.Level);

                if (heading.Kind is ParsedHeadingKind.Acceptance or ParsedHeadingKind.TitleField or ParsedHeadingKind.DescriptionField)
                    continue;

                if (TryHandleContainerHeading(heading, activeContainers))
                    continue;

                var resolvedNodeKind = ResolveNodeKind(
                    heading,
                    activeContainers,
                    currentEpic,
                    currentFeature,
                    currentStory,
                    currentEpicLevel,
                    currentFeatureLevel,
                    currentStoryLevel);

                if (!resolvedNodeKind.HasValue)
                    continue;

                var semanticTitle = SanitizeTitle(heading.SemanticTitle, resolvedNodeKind.Value);
                var canCreateWithoutTitle = IsExplicitHierarchyHeading(heading.Kind);
                if (string.IsNullOrWhiteSpace(semanticTitle) && !canCreateWithoutTitle)
                {
                    document.Warnings.Add($"Se ignoro encabezado sin titulo semantico en linea {heading.LineIndex + 1}.");
                    continue;
                }

                if (resolvedNodeKind.Value == NodeKind.Epic)
                {
                    if (heading.Level <= currentStoryLevel)
                    {
                        currentStory = null;
                        currentStoryLevel = NoActiveHeadingLevel;
                    }

                    if (heading.Level <= currentFeatureLevel)
                    {
                        currentFeature = null;
                        currentFeatureLevel = NoActiveHeadingLevel;
                    }

                    if (heading.Level <= currentEpicLevel)
                    {
                        currentEpic = null;
                        currentEpicLevel = NoActiveHeadingLevel;
                    }

                    var epic = new MarkdownEpicNode
                    {
                        Title = semanticTitle
                    };
                    document.Epics.Add(epic);

                    currentEpic = epic;
                    currentEpicLevel = heading.Level;

                    markers.Add(NodeMarker.FromEpic(heading.LineIndex, heading.Level, epic));
                    continue;
                }

                if (resolvedNodeKind.Value == NodeKind.Feature)
                {
                    if (heading.Level <= currentStoryLevel)
                    {
                        currentStory = null;
                        currentStoryLevel = NoActiveHeadingLevel;
                    }

                    if (heading.Level <= currentFeatureLevel)
                    {
                        currentFeature = null;
                        currentFeatureLevel = NoActiveHeadingLevel;
                    }

                    currentEpic ??= document.Epics.LastOrDefault();
                    if (currentEpic is null)
                    {
                        document.Warnings.Add($"Feature '{semanticTitle}' sin epica padre en linea {heading.LineIndex + 1}. Se ignora.");
                        continue;
                    }

                    var feature = new MarkdownFeatureNode
                    {
                        Title = semanticTitle
                    };
                    currentEpic.Features.Add(feature);

                    currentFeature = feature;
                    currentFeatureLevel = heading.Level;

                    markers.Add(NodeMarker.FromFeature(heading.LineIndex, heading.Level, feature));
                    continue;
                }

                if (heading.Level <= currentStoryLevel)
                {
                    currentStory = null;
                    currentStoryLevel = NoActiveHeadingLevel;
                }

                currentFeature ??= currentEpic?.Features.LastOrDefault()
                    ?? document.Epics.LastOrDefault()?.Features.LastOrDefault();

                if (currentFeature is null)
                {
                    document.Warnings.Add($"Historia '{semanticTitle}' sin feature padre en linea {heading.LineIndex + 1}. Se ignora.");
                    continue;
                }

                var story = new MarkdownStoryNode
                {
                    Title = semanticTitle,
                    StoryType = ResolveStoryTypeCode(heading.RawText)
                };
                currentFeature.Stories.Add(story);

                currentStory = story;
                currentStoryLevel = heading.Level;

                markers.Add(NodeMarker.FromStory(heading.LineIndex, heading.Level, story));
            }

            return markers;
        }

        private static void PopulateDescriptions(IReadOnlyList<string> lines, IReadOnlyList<NodeMarker> markers)
        {
            for (var index = 0; index < markers.Count; index++)
            {
                var marker = markers[index];
                var startLine = marker.LineIndex + 1;
                var endLine = index < markers.Count - 1
                    ? markers[index + 1].LineIndex - 1
                    : lines.Count - 1;

                if (startLine > endLine)
                    continue;

                var sectionLines = new List<string>();
                for (var lineIndex = startLine; lineIndex <= endLine; lineIndex++)
                    sectionLines.Add(lines[lineIndex]);

                ExtractStructuredFields(
                    sectionLines,
                    marker.HeadingLevel,
                    out var explicitTitle,
                    out var explicitDescription,
                    out var explicitAcceptance,
                    out var remainingBodyLines);

                if (marker.NodeKind == NodeKind.Epic && marker.Epic is not null)
                {
                    if (!string.IsNullOrWhiteSpace(explicitTitle))
                        marker.Epic.Title = SanitizeTitle(explicitTitle, NodeKind.Epic);

                    marker.Epic.Description = !string.IsNullOrWhiteSpace(explicitDescription)
                        ? explicitDescription
                        : NormalizeMarkdownBlock(remainingBodyLines);
                    continue;
                }

                if (marker.NodeKind == NodeKind.Feature && marker.Feature is not null)
                {
                    if (!string.IsNullOrWhiteSpace(explicitTitle))
                        marker.Feature.Title = SanitizeTitle(explicitTitle, NodeKind.Feature);

                    marker.Feature.Description = !string.IsNullOrWhiteSpace(explicitDescription)
                        ? explicitDescription
                        : NormalizeMarkdownBlock(remainingBodyLines);
                    continue;
                }

                if (marker.NodeKind == NodeKind.Story && marker.Story is not null)
                {
                    if (!string.IsNullOrWhiteSpace(explicitTitle))
                        marker.Story.Title = SanitizeTitle(explicitTitle, NodeKind.Story);

                    ExtractStoryBodyAndAcceptance(remainingBodyLines, out var fallbackDescription, out var fallbackAcceptance);

                    var description = !string.IsNullOrWhiteSpace(explicitDescription)
                        ? explicitDescription
                        : fallbackDescription;

                    var acceptanceCriteria = !string.IsNullOrWhiteSpace(explicitAcceptance)
                        ? explicitAcceptance
                        : fallbackAcceptance;

                    marker.Story.Description = description;
                    marker.Story.AcceptanceCriteria = acceptanceCriteria;
                }
            }
        }

        private static void ExtractStructuredFields(
            IReadOnlyList<string> lines,
            int nodeHeadingLevel,
            out string title,
            out string description,
            out string acceptance,
            out List<string> remainingBodyLines)
        {
            var titleLines = new List<string>();
            var descriptionLines = new List<string>();
            var acceptanceLines = new List<string>();
            remainingBodyLines = [];

            var currentField = FieldKind.None;

            foreach (var line in lines)
            {
                if (TryParseHeading(line, out var headingLevel, out var headingText) && headingLevel > nodeHeadingLevel)
                {
                    var cleanedHeading = CleanupHeadingText(headingText);
                    if (TryParseFieldHeading(cleanedHeading, out var fieldKind, out var inlineValue))
                    {
                        currentField = fieldKind;
                        if (!string.IsNullOrWhiteSpace(inlineValue))
                            AddStructuredFieldLine(fieldKind, inlineValue, titleLines, descriptionLines, acceptanceLines);

                        continue;
                    }

                    currentField = FieldKind.None;
                    remainingBodyLines.Add(line);
                    continue;
                }

                if (currentField != FieldKind.None)
                {
                    AddStructuredFieldLine(currentField, line, titleLines, descriptionLines, acceptanceLines);
                    continue;
                }

                if (TryExtractInlineAcceptance(line, out var inlineAcceptanceText))
                {
                    currentField = FieldKind.Acceptance;
                    if (!string.IsNullOrWhiteSpace(inlineAcceptanceText))
                        acceptanceLines.Add(inlineAcceptanceText);

                    continue;
                }

                remainingBodyLines.Add(line);
            }

            title = NormalizeMarkdownBlock(titleLines);
            description = NormalizeMarkdownBlock(descriptionLines);
            acceptance = NormalizeMarkdownBlock(acceptanceLines);
        }

        private static void AddStructuredFieldLine(
            FieldKind fieldKind,
            string line,
            List<string> titleLines,
            List<string> descriptionLines,
            List<string> acceptanceLines)
        {
            if (fieldKind == FieldKind.Title)
            {
                titleLines.Add(line);
                return;
            }

            if (fieldKind == FieldKind.Description)
            {
                descriptionLines.Add(line);
                return;
            }

            if (fieldKind == FieldKind.Acceptance)
                acceptanceLines.Add(line);
        }

        private static void ExtractStoryBodyAndAcceptance(
            IReadOnlyList<string> lines,
            out string description,
            out string acceptanceCriteria)
        {
            var descriptionLines = new List<string>();
            var acceptanceLines = new List<string>();
            var inAcceptanceBlock = false;

            foreach (var line in lines)
            {
                if (TryParseHeading(line, out _, out var headingText))
                {
                    var normalizedHeading = NormalizeForLookup(CleanupHeadingText(headingText));
                    if (IsAcceptanceHeading(normalizedHeading))
                    {
                        inAcceptanceBlock = true;
                        continue;
                    }

                    if (inAcceptanceBlock)
                    {
                        inAcceptanceBlock = false;
                    }
                }

                if (TryExtractInlineAcceptance(line, out var inlineAcceptanceText))
                {
                    inAcceptanceBlock = true;
                    if (!string.IsNullOrWhiteSpace(inlineAcceptanceText))
                        acceptanceLines.Add(inlineAcceptanceText);

                    continue;
                }

                if (inAcceptanceBlock)
                {
                    acceptanceLines.Add(line);
                    continue;
                }

                descriptionLines.Add(line);
            }

            description = NormalizeMarkdownBlock(descriptionLines);
            acceptanceCriteria = NormalizeMarkdownBlock(acceptanceLines);
        }

        private static bool TryExtractInlineAcceptance(string line, out string text)
        {
            text = string.Empty;
            var match = InlineAcceptanceRegex.Match(line);
            if (!match.Success)
                return false;

            text = match.Groups["rest"].Value.Trim();
            return true;
        }

        private static string NormalizeMarkdownBlock(IReadOnlyList<string> lines)
        {
            if (lines.Count == 0)
                return string.Empty;

            var start = 0;
            while (start < lines.Count && string.IsNullOrWhiteSpace(lines[start]))
                start++;

            var end = lines.Count - 1;
            while (end >= start && string.IsNullOrWhiteSpace(lines[end]))
                end--;

            if (start > end)
                return string.Empty;

            return string.Join("\n", lines.Skip(start).Take(end - start + 1));
        }

        private static NodeKind? ResolveNodeKind(
            HeadingToken heading,
            IReadOnlyDictionary<int, NodeKind> activeContainers,
            MarkdownEpicNode? currentEpic,
            MarkdownFeatureNode? currentFeature,
            MarkdownStoryNode? currentStory,
            int currentEpicLevel,
            int currentFeatureLevel,
            int currentStoryLevel)
        {
            if (heading.Kind is ParsedHeadingKind.TitleField or ParsedHeadingKind.DescriptionField or ParsedHeadingKind.Acceptance)
                return null;

            if (heading.Kind == ParsedHeadingKind.EpicItem)
                return NodeKind.Epic;

            if (heading.Kind == ParsedHeadingKind.EpicContainer && !IsCollectionContainerHeading(heading))
                return NodeKind.Epic;

            if (heading.Kind == ParsedHeadingKind.FeatureItem)
                return NodeKind.Feature;

            if (heading.Kind == ParsedHeadingKind.FeatureContainer && !IsCollectionContainerHeading(heading))
                return NodeKind.Feature;

            if (heading.Kind == ParsedHeadingKind.StoryItem)
                return NodeKind.Story;

            if (heading.Kind == ParsedHeadingKind.StoryContainer && !IsCollectionContainerHeading(heading))
                return NodeKind.Story;

            if (TryGetNearestContainer(activeContainers, heading.Level, out var containerNodeKind))
                return containerNodeKind;

            if (currentStory is not null && heading.Level > currentStoryLevel)
                return null;

            if (currentStory is not null && heading.Level == currentStoryLevel)
                return NodeKind.Story;

            if (currentFeature is not null)
            {
                if (heading.Level > currentFeatureLevel)
                    return NodeKind.Story;

                if (heading.Level == currentFeatureLevel)
                    return NodeKind.Feature;
            }

            if (currentEpic is not null)
            {
                if (heading.Level > currentEpicLevel)
                    return NodeKind.Feature;

                if (heading.Level == currentEpicLevel)
                    return NodeKind.Epic;

                if (heading.Level < currentEpicLevel)
                    return NodeKind.Epic;
            }

            return NodeKind.Epic;
        }

        private static bool TryGetNearestContainer(
            IReadOnlyDictionary<int, NodeKind> activeContainers,
            int headingLevel,
            out NodeKind nodeKind)
        {
            nodeKind = NodeKind.Epic;
            var bestLevel = int.MinValue;
            var found = false;

            foreach (var pair in activeContainers)
            {
                if (pair.Key >= headingLevel)
                    continue;

                if (pair.Key <= bestLevel)
                    continue;

                bestLevel = pair.Key;
                nodeKind = pair.Value;
                found = true;
            }

            return found;
        }

        private static bool TryHandleContainerHeading(HeadingToken heading, IDictionary<int, NodeKind> activeContainers)
        {
            if (!IsCollectionContainerHeading(heading))
                return false;

            activeContainers[heading.Level] = GetContainerNodeKind(heading.Kind);
            return true;
        }

        private static void ClearContainersAtOrBelowLevel(IDictionary<int, NodeKind> activeContainers, int level)
        {
            var removable = activeContainers.Keys
                .Where(existingLevel => existingLevel >= level)
                .ToArray();

            foreach (var removableLevel in removable)
                activeContainers.Remove(removableLevel);
        }

        private static bool IsExplicitHierarchyHeading(ParsedHeadingKind kind)
        {
            return kind is ParsedHeadingKind.EpicItem
                or ParsedHeadingKind.FeatureItem
                or ParsedHeadingKind.StoryItem
                or ParsedHeadingKind.EpicContainer
                or ParsedHeadingKind.FeatureContainer
                or ParsedHeadingKind.StoryContainer;
        }

        private static bool TryParseFieldHeading(string headingText, out FieldKind fieldKind, out string value)
        {
            fieldKind = FieldKind.None;
            value = string.Empty;

            var match = FieldHeadingRegex.Match(headingText);
            if (!match.Success)
                return false;

            var normalizedLabel = NormalizeForLookup(match.Groups["label"].Value);
            value = match.Groups["value"].Value.Trim();

            if (normalizedLabel == "titulo")
            {
                fieldKind = FieldKind.Title;
                return true;
            }

            if (normalizedLabel is "ttulo" or "t tulo")
            {
                fieldKind = FieldKind.Title;
                return true;
            }

            if (normalizedLabel == "descripcion")
            {
                fieldKind = FieldKind.Description;
                return true;
            }

            if (normalizedLabel is "descripcin" or "descripci n")
            {
                fieldKind = FieldKind.Description;
                return true;
            }

            if (normalizedLabel == "criterios de aceptacion" || normalizedLabel == "acceptance criteria")
            {
                fieldKind = FieldKind.Acceptance;
                return true;
            }

            if (normalizedLabel is "criterios de aceptacin" or "criterios de aceptaci n")
            {
                fieldKind = FieldKind.Acceptance;
                return true;
            }

            return false;
        }

        private static bool IsEpicContainerHeading(string titleCandidate, string normalizedTitle)
        {
            if (EpicContainerLabels.Contains(normalizedTitle))
                return true;

            return EpicContainerWithNumberRegex.IsMatch(titleCandidate);
        }

        private static bool IsFeatureContainerHeading(string titleCandidate, string normalizedTitle)
        {
            if (FeatureContainerLabels.Contains(normalizedTitle))
                return true;

            return FeatureContainerWithNumberRegex.IsMatch(titleCandidate);
        }

        private static bool IsStoryContainerHeading(string titleCandidate, string normalizedTitle)
        {
            if (StoryContainerLabels.Contains(normalizedTitle))
                return true;

            return StoryContainerWithNumberRegex.IsMatch(titleCandidate);
        }

        private static bool IsCollectionContainerHeading(HeadingToken heading)
        {
            var normalized = NormalizeForLookup(StripLeadingNumbering(heading.RawText));
            if (string.IsNullOrWhiteSpace(normalized))
                return false;

            if (heading.Kind == ParsedHeadingKind.EpicContainer)
                return normalized is "epicas" or "epics";

            if (heading.Kind == ParsedHeadingKind.FeatureContainer)
            {
                return normalized is "features"
                    or "caracteristicas"
                    or "funcionalidades";
            }

            if (heading.Kind == ParsedHeadingKind.StoryContainer)
            {
                return normalized is "historias"
                    or "historias de usuario"
                    or "historias funcionales"
                    or "historias no funcionales"
                    or "user stories"
                    or "stories";
            }

            return false;
        }

        private static NodeKind GetContainerNodeKind(ParsedHeadingKind kind)
        {
            return kind switch
            {
                ParsedHeadingKind.EpicContainer => NodeKind.Epic,
                ParsedHeadingKind.FeatureContainer => NodeKind.Feature,
                ParsedHeadingKind.StoryContainer => NodeKind.Story,
                _ => NodeKind.Epic
            };
        }

        private static string ResolveStoryTypeCode(string headingRawText)
        {
            var normalized = NormalizeForLookup(headingRawText);
            if (string.IsNullOrWhiteSpace(normalized))
                return string.Empty;

            if (normalized.Contains("no funcional", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("non functional", StringComparison.OrdinalIgnoreCase))
            {
                return "NF";
            }

            if (normalized.Contains("funcional", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("historia de usuario", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("user story", StringComparison.OrdinalIgnoreCase))
            {
                return "FUN";
            }

            return string.Empty;
        }

        private static bool IsAcceptanceHeading(string normalizedHeading)
        {
            return normalizedHeading == "criterios de aceptacion"
                   || normalizedHeading == "criterios de aceptacin"
                   || normalizedHeading == "criterios de aceptaci n"
                   || normalizedHeading == "criterio de aceptacion"
                   || normalizedHeading == "criterio de aceptacin"
                   || normalizedHeading == "criterio de aceptaci n"
                   || normalizedHeading == "acceptance criteria"
                   || normalizedHeading == "acceptance criterion";
        }

        private static bool TryParseHeading(string line, out int level, out string headingText)
        {
            level = 0;
            headingText = string.Empty;

            var match = HeadingRegex.Match(line);
            if (!match.Success)
            {
                var trimmed = line?.Trim() ?? string.Empty;
                if (!TryInferPseudoHeading(trimmed, out level, out headingText))
                    return false;

                return true;
            }

            level = match.Groups[1].Value.Length;
            headingText = match.Groups[2].Value;
            return true;
        }

        private static bool TryInferPseudoHeading(string line, out int level, out string headingText)
        {
            level = 0;
            headingText = string.Empty;
            if (string.IsNullOrWhiteSpace(line))
                return false;

            var cleaned = CleanupHeadingText(line);
            cleaned = ExtractEntityCandidate(cleaned);
            if (string.IsNullOrWhiteSpace(cleaned))
                return false;

            if (TryParseFieldHeading(cleaned, out _, out _))
            {
                level = 4;
                headingText = cleaned;
                return true;
            }

            var titleCandidate = StripLeadingNumbering(cleaned);
            var normalized = NormalizeForLookup(titleCandidate);
            var looksLikeEntity = IsEpicContainerHeading(titleCandidate, normalized)
                                  || IsFeatureContainerHeading(titleCandidate, normalized)
                                  || IsStoryContainerHeading(titleCandidate, normalized)
                                  || TryClassifyItem(titleCandidate, out _, out _);

            if (!looksLikeEntity)
                return false;

            level = IsEpicContainerHeading(titleCandidate, normalized)
                ? 1
                : IsFeatureContainerHeading(titleCandidate, normalized)
                    ? 2
                    : 3;

            headingText = cleaned;
            return true;
        }

        private static string ExtractEntityCandidate(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
                return string.Empty;

            var candidate = line.Trim();
            candidate = candidate.TrimStart('{').Trim();
            candidate = candidate.TrimStart('•').Trim();

            if (candidate.StartsWith("\"", StringComparison.Ordinal) && candidate.Contains(':', StringComparison.Ordinal))
            {
                var colonIndex = candidate.IndexOf(':', StringComparison.Ordinal);
                if (colonIndex >= 0 && colonIndex < candidate.Length - 1)
                    candidate = candidate[(colonIndex + 1)..].Trim();
            }

            candidate = candidate.Trim(',', '}', '"', '\\', ' ');
            return candidate.Trim();
        }

        private static string CleanupHeadingText(string headingText)
        {
            if (string.IsNullOrWhiteSpace(headingText))
                return string.Empty;

            var clean = headingText.Trim();
            clean = HeadingTrailHashRegex.Replace(clean, string.Empty);
            clean = MarkdownLinkRegex.Replace(clean, "${text}");
            clean = clean.Replace("•", string.Empty, StringComparison.Ordinal);
            clean = clean.Replace("`", string.Empty, StringComparison.Ordinal);
            clean = clean.Replace("**", string.Empty, StringComparison.Ordinal);
            clean = clean.Replace("__", string.Empty, StringComparison.Ordinal);
            clean = clean.Replace("*", string.Empty, StringComparison.Ordinal);
            clean = clean.Replace("_", string.Empty, StringComparison.Ordinal);
            return clean.Trim();
        }

        private static string StripLeadingNumbering(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return string.Empty;

            var withoutBullet = LeadingBulletRegex.Replace(text, string.Empty);
            var withoutNumbering = LeadingNumberingRegex.Replace(withoutBullet, string.Empty);
            return withoutNumbering.Trim();
        }

        private static string SanitizeTitle(string title, NodeKind nodeKind)
        {
            var result = StripLeadingNumbering(title);
            result = RemoveNodePrefix(result, nodeKind);
            result = StripLeadingNumbering(result);
            result = result.Trim();
            result = result.Trim(':', '-', '.', ')', '(', ' ');
            return result.Trim();
        }

        private static string RemoveNodePrefix(string title, NodeKind nodeKind)
        {
            if (string.IsNullOrWhiteSpace(title))
                return string.Empty;

            var patterns = nodeKind switch
            {
                NodeKind.Epic => new[]
                {
                    @"^\s*(?:(?:epic|[eé]?pica)s?)\s*[:\-]\s*",
                    @"^\s*(?:epic|[eé]?pica)\s+"
                },
                NodeKind.Feature => new[]
                {
                    @"^\s*(?:feature(?:s)?|caracter[ií]stica(?:s)?|funcionalidad(?:es)?)\s*[:\-]\s*",
                    @"^\s*(?:feature|caracter[ií]stica|funcionalidad)\s+"
                },
                _ => new[]
                {
                    @"^\s*(?:historia(?:s)?\s+de\s+usuario|historia\s+funcional|historia\s+no\s+funcional|historia(?:s)?|user\s+story|user\s+stories)\s*[:\-]\s*",
                    @"^\s*(?:historia\s+de\s+usuario|historia\s+funcional|historia\s+no\s+funcional|historia|user\s+story)\s+"
                }
            };

            var output = title;
            foreach (var pattern in patterns)
                output = Regex.Replace(output, pattern, string.Empty, RegexOptions.IgnoreCase);

            return output.Trim();
        }

        private static string NormalizeForLookup(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            var normalized = value.Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder(normalized.Length);
            foreach (var character in normalized)
            {
                var unicodeCategory = CharUnicodeInfo.GetUnicodeCategory(character);
                if (unicodeCategory == UnicodeCategory.NonSpacingMark)
                    continue;

                if (char.IsLetterOrDigit(character) || char.IsWhiteSpace(character))
                {
                    sb.Append(char.ToLowerInvariant(character));
                }
                else
                {
                    sb.Append(' ');
                }
            }

            var compacted = Regex.Replace(sb.ToString(), @"\s+", " ", RegexOptions.Compiled);
            return compacted.Trim();
        }

        private enum ParsedHeadingKind
        {
            Unknown,
            EpicItem,
            FeatureItem,
            StoryItem,
            EpicContainer,
            FeatureContainer,
            StoryContainer,
            TitleField,
            DescriptionField,
            Acceptance
        }

        private enum FieldKind
        {
            None,
            Title,
            Description,
            Acceptance
        }

        private enum NodeKind
        {
            Epic,
            Feature,
            Story
        }

        private sealed class HeadingToken
        {
            public int LineIndex { get; init; }
            public int Level { get; init; }
            public ParsedHeadingKind Kind { get; init; }
            public string SemanticTitle { get; init; } = string.Empty;
            public string RawText { get; init; } = string.Empty;
        }

        private sealed class NodeMarker
        {
            public int LineIndex { get; init; }
            public int HeadingLevel { get; init; }
            public NodeKind NodeKind { get; init; }
            public MarkdownEpicNode? Epic { get; init; }
            public MarkdownFeatureNode? Feature { get; init; }
            public MarkdownStoryNode? Story { get; init; }

            public static NodeMarker FromEpic(int lineIndex, int headingLevel, MarkdownEpicNode epic)
            {
                return new NodeMarker
                {
                    LineIndex = lineIndex,
                    HeadingLevel = headingLevel,
                    NodeKind = NodeKind.Epic,
                    Epic = epic
                };
            }

            public static NodeMarker FromFeature(int lineIndex, int headingLevel, MarkdownFeatureNode feature)
            {
                return new NodeMarker
                {
                    LineIndex = lineIndex,
                    HeadingLevel = headingLevel,
                    NodeKind = NodeKind.Feature,
                    Feature = feature
                };
            }

            public static NodeMarker FromStory(int lineIndex, int headingLevel, MarkdownStoryNode story)
            {
                return new NodeMarker
                {
                    LineIndex = lineIndex,
                    HeadingLevel = headingLevel,
                    NodeKind = NodeKind.Story,
                    Story = story
                };
            }
        }
    }
}
