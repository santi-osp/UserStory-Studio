using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemDiscussionComments;

namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para consultar comentarios de discusion sin exponer detalles REST.
/// </summary>
public interface IAzureDevOpsWorkItemDiscussionCommentsGateway
{
    Task<WorkItemsDiscussionCommentsResponse> GetDiscussionCommentsAsync(
        GetAzdoWorkItemDiscussionCommentsQuery query,
        CancellationToken cancellationToken);
}
