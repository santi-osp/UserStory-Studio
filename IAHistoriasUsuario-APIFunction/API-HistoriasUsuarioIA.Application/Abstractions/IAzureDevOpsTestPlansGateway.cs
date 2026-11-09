using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoTestPlans;

namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para consultar Test Plans sin exponer detalles REST de Azure DevOps.
/// </summary>
public interface IAzureDevOpsTestPlansGateway
{
    Task<TestPlansResponse> GetTestPlansAsync(
        GetAzdoTestPlansQuery query,
        CancellationToken cancellationToken);
}
