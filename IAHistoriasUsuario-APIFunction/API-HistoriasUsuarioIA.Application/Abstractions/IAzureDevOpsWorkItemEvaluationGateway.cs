using API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;

namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para obtener los datos de Azure DevOps requeridos por la evaluacion.
/// </summary>
public interface IAzureDevOpsWorkItemEvaluationGateway
{
    Task<WorkItemEvaluationSource> GetEvaluationSourceAsync(
        EvaluateWorkItemCommand command,
        CancellationToken cancellationToken);
}

public sealed record WorkItemEvaluationSource(
    AzdoWorkItemDetails WorkItem,
    string WorkItemUrl);
