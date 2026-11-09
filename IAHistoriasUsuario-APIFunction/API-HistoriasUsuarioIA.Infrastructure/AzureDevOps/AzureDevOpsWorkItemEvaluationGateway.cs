using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

/// <summary>
/// Adaptador Azure DevOps para obtener los campos de un Work Item usados en evaluación.
/// </summary>
public sealed class AzureDevOpsWorkItemEvaluationGateway : IAzureDevOpsWorkItemEvaluationGateway
{
    private readonly IAzDoServiceFactory _azdoServiceFactory;
    private readonly ILogger<AzureDevOpsWorkItemEvaluationGateway> _logger;

    public AzureDevOpsWorkItemEvaluationGateway(
        IAzDoServiceFactory azdoServiceFactory,
        ILogger<AzureDevOpsWorkItemEvaluationGateway> logger)
    {
        _azdoServiceFactory = azdoServiceFactory;
        _logger = logger;
    }

    public async Task<WorkItemEvaluationSource> GetEvaluationSourceAsync(
        EvaluateWorkItemCommand command,
        CancellationToken cancellationToken)
    {
        var azdoService = _azdoServiceFactory.Create(
            command.Organization,
            command.Project,
            command.AzurePat,
            _logger);

        var workItem = await azdoService.GetWorkItemDetailsAsync(
            command.WorkItemId,
            cancellationToken);

        return new WorkItemEvaluationSource(
            workItem,
            azdoService.WorkItemUrl(workItem.Id));
    }
}
