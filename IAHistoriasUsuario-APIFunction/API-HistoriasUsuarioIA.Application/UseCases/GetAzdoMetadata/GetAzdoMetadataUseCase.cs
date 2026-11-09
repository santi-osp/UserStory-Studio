using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoMetadata;

/// <summary>
/// Orquesta la consulta de metadata Azure DevOps mediante un gateway de Application.
/// </summary>
public sealed class GetAzdoMetadataUseCase : IGetAzdoMetadataUseCase
{
    private readonly IAzureDevOpsMetadataGateway _metadataGateway;
    private readonly ILogger<GetAzdoMetadataUseCase> _logger;

    public GetAzdoMetadataUseCase(
        IAzureDevOpsMetadataGateway metadataGateway,
        ILogger<GetAzdoMetadataUseCase> logger)
    {
        _metadataGateway = metadataGateway;
        _logger = logger;
    }

    public async Task<GetAzdoMetadataResponse> ExecuteAsync(
        GetAzdoMetadataQuery query,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Inicio consulta metadata Azure DevOps. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Organization: {Organization}. AzurePathFilter: {AzurePathFilter}",
            query.CorrelationId,
            query.ClientApp,
            query.Organization,
            string.IsNullOrWhiteSpace(query.AzurePath) ? "(none)" : query.AzurePath);

        var response = await _metadataGateway.GetMetadataAsync(query, cancellationToken);

        _logger.LogInformation(
            "Metadata Azure DevOps obtenida. CorrelationId: {CorrelationId}. Projects: {Projects}. AreaPaths: {AreaPaths}. IterationPaths: {IterationPaths}. ProjectMetadataEntries: {ProjectMetadataEntries}",
            query.CorrelationId,
            response.Projects.Count,
            response.AreaPaths.Count,
            response.IterationPaths.Count,
            response.ProjectMetadata.Count);

        return response;
    }
}
