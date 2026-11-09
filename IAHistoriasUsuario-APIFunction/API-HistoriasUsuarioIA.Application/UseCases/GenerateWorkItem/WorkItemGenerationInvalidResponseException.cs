namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;

/// <summary>
/// Indica que el JSON generado no contiene la sección de Work Item requerida.
/// </summary>
public sealed class WorkItemGenerationInvalidResponseException : Exception
{
    public WorkItemGenerationInvalidResponseException()
        : base("El JSON generado no contiene un Work Item válido.")
    {
    }
}
