namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para analizar un CV sin exponer detalles del proveedor de IA.
/// </summary>
public interface ICvAnalysisAiGateway
{
    Task<CvAnalysisAiGatewayResponse> AnalyzeAsync(
        string prompt,
        string? requestedModel,
        CancellationToken cancellationToken);
}

public sealed record CvAnalysisAiGatewayResponse(
    string Model,
    string JsonPayloadText);
