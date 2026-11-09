using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;

/// <summary>
/// Orquesta el parsing, la validación y la creación de la jerarquía arquitectura-HU.
/// </summary>
public sealed class IntegrateArchitectureHuUseCase : IIntegrateArchitectureHuUseCase
{
    private const int PreviewLinesWithDetectedEpics = 12;
    private const int PreviewLinesWithoutDetectedEpics = 15;

    private readonly IArchitectureHuParser _parser;
    private readonly IAzureDevOpsArchitectureWorkItemGateway _workItemGateway;
    private readonly ILogger<IntegrateArchitectureHuUseCase> _logger;

    public IntegrateArchitectureHuUseCase(
        IArchitectureHuParser parser,
        IAzureDevOpsArchitectureWorkItemGateway workItemGateway,
        ILogger<IntegrateArchitectureHuUseCase> logger)
    {
        _parser = parser;
        _workItemGateway = workItemGateway;
        _logger = logger;
    }

    public IntegrateArchitectureHuPreparation Prepare(
        string markdown,
        bool validateOnly)
    {
        var parsedDocument = _parser.Parse(markdown);
        if (!validateOnly)
            return new IntegrateArchitectureHuPreparation(parsedDocument, null);

        var allStories = parsedDocument.Epics
            .SelectMany(epic => epic.Features)
            .SelectMany(feature => feature.Stories)
            .ToArray();

        var functionalStories = allStories.Count(story => ResolveStoryTypeForSummary(story) == "FUN");
        var nonFunctionalStories = allStories.Count(story => ResolveStoryTypeForSummary(story) == "NF");

        var summary = new ArchitectureHuParsedSummary
        {
            Epics = parsedDocument.Epics.Count,
            Features = parsedDocument.Epics.Sum(epic => epic.Features.Count),
            Stories = allStories.Length,
            FunctionalStories = functionalStories,
            NonFunctionalStories = nonFunctionalStories,
            UnknownStories = allStories.Length - functionalStories - nonFunctionalStories
        };

        var hasEpics = parsedDocument.Epics.Count > 0;
        var validationResponse = new ArchitectureHuValidationResponse
        {
            Parsed = summary,
            Warnings = parsedDocument.Warnings,
            MarkdownPreview = BuildMarkdownPreview(
                markdown,
                hasEpics ? PreviewLinesWithDetectedEpics : PreviewLinesWithoutDetectedEpics),
            Message = hasEpics
                ? "Validacion de parseo completada sin crear work items."
                : "Validacion completada con advertencias: no se detectaron epicas."
        };

        return new IntegrateArchitectureHuPreparation(parsedDocument, validationResponse);
    }

    public async Task<IntegracionArquitecturaHUCreateResponse> ExecuteAsync(
        IntegrateArchitectureHuCommand command,
        IntegrateArchitectureHuPreparation preparation,
        CancellationToken cancellationToken)
    {
        var parsedFeatures = preparation.ParsedDocument.Epics.Sum(epic => epic.Features.Count);
        var parsedStories = preparation.ParsedDocument.Epics.Sum(
            epic => epic.Features.Sum(feature => feature.Stories.Count));

        _logger.LogInformation(
            "Inicio importacion markdown. CorrelationId: {CorrelationId}. Organization: {Organization}. Project: {Project}. ParsedEpics: {ParsedEpics}. ParsedFeatures: {ParsedFeatures}. ParsedStories: {ParsedStories}",
            command.CorrelationId,
            command.Organization,
            command.Project,
            preparation.ParsedDocument.Epics.Count,
            parsedFeatures,
            parsedStories);

        var response = await _workItemGateway.CreateHierarchyAsync(
            command,
            preparation.ParsedDocument,
            cancellationToken);

        _logger.LogInformation(
            "Importacion markdown completada. CorrelationId: {CorrelationId}. EpicsCreated: {EpicsCreated}. FeaturesCreated: {FeaturesCreated}. StoriesCreated: {StoriesCreated}. Errors: {Errors}",
            command.CorrelationId,
            response.EpicsCreated,
            response.FeaturesCreated,
            response.StoriesCreated,
            response.Errors.Count);

        return response;
    }

    private static string ResolveStoryTypeForSummary(MarkdownStoryNode story)
    {
        var fromMetadata = (story.StoryType ?? string.Empty).Trim().ToUpperInvariant();
        if (fromMetadata is "FUN" or "NF")
            return fromMetadata;

        return InferStoryTypeFromTitle(story.Title);
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

    private static string[] BuildMarkdownPreview(string markdownContent, int maxLines)
    {
        if (string.IsNullOrWhiteSpace(markdownContent) || maxLines <= 0)
            return [];

        return markdownContent
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n')
            .Take(maxLines)
            .Select(line => line.TrimEnd())
            .ToArray();
    }
}
