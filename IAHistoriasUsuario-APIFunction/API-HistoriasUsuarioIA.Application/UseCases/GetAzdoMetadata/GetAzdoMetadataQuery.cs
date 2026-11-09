namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoMetadata;

/// <summary>
/// Datos necesarios para consultar metadata de Azure DevOps.
/// </summary>
public sealed record GetAzdoMetadataQuery(
    string Organization,
    string AzurePath,
    string AzurePat,
    string CorrelationId,
    string ClientApp);
