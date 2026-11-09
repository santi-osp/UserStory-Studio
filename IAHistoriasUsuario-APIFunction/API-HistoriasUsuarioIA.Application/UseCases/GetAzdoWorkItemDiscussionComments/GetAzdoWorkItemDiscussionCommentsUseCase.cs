using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemDiscussionComments;

/// <summary>
/// Orquesta la consulta de comentarios de discusion mediante un gateway de Application.
/// </summary>
public sealed class GetAzdoWorkItemDiscussionCommentsUseCase : IGetAzdoWorkItemDiscussionCommentsUseCase
{
    private readonly IAzureDevOpsWorkItemDiscussionCommentsGateway _discussionCommentsGateway;
    private readonly ILogger<GetAzdoWorkItemDiscussionCommentsUseCase> _logger;

    public GetAzdoWorkItemDiscussionCommentsUseCase(
        IAzureDevOpsWorkItemDiscussionCommentsGateway discussionCommentsGateway,
        ILogger<GetAzdoWorkItemDiscussionCommentsUseCase> logger)
    {
        _discussionCommentsGateway = discussionCommentsGateway;
        _logger = logger;
    }

    public async Task<WorkItemsDiscussionCommentsResponse> ExecuteAsync(
        GetAzdoWorkItemDiscussionCommentsQuery query,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Inicio consulta comentarios de discusion. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Organization: {Organization}. Project: {Project}. RequestedWorkItems: {RequestedWorkItems}",
            query.CorrelationId,
            query.ClientApp,
            query.Organization,
            query.Project,
            query.WorkItemIds.Count);

        var response = await _discussionCommentsGateway.GetDiscussionCommentsAsync(query, cancellationToken);
        var totalComments = response.Items.Sum(item => item.Count);

        _logger.LogInformation(
            "Comentarios de discusion obtenidos. CorrelationId: {CorrelationId}. Project: {Project}. RequestedWorkItems: {RequestedWorkItems}. ReturnedItems: {ReturnedItems}. TotalComments: {TotalComments}",
            query.CorrelationId,
            response.Project,
            response.RequestedCount,
            response.Items.Count,
            totalComments);

        return response;
    }
}
