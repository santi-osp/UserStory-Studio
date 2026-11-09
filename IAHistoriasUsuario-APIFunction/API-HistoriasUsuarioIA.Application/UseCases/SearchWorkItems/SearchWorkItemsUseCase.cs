using API_HistoriasUsuarioIA_funcion;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.SearchWorkItems;

/// <summary>
/// Orquesta la busqueda de Work Items usando el servicio Azure DevOps existente.
/// </summary>
public sealed class SearchWorkItemsUseCase : ISearchWorkItemsUseCase
{
    private readonly IAzureDevOpsWorkItemSearchGateway _workItemSearchGateway;
    private readonly ILogger<SearchWorkItemsUseCase> _logger;

    public SearchWorkItemsUseCase(
        IAzureDevOpsWorkItemSearchGateway workItemSearchGateway,
        ILogger<SearchWorkItemsUseCase> logger)
    {
        _workItemSearchGateway = workItemSearchGateway;
        _logger = logger;
    }

    public async Task<SearchWorkItemsResponse> ExecuteAsync(
        SearchWorkItemsQuery query,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Inicio busqueda Work Item. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Organization: {Organization}. Project: {Project}. HasArea: {HasArea}. HasIteration: {HasIteration}. SearchChars: {SearchChars}. Top: {Top}",
            query.CorrelationId,
            query.ClientApp,
            query.Organization,
            query.Project,
            !string.IsNullOrWhiteSpace(query.AreaPath),
            !string.IsNullOrWhiteSpace(query.IterationPath),
            query.SearchText?.Trim().Length ?? 0,
            query.Top);

        var response = await _workItemSearchGateway.SearchAsync(query, cancellationToken);

        _logger.LogInformation(
            "Busqueda Work Item completada. CorrelationId: {CorrelationId}. Project: {Project}. Count: {Count}",
            query.CorrelationId,
            query.Project,
            response.Count);

        return response;
    }
}
