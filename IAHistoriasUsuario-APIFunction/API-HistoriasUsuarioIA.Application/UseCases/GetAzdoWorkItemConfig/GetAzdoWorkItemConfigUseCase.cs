using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemConfig;

/// <summary>
/// Orquesta la consulta de configuración dinámica mediante un gateway de Application.
/// </summary>
public sealed class GetAzdoWorkItemConfigUseCase : IGetAzdoWorkItemConfigUseCase
{
    private readonly IAzureDevOpsWorkItemConfigGateway _workItemConfigGateway;
    private readonly ILogger<GetAzdoWorkItemConfigUseCase> _logger;

    public GetAzdoWorkItemConfigUseCase(
        IAzureDevOpsWorkItemConfigGateway workItemConfigGateway,
        ILogger<GetAzdoWorkItemConfigUseCase> logger)
    {
        _workItemConfigGateway = workItemConfigGateway;
        _logger = logger;
    }

    public async Task<WorkItemConfigResponse> ExecuteAsync(
        GetAzdoWorkItemConfigQuery query,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Inicio consulta de configuración dinámica. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Organization: {Organization}. Project: {Project}. RequestedWorkItemType: {RequestedWorkItemType}",
            query.CorrelationId,
            query.ClientApp,
            query.Organization,
            query.Project,
            query.RequestedWorkItemType);

        var response = await _workItemConfigGateway.GetWorkItemConfigAsync(query, cancellationToken);

        _logger.LogInformation(
            "Configuracion dinamica obtenida. CorrelationId: {CorrelationId}. Project: {Project}. WorkItemType: {WorkItemType}. HydratedFields: {HydratedFields}. FieldsWithOptions: {FieldsWithOptions}. CustomPicklistsWithOptions: {CustomPicklistsWithOptions}",
            query.CorrelationId,
            response.Project,
            response.WorkItemType,
            response.Fields.Count,
            response.Fields.Count(field => field.Options.Length > 0),
            response.Fields.Count(field =>
                field.ReferenceName.StartsWith("Custom.", StringComparison.OrdinalIgnoreCase) &&
                field.Options.Length > 0));

        return response;
    }
}
