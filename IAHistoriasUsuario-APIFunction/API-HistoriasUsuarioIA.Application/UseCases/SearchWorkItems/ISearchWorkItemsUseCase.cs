using API_HistoriasUsuarioIA_funcion;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.SearchWorkItems;

/// <summary>
/// Caso de uso para buscar Work Items livianas para selectores de UI.
/// </summary>
public interface ISearchWorkItemsUseCase
{
    Task<SearchWorkItemsResponse> ExecuteAsync(
        SearchWorkItemsQuery query,
        CancellationToken cancellationToken);
}
