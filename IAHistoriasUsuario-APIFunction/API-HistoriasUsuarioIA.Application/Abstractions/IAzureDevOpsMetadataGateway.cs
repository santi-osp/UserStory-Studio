using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoMetadata;

namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para consultar metadata Azure DevOps sin exponer detalles REST.
/// </summary>
public interface IAzureDevOpsMetadataGateway
{
    Task<GetAzdoMetadataResponse> GetMetadataAsync(
        GetAzdoMetadataQuery query,
        CancellationToken cancellationToken);
}
