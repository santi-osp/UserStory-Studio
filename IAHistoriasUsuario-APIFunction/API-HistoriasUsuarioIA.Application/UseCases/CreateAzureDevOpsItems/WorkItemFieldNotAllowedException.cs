namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

/// <summary>
/// Indica que el request intento establecer un campo dinamico protegido.
/// </summary>
public sealed class WorkItemFieldNotAllowedException : Exception
{
    public WorkItemFieldNotAllowedException()
        : base("La solicitud contiene campos de work item no permitidos.")
    {
    }

    public WorkItemFieldNotAllowedException(string message, IReadOnlyList<string> fieldNames)
        : base(message)
    {
        FieldNames = fieldNames;
    }

    public IReadOnlyList<string> FieldNames { get; } = [];
}
