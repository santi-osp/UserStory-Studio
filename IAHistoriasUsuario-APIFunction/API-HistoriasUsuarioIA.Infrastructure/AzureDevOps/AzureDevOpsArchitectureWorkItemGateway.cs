using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

/// <summary>
/// Adapter que crea la jerarquia Epic-Feature-Historia usando el servicio Azure DevOps existente.
/// </summary>
public sealed class AzureDevOpsArchitectureWorkItemGateway : IAzureDevOpsArchitectureWorkItemGateway
{
    private const int Status400BadRequest = 400;
    private const int Status408RequestTimeout = 408;
    private const int Status429TooManyRequests = 429;
    private const int Status500InternalServerError = 500;
    private const int Status502BadGateway = 502;
    private const int Status503ServiceUnavailable = 503;
    private const int Status504GatewayTimeout = 504;

    private static readonly Regex LeadingTitleNumberingRegex =
        new(@"^\s*(?:(?:\(?\d+\)?(?:\.\d+)*[.)]?)\s*)+", RegexOptions.Compiled);

    private static readonly Regex MarkdownHeadingRegex =
        new(@"^\s{0,3}(?<level>#{1,6})\s+(?<text>.+?)\s*#*\s*$", RegexOptions.Compiled);

    private static readonly Regex MarkdownUnorderedListRegex =
        new(@"^\s*[-*+]\s+(?<text>.+)$", RegexOptions.Compiled);

    private static readonly Regex MarkdownOrderedListRegex =
        new(@"^\s*\d+[.)]\s+(?<text>.+)$", RegexOptions.Compiled);

    private static readonly Regex MarkdownInlineCodeRegex =
        new(@"`(?<text>[^`]+)`", RegexOptions.Compiled);

    private static readonly Regex MarkdownBoldAsteriskRegex =
        new(@"\*\*(?<text>.+?)\*\*", RegexOptions.Compiled);

    private static readonly Regex MarkdownBoldUnderscoreRegex =
        new(@"__(?<text>.+?)__", RegexOptions.Compiled);

