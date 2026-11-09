namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;

/// <summary>
/// Caso de uso para analizar y normalizar una hoja de vida mediante IA.
/// </summary>
public interface IAnalyzeCvUseCase
{
    Task<CvAnalysisResponse> ExecuteAsync(
        AnalyzeCvCommand command,
        CancellationToken cancellationToken);
}
