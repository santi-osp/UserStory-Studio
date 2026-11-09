namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;

/// <summary>
/// Datos necesarios para evaluar un Work Item.
/// </summary>
public sealed record EvaluateWorkItemCommand(
    string Organization,
    string Project,
    int WorkItemId,
    string? RequestedModel,
    string? Prompt,
    string? SystemPrompt,
    string AzurePat,
    string CorrelationId,
    string ClientApp);
