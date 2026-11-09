using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;

/// <summary>
/// Orquesta la obtención del Work Item, su evaluación con IA y la normalización del resultado.
/// </summary>
public sealed class EvaluateWorkItemUseCase : IEvaluateWorkItemUseCase
{
    // El contrato funcional de evaluacion limita cada seccion a cinco hallazgos.
    private const int MaximumItemsPerSection = 5;

    private readonly IAzureDevOpsWorkItemEvaluationGateway _azureDevOpsGateway;
    private readonly IWorkItemEvaluationAiGateway _aiGateway;
    private readonly ILogger<EvaluateWorkItemUseCase> _logger;
    private readonly JsonPayloadSerializer _jsonSerializer;

    public EvaluateWorkItemUseCase(
        IAzureDevOpsWorkItemEvaluationGateway azureDevOpsGateway,
        IWorkItemEvaluationAiGateway aiGateway,
        ILogger<EvaluateWorkItemUseCase> logger,
        JsonPayloadSerializer jsonSerializer)
    {
        _azureDevOpsGateway = azureDevOpsGateway;
        _aiGateway = aiGateway;
        _logger = logger;
        _jsonSerializer = jsonSerializer;
    }

    public async Task<EvaluateWorkItemResponse> ExecuteAsync(
        EvaluateWorkItemCommand command,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Inicio evaluación Work Item. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Organization: {Organization}. Project: {Project}. WorkItemId: {WorkItemId}. Model: {Model}",
            command.CorrelationId,
            command.ClientApp,
            command.Organization,
            command.Project,
            command.WorkItemId,
            string.IsNullOrWhiteSpace(command.RequestedModel) ? "(default)" : command.RequestedModel.Trim());

        var source = await _azureDevOpsGateway.GetEvaluationSourceAsync(command, cancellationToken);
        var aiResult = await _aiGateway.EvaluateAsync(
            source.WorkItem,
            command.Prompt,
            command.SystemPrompt,
            command.RequestedModel,
            cancellationToken);

        WorkItemEvaluationResult? evaluation;
        try
        {
            evaluation = JsonSerializer.Deserialize<WorkItemEvaluationResult>(
                aiResult.JsonPayloadText,
                _jsonSerializer.Options);
        }
        catch (JsonException ex)
        {
            throw new WorkItemEvaluationInvalidResponseException(
                aiResult.Model,
                aiResult.JsonPayloadText.Length,
                ex);
        }

        if (evaluation is null)
        {
            throw new WorkItemEvaluationInvalidResponseException(
                aiResult.Model,
                aiResult.JsonPayloadText.Length);
        }

        var normalizedEvaluation = NormalizeEvaluation(evaluation);
        var response = new EvaluateWorkItemResponse
        {
            WorkItemId = source.WorkItem.Id,
            WorkItemUrl = source.WorkItemUrl,
            Title = source.WorkItem.Title,
            WorkItemType = source.WorkItem.WorkItemType,
            State = source.WorkItem.State,
            Model = aiResult.Model,
            Evaluation = normalizedEvaluation
        };

        _logger.LogInformation(
            "Evaluacion Work Item completada. CorrelationId: {CorrelationId}. WorkItemId: {WorkItemId}. Score: {Score}. QualityLevel: {QualityLevel}. Readiness: {Readiness}.",
            command.CorrelationId,
            source.WorkItem.Id,
            normalizedEvaluation.QualityScore,
            normalizedEvaluation.QualityLevel,
            normalizedEvaluation.Readiness);

