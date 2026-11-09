using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemConfig;

namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para consultar configuracion de work items sin exponer detalles REST.
/// </summary>
public interface IAzureDevOpsWorkItemConfigGateway
{
    Task<WorkItemConfigResponse> GetWorkItemConfigAsync(
        GetAzdoWorkItemConfigQuery query,
        CancellationToken cancellationToken);
}
