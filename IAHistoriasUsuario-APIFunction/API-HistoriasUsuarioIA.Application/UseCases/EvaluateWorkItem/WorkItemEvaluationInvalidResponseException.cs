namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;

/// <summary>
/// Indica que la salida de IA no pudo convertirse al contrato de evaluación.
/// </summary>
public sealed class WorkItemEvaluationInvalidResponseException : Exception
{
    public WorkItemEvaluationInvalidResponseException(
        string model,
        int jsonPayloadLength,
        Exception? innerException = null)
        : base("La respuesta de IA no pudo convertirse al esquema de evaluación.", innerException)
    {
        Model = model;
        JsonPayloadLength = jsonPayloadLength;
    }

    public string Model { get; }

    public int JsonPayloadLength { get; }
}
