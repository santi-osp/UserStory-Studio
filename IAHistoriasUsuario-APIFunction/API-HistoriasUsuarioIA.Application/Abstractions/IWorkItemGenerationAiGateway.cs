namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para generar un Work Item sin exponer detalles del proveedor de IA.
/// </summary>
public interface IWorkItemGenerationAiGateway
{
    Task<WorkItemGenerationAiResponse> GenerateAsync(
        string prompt,
        string? systemPrompt,
        string? requestedModel,
        string operation,
        CancellationToken cancellationToken);
}

public sealed record WorkItemGenerationAiResponse(
    string Model,
    string RawOutputText,
    string JsonPayloadText);
