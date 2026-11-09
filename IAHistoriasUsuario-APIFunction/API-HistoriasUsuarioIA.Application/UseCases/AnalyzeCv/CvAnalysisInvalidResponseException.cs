namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;

/// <summary>
/// Indica que la IA no devolvio el esquema esperado para el analisis de CV.
/// </summary>
public sealed class CvAnalysisInvalidResponseException : Exception
{
    public CvAnalysisInvalidResponseException(Exception? innerException = null)
        : base("La respuesta de IA no pudo convertirse al esquema de analisis de hoja de vida.", innerException)
    {
    }
}
