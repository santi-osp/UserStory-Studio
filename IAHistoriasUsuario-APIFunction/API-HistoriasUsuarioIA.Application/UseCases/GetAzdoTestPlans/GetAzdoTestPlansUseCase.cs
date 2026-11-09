using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoTestPlans;

/// <summary>
/// Orquesta la consulta de Test Plans mediante un gateway de Application.
/// </summary>
public sealed class GetAzdoTestPlansUseCase : IGetAzdoTestPlansUseCase
{
    private readonly IAzureDevOpsTestPlansGateway _testPlansGateway;
    private readonly ILogger<GetAzdoTestPlansUseCase> _logger;

    public GetAzdoTestPlansUseCase(
        IAzureDevOpsTestPlansGateway testPlansGateway,
        ILogger<GetAzdoTestPlansUseCase> logger)
    {
        _testPlansGateway = testPlansGateway;
        _logger = logger;
    }

    public async Task<TestPlansResponse> ExecuteAsync(
        GetAzdoTestPlansQuery query,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Inicio consulta Test Plans Azure DevOps. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Organization: {Organization}. Project: {Project}",
            query.CorrelationId,
            query.ClientApp,
            query.Organization,
            query.Project);

        var response = await _testPlansGateway.GetTestPlansAsync(query, cancellationToken);

        _logger.LogInformation(
            "Test Plans obtenidos. CorrelationId: {CorrelationId}. Project: {Project}. Count: {Count}",
            query.CorrelationId,
            response.Project,
            response.TestPlans.Count);

        return response;
    }
}
