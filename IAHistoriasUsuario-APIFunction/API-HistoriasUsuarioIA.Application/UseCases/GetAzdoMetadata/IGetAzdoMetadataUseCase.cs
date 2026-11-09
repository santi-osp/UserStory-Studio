namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoMetadata;

/// <summary>
/// Caso de uso para consultar metadata de Azure DevOps.
/// </summary>
public interface IGetAzdoMetadataUseCase
{
    Task<GetAzdoMetadataResponse> ExecuteAsync(
        GetAzdoMetadataQuery query,
        CancellationToken cancellationToken);
}
