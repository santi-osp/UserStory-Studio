using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemDiscussionComments;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

/// <summary>
/// Adaptador Azure DevOps para consultar comentarios de discusion de work items.
/// </summary>
public sealed class AzureDevOpsWorkItemDiscussionCommentsGateway
    : IAzureDevOpsWorkItemDiscussionCommentsGateway
{
    private readonly IAzDoServiceFactory _azdoServiceFactory;
    private readonly ILogger<AzureDevOpsWorkItemDiscussionCommentsGateway> _logger;

    public AzureDevOpsWorkItemDiscussionCommentsGateway(
        IAzDoServiceFactory azdoServiceFactory,
        ILogger<AzureDevOpsWorkItemDiscussionCommentsGateway> logger)
    {
        _azdoServiceFactory = azdoServiceFactory;
        _logger = logger;
    }

    public async Task<WorkItemsDiscussionCommentsResponse> GetDiscussionCommentsAsync(
        GetAzdoWorkItemDiscussionCommentsQuery query,
        CancellationToken cancellationToken)
    {
        var azdoService = _azdoServiceFactory.Create(
            query.Organization,
            query.Project,
            query.AzurePat,
            _logger);

        return await azdoService.GetWorkItemsDiscussionCommentsAsync(
            query.WorkItemIds,
            cancellationToken);
    }
}
