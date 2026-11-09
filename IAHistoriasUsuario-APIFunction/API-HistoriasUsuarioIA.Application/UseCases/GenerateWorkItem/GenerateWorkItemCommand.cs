namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;

/// <summary>
/// Datos necesarios para generar un Work Item con IA.
/// </summary>
public sealed record GenerateWorkItemCommand(
    string Prompt,
    string SystemPrompt,
    string? RequestedModel,
    string CorrelationId,
    string ClientApp);
