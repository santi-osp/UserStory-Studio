using API_HistoriasUsuarioIA_funcion.Application.UseCases.SearchWorkItems;

namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para buscar Work Items sin exponer detalles REST de Azure DevOps.
/// </summary>
public interface IAzureDevOpsWorkItemSearchGateway
{
    Task<SearchWorkItemsResponse> SearchAsync(
        SearchWorkItemsQuery query,
        CancellationToken cancellationToken);
}
