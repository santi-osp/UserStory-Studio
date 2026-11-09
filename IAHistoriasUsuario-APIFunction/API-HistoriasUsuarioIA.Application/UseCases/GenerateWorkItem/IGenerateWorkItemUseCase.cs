namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;

/// <summary>
/// Caso de uso para generar y validar un Work Item con IA.
/// </summary>
public interface IGenerateWorkItemUseCase
{
    Task<GenerateWorkItemUseCaseResponse> ExecuteAsync(
        GenerateWorkItemCommand command,
        CancellationToken cancellationToken);
}
