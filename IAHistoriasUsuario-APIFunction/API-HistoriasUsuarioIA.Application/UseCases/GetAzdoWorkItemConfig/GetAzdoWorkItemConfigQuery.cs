namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemConfig;

/// <summary>
/// Datos necesarios para consultar la configuración dinámica de un work item.
/// </summary>
public sealed record GetAzdoWorkItemConfigQuery(
    string Organization,
    string Project,
    string RequestedWorkItemType,
    string AzurePat,
    string CorrelationId,
    string ClientApp);
