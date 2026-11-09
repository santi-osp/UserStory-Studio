using API_HistoriasUsuarioIA_funcion;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemConfig;

/// <summary>
/// Caso de uso para obtener campos configurables de un tipo de work item.
/// </summary>
public interface IGetAzdoWorkItemConfigUseCase
{
    Task<WorkItemConfigResponse> ExecuteAsync(
        GetAzdoWorkItemConfigQuery query,
        CancellationToken cancellationToken);
}
