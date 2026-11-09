using API_HistoriasUsuarioIA_funcion;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoTestPlans;

/// <summary>
/// Caso de uso para consultar los Test Plans disponibles en un proyecto.
/// </summary>
public interface IGetAzdoTestPlansUseCase
{
    Task<TestPlansResponse> ExecuteAsync(
        GetAzdoTestPlansQuery query,
        CancellationToken cancellationToken);
}