    private static readonly Regex AcceptanceCriterionStartRegex =
        new(@"^\s*(?:\*\*|__)?\s*(?:dado|given)\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private readonly IAzDoServiceFactory _azdoServiceFactory;
    private readonly ILogger<AzureDevOpsArchitectureWorkItemGateway> _logger;
    private readonly AzureDevOpsHttpOptions _httpOptions;

    public AzureDevOpsArchitectureWorkItemGateway(
        IAzDoServiceFactory azdoServiceFactory,
        ILogger<AzureDevOpsArchitectureWorkItemGateway> logger,
        IOptions<AzureDevOpsOptions> options)
    {
        _azdoServiceFactory = azdoServiceFactory;
        _logger = logger;
        _httpOptions = options.Value.Http;
    }

    public async Task<IntegracionArquitecturaHUCreateResponse> CreateHierarchyAsync(
        IntegrateArchitectureHuCommand command,
        ParsedIntegracionArquitecturaHUDocument parsedDocument,
        CancellationToken cancellationToken)
    {
        var azdoService = _azdoServiceFactory.Create(
            command.Organization,
            command.Project,
            command.AzurePat,
            _logger);

        var epicWorkItemType = await ExecuteMetadataWithRetryAsync(
            () => azdoService.ResolveWorkItemTypeByCategoryAsync(
                command.Project,
                "$EpicCategory",
                "Epic"),
            "ResolveEpicWorkItemType",
            cancellationToken);

        var featureWorkItemType = await ExecuteMetadataWithRetryAsync(
            () => azdoService.ResolveWorkItemTypeByCategoryAsync(
                command.Project,
                "$FeatureCategory",
                "Feature"),
            "ResolveFeatureWorkItemType",
            cancellationToken);

        var storyWorkItemConfig = await ExecuteMetadataWithRetryAsync(
            () => azdoService.GetWorkItemConfigAsync(command.Project, string.Empty),
            "ResolveStoryWorkItemType",
            cancellationToken);

        var storyWorkItemType = storyWorkItemConfig.WorkItemType;
        var supportsAcceptanceCriteriaField = storyWorkItemConfig.Fields.Any(
            field => field.ReferenceName.Equals(
                "Microsoft.VSTS.Common.AcceptanceCriteria",
                StringComparison.OrdinalIgnoreCase));

        var response = new IntegracionArquitecturaHUCreateResponse
        {
            EpicWorkItemType = epicWorkItemType,
            FeatureWorkItemType = featureWorkItemType,
            StoryWorkItemType = storyWorkItemType
        };
        response.Warnings.AddRange(parsedDocument.Warnings);

        var epicDedup = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var featureDedup = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var storyDedup = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var epic in parsedDocument.Epics)
        {
            var epicTitle = NormalizeWorkItemTitle(epic.Title);
            if (string.IsNullOrWhiteSpace(epicTitle))
            {
                response.Errors.Add(new IntegracionArquitecturaHUCreationError
                {
                    Level = "Epic",
                    Title = epic.Title,
                    Operation = "Parse",
                    Message = "La epica no tiene titulo semantico valido.",
                    StatusCode = Status400BadRequest
                });
                continue;
            }

            if (!epicDedup.Add(epicTitle.Trim()))
            {
                response.Warnings.Add($"Epica duplicada omitida: {epicTitle}.");
                continue;
            }

            var epicFields = BuildBaseFields(
                epicTitle,
                epic.Description,
                command.IterationPath,
                command.AreaPath);

            int epicId;
            try
            {
                epicId = await azdoService.CreateWorkItemAsync(epicWorkItemType, epicFields);
            }
            catch (Exception exception)
            {
                var creationError = BuildCreationError(
                    "Epic",
                    epicTitle,
                    "CreateWorkItem",
                    exception);
                response.Errors.Add(creationError);
                LogPartialFailure(command, creationError, exception);
                continue;
            }

            response.EpicsCreated++;
            response.Ids.Epics.Add(new CreatedHierarchyWorkItem
            {
                Id = epicId,
                Title = epicTitle,
                WorkItemType = epicWorkItemType,
                Url = azdoService.WorkItemUrl(epicId),
                ParentId = null
            });

            foreach (var feature in epic.Features)
            {
                var featureTitle = NormalizeWorkItemTitle(feature.Title);
                if (string.IsNullOrWhiteSpace(featureTitle))
                {
                    response.Errors.Add(new IntegracionArquitecturaHUCreationError
                    {
                        Level = "Feature",
                        Title = feature.Title,
                        Operation = "Parse",
                        Message = "La feature no tiene titulo semantico valido.",
                        StatusCode = Status400BadRequest,
                        ParentId = epicId
                    });
                    continue;
                }

                var featureDedupKey = $"{epicId}|{featureTitle.Trim()}";
                if (!featureDedup.Add(featureDedupKey))
                {
                    response.Warnings.Add(
                        $"Feature duplicada omitida bajo la epica {epicId}: {featureTitle}.");
                    continue;
                }

                var featureFields = BuildBaseFields(
                    featureTitle,
                    feature.Description,
                    command.IterationPath,
                    command.AreaPath);

                int featureId;
                try
                {
                    featureId = await azdoService.CreateWorkItemAsync(
                        featureWorkItemType,
                        featureFields);
                }
                catch (Exception exception)
                {
                    var creationError = BuildCreationError(
                        "Feature",
                        featureTitle,
                        "CreateWorkItem",
                        exception,
                        epicId);
                    response.Errors.Add(creationError);
                    LogPartialFailure(command, creationError, exception);
                    continue;
                }

                response.FeaturesCreated++;
                response.Ids.Features.Add(new CreatedHierarchyWorkItem
                {
                    Id = featureId,
                    Title = featureTitle,
                    WorkItemType = featureWorkItemType,
                    Url = azdoService.WorkItemUrl(featureId),
                    ParentId = epicId
                });

                try
                {
                    await azdoService.LinkParentAsync(featureId, epicId);
                }
                catch (Exception exception)
                {
                    var creationError = BuildCreationError(
                        "Feature",
                        featureTitle,
                        "LinkParent",
                        exception,
                        epicId);
                    response.Errors.Add(creationError);
                    LogPartialFailure(command, creationError, exception);
                }

                foreach (var story in feature.Stories)
                {
                    var storyTitle = BuildStoryTitle(story);
                    if (string.IsNullOrWhiteSpace(storyTitle))
                    {
                        response.Errors.Add(new IntegracionArquitecturaHUCreationError
                        {
                            Level = "Story",
                            Title = story.Title,
                            Operation = "Parse",
                            Message = "La historia no tiene titulo semantico valido.",
                            StatusCode = Status400BadRequest,
                            ParentId = featureId
                        });
                        continue;
                    }

                    var storyDedupKey = $"{featureId}|{storyTitle.Trim()}";
                    if (!storyDedup.Add(storyDedupKey))
                    {
                        response.Warnings.Add(
                            $"Historia duplicada omitida bajo la feature {featureId}: {storyTitle}.");
                        continue;
                    }

                    var storyDescription = story.Description;
                    if (!supportsAcceptanceCriteriaField
                        && !string.IsNullOrWhiteSpace(story.AcceptanceCriteria))
                    {
                        storyDescription = AppendAcceptanceCriteriaToDescription(
                            storyDescription,
                            story.AcceptanceCriteria);
                    }

                    var storyFields = BuildBaseFields(
                        storyTitle,
                        storyDescription,
                        command.IterationPath,
                        command.AreaPath);

                    if (supportsAcceptanceCriteriaField
                        && !string.IsNullOrWhiteSpace(story.AcceptanceCriteria))
                    {
                        storyFields["Microsoft.VSTS.Common.AcceptanceCriteria"] =
                            ConvertAcceptanceCriteriaToAzdoHtml(story.AcceptanceCriteria);
                    }

                    int storyId;
                    try
                    {
                        storyId = await azdoService.CreateWorkItemAsync(
                            storyWorkItemType,
                            storyFields);
                    }
                    catch (Exception exception)
                    {
                        var creationError = BuildCreationError(
                            "Story",
                            storyTitle,
                            "CreateWorkItem",
                            exception,
                            featureId);
                        response.Errors.Add(creationError);
                        LogPartialFailure(command, creationError, exception);
                        continue;
                    }

                    response.StoriesCreated++;
                    response.Ids.Stories.Add(new CreatedHierarchyWorkItem
                    {
                        Id = storyId,
                        Title = storyTitle,
                        WorkItemType = storyWorkItemType,
                        Url = azdoService.WorkItemUrl(storyId),
                        ParentId = featureId
                    });

                    try
                    {
                        await azdoService.LinkParentAsync(storyId, featureId);
                    }
                    catch (Exception exception)
                    {
                        var creationError = BuildCreationError(
                            "Story",
                            storyTitle,
                            "LinkParent",
                            exception,
                            featureId);
                        response.Errors.Add(creationError);
                        LogPartialFailure(command, creationError, exception);
                    }
                }
            }
        }

        return response;
    }

