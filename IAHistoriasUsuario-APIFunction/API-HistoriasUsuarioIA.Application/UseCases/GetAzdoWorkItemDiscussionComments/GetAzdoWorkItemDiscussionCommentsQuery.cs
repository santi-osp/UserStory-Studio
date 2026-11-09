namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemDiscussionComments;

/// <summary>
/// Datos necesarios para consultar comentarios de discusion de work items.
/// </summary>
public sealed record GetAzdoWorkItemDiscussionCommentsQuery(
    string Organization,
    string Project,
    IReadOnlyCollection<int> WorkItemIds,
    string AzurePat,
    string CorrelationId,
    string ClientApp);
