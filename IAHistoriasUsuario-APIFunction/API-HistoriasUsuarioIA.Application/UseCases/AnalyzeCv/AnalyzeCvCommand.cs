namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;

/// <summary>
/// Datos necesarios para analizar una hoja de vida.
/// </summary>
public sealed record AnalyzeCvCommand(
    string Text,
    string? Model,
    string FileName,
    string Source,
    int? PageCount,
    string CorrelationId,
    string ClientApp);
