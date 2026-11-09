using API_HistoriasUsuarioIA_funcion;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;

/// <summary>
/// Caso de uso para evaluar funcionalmente un Work Item.
/// </summary>
public interface IEvaluateWorkItemUseCase
{
    Task<EvaluateWorkItemResponse> ExecuteAsync(
        EvaluateWorkItemCommand command,
        CancellationToken cancellationToken);
}