    private async Task<T> ExecuteMetadataWithRetryAsync<T>(
        Func<Task<T>> operation,
        string operationName,
        CancellationToken cancellationToken)
    {
        var maxAttempts = _httpOptions.RetryCount + 1;
        var delay = TimeSpan.FromMilliseconds(_httpOptions.RetryDelayMilliseconds);
        Exception? lastException = null;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                return await operation();
            }
            catch (AzDoRequestException exception)
                when (attempt < maxAttempts && IsTransientStatusCode(exception.StatusCode))
            {
                lastException = exception;
                _logger.LogWarning(
                    "Operacion {Operation} fallo con estado transitorio {StatusCode}. Reintento {Attempt}/{MaxAttempts}.",
                    operationName,
                    exception.StatusCode,
                    attempt,
                    maxAttempts);
            }
            catch (TaskCanceledException exception)
                when (attempt < maxAttempts && !cancellationToken.IsCancellationRequested)
            {
                lastException = exception;
                _logger.LogWarning(
                    "Operacion {Operation} excedio el tiempo de espera. Reintento {Attempt}/{MaxAttempts}. ExceptionType: {ExceptionType}",
                    operationName,
                    attempt,
                    maxAttempts,
                    exception.GetType().Name);
            }
            catch (HttpRequestException exception) when (attempt < maxAttempts)
            {
                lastException = exception;
                _logger.LogWarning(
                    "Operacion {Operation} fallo por error de red. Reintento {Attempt}/{MaxAttempts}. ExceptionType: {ExceptionType}",
                    operationName,
                    attempt,
                    maxAttempts,
                    exception.GetType().Name);
            }
            if (attempt < maxAttempts)
            {
                if (delay > TimeSpan.Zero)
                    await Task.Delay(delay, cancellationToken);
                delay = TimeSpan.FromMilliseconds(
                    Math.Min(
                        delay.TotalMilliseconds * 2,
                        AzureDevOpsHttpOptions.MaxRetryDelayMilliseconds));
            }
        }

        throw lastException
            ?? new InvalidOperationException($"No se pudo completar la operacion {operationName}.");
    }

    private static bool IsTransientStatusCode(int statusCode) =>
        statusCode == Status408RequestTimeout
        || statusCode == Status429TooManyRequests
        || statusCode == Status500InternalServerError
        || statusCode == Status502BadGateway
        || statusCode == Status503ServiceUnavailable
        || statusCode == Status504GatewayTimeout;

    private static Dictionary<string, object?> BuildBaseFields(
        string title,
        string description,
        string iterationPath,
        string areaPath)
    {
        var fields = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["System.Title"] = title,
            ["System.IterationPath"] = iterationPath,
            ["System.AreaPath"] = areaPath
        };

        if (!string.IsNullOrWhiteSpace(description))
            fields["System.Description"] = ConvertMarkdownBlockToAzdoHtml(description);

        return fields;
    }

    private static string NormalizeWorkItemTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
            return string.Empty;

        var withoutNumbering = LeadingTitleNumberingRegex.Replace(title.Trim(), string.Empty);
        return withoutNumbering.Trim(' ', ':', '-', '.', ')', '(').Trim();
    }

    private static string BuildStoryTitle(MarkdownStoryNode story)
    {
        var baseTitle = NormalizeWorkItemTitle(story.Title);
        if (string.IsNullOrWhiteSpace(baseTitle))
            return string.Empty;

        var typePrefix = NormalizeStoryTypePrefix(story.StoryType, baseTitle);
        if (string.IsNullOrWhiteSpace(typePrefix))
            return baseTitle;

        if (baseTitle.StartsWith($"{typePrefix} ", StringComparison.OrdinalIgnoreCase)
            || baseTitle.StartsWith($"{typePrefix}-", StringComparison.OrdinalIgnoreCase)
            || baseTitle.StartsWith($"{typePrefix}:", StringComparison.OrdinalIgnoreCase))
        {
            return baseTitle;
        }

        return $"{typePrefix} - {baseTitle}";
    }

    private static string NormalizeStoryTypePrefix(string storyType, string storyTitle)
    {
        var normalizedStoryType = (storyType ?? string.Empty).Trim().ToUpperInvariant();
        if (normalizedStoryType is "NF" or "FUN")
            return normalizedStoryType;

        return InferStoryTypeFromTitle(storyTitle);
    }

    private static string InferStoryTypeFromTitle(string storyTitle)
    {
        if (string.IsNullOrWhiteSpace(storyTitle))
            return string.Empty;

        var normalized = storyTitle.Trim();
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

    private static string AppendAcceptanceCriteriaToDescription(
        string description,
        string acceptanceCriteria)
    {
        var cleanDescription = description?.Trim() ?? string.Empty;
        var cleanAcceptance = acceptanceCriteria?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(cleanAcceptance))
            return cleanDescription;

        var builder = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(cleanDescription))
        {
            builder.AppendLine(cleanDescription);
            builder.AppendLine();
        }

        builder.AppendLine("### Criterios de aceptacion");
        builder.AppendLine(FormatAcceptanceCriteriaMarkdownWithTitles(cleanAcceptance));
        return builder.ToString().Trim();
    }

    private static string ConvertAcceptanceCriteriaToAzdoHtml(string acceptanceCriteria)
    {
        if (string.IsNullOrWhiteSpace(acceptanceCriteria))
            return string.Empty;

        return ConvertMarkdownLinesToAzdoHtml(
            FormatAcceptanceCriteriaMarkdownWithTitles(acceptanceCriteria));
    }

    private static string ConvertMarkdownLinesToAzdoHtml(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        var lines = markdown
            .Trim()
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n')
            .Select(line => line.Trim())
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(RenderInlineMarkdownForAzdoHtml)
            .ToArray();

        return string.Join("<br />", lines);
    }

    private static string FormatAcceptanceCriteriaMarkdownWithTitles(string acceptanceCriteria)
    {
        if (string.IsNullOrWhiteSpace(acceptanceCriteria))
            return string.Empty;

        var outputLines = new List<string>();
        var criterionNumber = 0;
        var lines = acceptanceCriteria
            .Trim()
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n');

        foreach (var rawLine in lines)
        {
            var line = NormalizeAcceptanceCriteriaLine(rawLine);
            if (string.IsNullOrWhiteSpace(line))
                continue;

            if (IsAcceptanceCriterionStart(line))
            {
                criterionNumber++;
                outputLines.Add($"**AC-{criterionNumber:00}**");
            }

            outputLines.Add(line);
        }

        return string.Join("\n", outputLines);
    }

    private static string NormalizeAcceptanceCriteriaLine(string line)
    {
        var cleanLine = line?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(cleanLine))
            return string.Empty;

        return TryGetMarkdownListItem(cleanLine, out var listItemText)
            ? listItemText.Trim()
            : cleanLine;
    }

    private static bool IsAcceptanceCriterionStart(string line) =>
        !string.IsNullOrWhiteSpace(line) && AcceptanceCriterionStartRegex.IsMatch(line);

    private static string ConvertMarkdownBlockToAzdoHtml(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        var lines = markdown
            .Trim()
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n');

        var builder = new StringBuilder();
        var paragraphLines = new List<string>();

        void FlushParagraph()
        {
            if (paragraphLines.Count == 0)
                return;

            builder.Append("<p>");
            builder.Append(string.Join("<br />", paragraphLines.Select(RenderInlineMarkdownForAzdoHtml)));
            builder.AppendLine("</p>");
            paragraphLines.Clear();
        }

        foreach (var rawLine in lines)
        {
            var line = rawLine.TrimEnd();
            if (string.IsNullOrWhiteSpace(line))
            {
                FlushParagraph();
                continue;
            }

            if (TryGetMarkdownHeading(line, out var headingLevel, out var headingText))
            {
                FlushParagraph();
                var headingTag = Math.Clamp(headingLevel, 1, 6);
                builder.Append("<h");
                builder.Append(headingTag);
                builder.Append('>');
                builder.Append(RenderInlineMarkdownForAzdoHtml(headingText));
                builder.Append("</h");
                builder.Append(headingTag);
                builder.AppendLine(">");
                continue;
            }

            if (TryGetMarkdownListItem(line, out var listItemText))
            {
                paragraphLines.Add(listItemText.Trim());
                continue;
            }

            paragraphLines.Add(line.Trim());
        }

        FlushParagraph();
        return builder.ToString().Trim();
    }

    private static bool TryGetMarkdownHeading(string line, out int level, out string text)
    {
        level = 0;
        text = string.Empty;

        var match = MarkdownHeadingRegex.Match(line);
        if (!match.Success)
            return false;

        level = match.Groups["level"].Value.Length;
        text = match.Groups["text"].Value.Trim();
        return !string.IsNullOrWhiteSpace(text);
    }

    private static bool TryGetMarkdownListItem(string line, out string text)
    {
        text = string.Empty;

        var unorderedMatch = MarkdownUnorderedListRegex.Match(line);
        if (unorderedMatch.Success)
        {
            text = unorderedMatch.Groups["text"].Value.Trim();
            return !string.IsNullOrWhiteSpace(text);
        }

        var orderedMatch = MarkdownOrderedListRegex.Match(line);
        if (orderedMatch.Success)
        {
            text = orderedMatch.Groups["text"].Value.Trim();
            return !string.IsNullOrWhiteSpace(text);
        }

        return false;
    }

    private static string RenderInlineMarkdownForAzdoHtml(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return string.Empty;

        var encoded = WebUtility.HtmlEncode(text.Trim()) ?? string.Empty;
        encoded = MarkdownInlineCodeRegex.Replace(encoded, "<code>${text}</code>");
        encoded = MarkdownBoldAsteriskRegex.Replace(encoded, "<strong>${text}</strong>");
        encoded = MarkdownBoldUnderscoreRegex.Replace(encoded, "<strong>${text}</strong>");
        return encoded;
    }

    private static IntegracionArquitecturaHUCreationError BuildCreationError(
        string level,
        string title,
        string operation,
        Exception exception,
        int? parentId = null)
    {
        if (exception is AzDoRequestException azdoException)
        {
            return new IntegracionArquitecturaHUCreationError
            {
                Level = level,
                Title = title,
                Operation = operation,
                Message = AzureDevOpsErrorMessageSanitizer.ToSafeCreationMessage(azdoException),
                StatusCode = azdoException.StatusCode,
                ParentId = parentId
            };
        }

        return new IntegracionArquitecturaHUCreationError
        {
            Level = level,
            Title = title,
            Operation = operation,
            Message = AzureDevOpsErrorMessageSanitizer.ToSafeCreationMessage(exception),
            StatusCode = null,
            ParentId = parentId
        };
    }

    private void LogPartialFailure(
        IntegrateArchitectureHuCommand command,
        IntegracionArquitecturaHUCreationError error,
        Exception exception)
    {
        _logger.LogWarning(
            "Operacion parcial de integracion fallo. CorrelationId: {CorrelationId}. Organization: {Organization}. Project: {Project}. Level: {Level}. Operation: {Operation}. StatusCode: {StatusCode}. ParentId: {ParentId}. ExceptionType: {ExceptionType}",
            command.CorrelationId,
            command.Organization,
            command.Project,
            error.Level,
            error.Operation,
            error.StatusCode,
            error.ParentId,
            exception.GetType().Name);
    }
}
