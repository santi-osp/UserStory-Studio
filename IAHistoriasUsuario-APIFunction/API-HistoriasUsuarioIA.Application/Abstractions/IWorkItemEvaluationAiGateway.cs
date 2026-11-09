namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para evaluar un Work Item sin exponer detalles del proveedor de IA.
/// </summary>
public interface IWorkItemEvaluationAiGateway
{
    Task<WorkItemEvaluationAiResponse> EvaluateAsync(
        AzdoWorkItemDetails workItem,
        string? prompt,
        string? systemPrompt,
        string? requestedModel,
        CancellationToken cancellationToken);
}

public sealed record WorkItemEvaluationAiResponse(
    string Model,
    string JsonPayloadText);
