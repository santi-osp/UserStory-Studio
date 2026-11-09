using API_HistoriasUsuarioIA_funcion;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemDiscussionComments;

/// <summary>
/// Caso de uso para consultar comentarios de discusion de uno o varios work items.
/// </summary>
public interface IGetAzdoWorkItemDiscussionCommentsUseCase
{
    Task<WorkItemsDiscussionCommentsResponse> ExecuteAsync(
        GetAzdoWorkItemDiscussionCommentsQuery query,
        CancellationToken cancellationToken);
}
