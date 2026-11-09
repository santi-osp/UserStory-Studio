using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemConfig;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

/// <summary>
/// Adaptador Azure DevOps para consultar y preparar configuración dinámica de work items.
/// </summary>
public sealed class AzureDevOpsWorkItemConfigGateway : IAzureDevOpsWorkItemConfigGateway
{
    private readonly IAzDoServiceFactory _azdoServiceFactory;
    private readonly ILogger<AzureDevOpsWorkItemConfigGateway> _logger;

    public AzureDevOpsWorkItemConfigGateway(
        IAzDoServiceFactory azdoServiceFactory,
        ILogger<AzureDevOpsWorkItemConfigGateway> logger)
    {
        _azdoServiceFactory = azdoServiceFactory;
        _logger = logger;
    }

    public async Task<WorkItemConfigResponse> GetWorkItemConfigAsync(
        GetAzdoWorkItemConfigQuery query,
        CancellationToken cancellationToken)
    {
        var azdoService = _azdoServiceFactory.Create(
            query.Organization,
            query.Project,
            query.AzurePat,
            _logger);

        var workItemConfig = await azdoService.GetWorkItemConfigAsync(
            query.Project,
            query.RequestedWorkItemType);

        var isTestCase = workItemConfig.WorkItemType.Equals(
            AzureDevOpsProtocol.TestCaseWorkItemType,
            StringComparison.OrdinalIgnoreCase);
        var dynamicUiFields = isTestCase
            ? workItemConfig.Fields
                .Where(field => field.ReferenceName.Equals(AzureDevOpsProtocol.StateReferenceName, StringComparison.OrdinalIgnoreCase))
                .ToArray()
            : AzDoService.FilterFieldsForPlanningAndClassificationUi(workItemConfig.Fields);
        var hydratedDynamicUiFields = await azdoService.PopulateUiFieldOptionsAsync(
            query.Project,
            workItemConfig.WorkItemType,
            dynamicUiFields,
            cancellationToken);
        var responseFields = isTestCase
            ? hydratedDynamicUiFields
            : AzDoService.MergeContentAndDynamicUiFields(
                AzDoService.FilterContentFieldsForUi(workItemConfig.Fields),
                hydratedDynamicUiFields);

        return new WorkItemConfigResponse
        {
            Project = workItemConfig.Project,
            WorkItemType = workItemConfig.WorkItemType,
            Fields = responseFields
        };
    }
}
