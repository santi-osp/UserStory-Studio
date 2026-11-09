using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoTestPlans;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

/// <summary>
/// Adaptador Azure DevOps para consultar Test Plans del proyecto solicitado.
/// </summary>
public sealed class AzureDevOpsTestPlansGateway : IAzureDevOpsTestPlansGateway
{
    private readonly IAzDoServiceFactory _azdoServiceFactory;
    private readonly ILogger<AzureDevOpsTestPlansGateway> _logger;

    public AzureDevOpsTestPlansGateway(
        IAzDoServiceFactory azdoServiceFactory,
        ILogger<AzureDevOpsTestPlansGateway> logger)
    {
        _azdoServiceFactory = azdoServiceFactory;
        _logger = logger;
    }

    public async Task<TestPlansResponse> GetTestPlansAsync(
        GetAzdoTestPlansQuery query,
        CancellationToken cancellationToken)
    {
        var azdoService = _azdoServiceFactory.Create(
            query.Organization,
            query.Project,
            query.AzurePat,
            _logger);

        var plans = await azdoService.GetTestPlansAsync(cancellationToken);

        return new TestPlansResponse
        {
            Project = query.Project,
            TestPlans = plans
        };
    }
}
