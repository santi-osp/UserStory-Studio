using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.SearchWorkItems;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

/// <summary>
/// Adaptador Azure DevOps para la busqueda de Work Items.
/// </summary>
public sealed class AzureDevOpsWorkItemSearchGateway : IAzureDevOpsWorkItemSearchGateway
{
    private readonly IAzDoServiceFactory _azdoServiceFactory;
    private readonly ILogger<AzureDevOpsWorkItemSearchGateway> _logger;

    public AzureDevOpsWorkItemSearchGateway(
        IAzDoServiceFactory azdoServiceFactory,
        ILogger<AzureDevOpsWorkItemSearchGateway> logger)
    {
        _azdoServiceFactory = azdoServiceFactory;
        _logger = logger;
    }

    public async Task<SearchWorkItemsResponse> SearchAsync(
        SearchWorkItemsQuery query,
        CancellationToken cancellationToken)
    {
        var azdoService = _azdoServiceFactory.Create(
            query.Organization,
            query.Project,
            query.AzurePat,
            _logger);

        var items = await azdoService.SearchWorkItemsAsync(
            query.Project,
            query.AreaPath,
            query.IterationPath,
            query.SearchText,
            query.Top,
            cancellationToken);

        return new SearchWorkItemsResponse
        {
            Project = query.Project,
            Count = items.Count,
            Items = items
        };
    }
}