        return response;
    }

    private static WorkItemEvaluationResult NormalizeEvaluation(WorkItemEvaluationResult evaluation)
    {
        var score = evaluation.QualityScore <= 0
            ? 1
            : Math.Clamp(evaluation.QualityScore, 1, 5);

        return new WorkItemEvaluationResult
        {
            Summary = NormalizeText(evaluation.Summary),
            QualityScore = score,
            QualityLevel = NormalizeAllowed(evaluation.QualityLevel, ["Alta", "Media", "Baja"], ResolveQualityLevel(score)),
            Readiness = NormalizeAllowed(
                evaluation.Readiness,
                ["Lista para desarrollo", "Requiere ajustes menores", "Requiere refinamiento", "Incompleta"],
                "Requiere refinamiento"),
            MainFindings = NormalizeItems(evaluation.MainFindings, MaximumItemsPerSection),
            Risks = NormalizeItems(evaluation.Risks, MaximumItemsPerSection),
            Ambiguities = NormalizeItems(evaluation.Ambiguities, MaximumItemsPerSection),
            MissingInformation = NormalizeItems(evaluation.MissingInformation, MaximumItemsPerSection),
            AcceptanceCriteriaFindings = NormalizeItems(evaluation.AcceptanceCriteriaFindings, MaximumItemsPerSection),
            EdgeCases = NormalizeItems(evaluation.EdgeCases, MaximumItemsPerSection),
            Dependencies = NormalizeItems(evaluation.Dependencies, MaximumItemsPerSection),
            DataValidations = NormalizeItems(evaluation.DataValidations, MaximumItemsPerSection),
            SecurityConsiderations = NormalizeItems(evaluation.SecurityConsiderations, MaximumItemsPerSection),
            ObservabilityConsiderations = NormalizeItems(evaluation.ObservabilityConsiderations, MaximumItemsPerSection),
            Recommendations = NormalizeItems(evaluation.Recommendations, MaximumItemsPerSection),
            RefinementQuestions = NormalizeItems(evaluation.RefinementQuestions, MaximumItemsPerSection),
            SuggestedAcceptanceCriteria = NormalizeItems(evaluation.SuggestedAcceptanceCriteria, MaximumItemsPerSection),
            ImprovedVersion = new WorkItemImprovedVersion
            {
                SuggestedTitle = NormalizeText(evaluation.ImprovedVersion?.SuggestedTitle),
                SuggestedDescription = NormalizeText(evaluation.ImprovedVersion?.SuggestedDescription),
                SuggestedAcceptanceCriteria = NormalizeItems(
                    evaluation.ImprovedVersion?.SuggestedAcceptanceCriteria,
                    MaximumItemsPerSection)
            },
            RefinementPriority = NormalizeRefinementPriority(evaluation.RefinementPriority),
            Conclusion = NormalizeText(evaluation.Conclusion)
        };
    }

    private static List<string> NormalizeItems(IEnumerable<string>? items, int maxItems)
    {
        if (items is null || maxItems <= 0)
            return [];

        var results = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in items)
        {
            var normalized = NormalizeText(item);
            if (string.IsNullOrWhiteSpace(normalized) || !seen.Add(normalized))
                continue;

            results.Add(normalized);
            if (results.Count >= maxItems)
                break;
        }

        return results;
    }

    private static string NormalizeText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();

    private static string NormalizeAllowed(string? value, string[] allowedValues, string fallback)
    {
        var normalized = NormalizeText(value);
        if (string.IsNullOrWhiteSpace(normalized))
            return fallback;

        return allowedValues.FirstOrDefault(candidate => candidate.Equals(normalized, StringComparison.OrdinalIgnoreCase))
            ?? fallback;
    }

    private static string ResolveQualityLevel(int score)
    {
        if (score >= 4)
            return "Alta";

        if (score >= 3)
            return "Media";

        return "Baja";
    }

    private static string NormalizeRefinementPriority(string? value)
    {
        var normalized = NormalizeText(value);
        if (normalized.Equals("Critica", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("Cr\u00EDtica", StringComparison.OrdinalIgnoreCase))
        {
            return "Cr\u00EDtica";
        }

        return NormalizeAllowed(normalized, ["Alta", "Media", "Baja"], "Media");
    }
}
