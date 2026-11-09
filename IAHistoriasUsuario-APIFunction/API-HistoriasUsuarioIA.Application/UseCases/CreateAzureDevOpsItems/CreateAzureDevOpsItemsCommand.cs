using API_HistoriasUsuarioIA_funcion;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

/// <summary>
/// Datos necesarios para crear un Work Item y sus elementos asociados.
/// </summary>
public sealed record CreateAzureDevOpsItemsCommand(
    string Organization,
    string Project,
    string AzurePat,
    CreateWorkItemPayload Payload,
    string CorrelationId,
    string ClientApp);
