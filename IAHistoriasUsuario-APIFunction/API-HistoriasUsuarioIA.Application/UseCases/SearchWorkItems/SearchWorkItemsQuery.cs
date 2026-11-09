namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.SearchWorkItems;

/// <summary>
/// Datos necesarios para ejecutar la busqueda de Work Items en Azure DevOps.
/// </summary>
public sealed record SearchWorkItemsQuery(
    string Organization,
    string Project,
    string? AreaPath,
    string? IterationPath,
    string? SearchText,
    int Top,
    string AzurePat,
    string CorrelationId,
    string ClientApp);
