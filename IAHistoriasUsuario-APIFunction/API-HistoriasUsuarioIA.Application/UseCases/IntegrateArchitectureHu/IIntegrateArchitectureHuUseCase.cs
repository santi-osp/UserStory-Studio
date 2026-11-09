namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;

/// <summary>
/// Caso de uso para preparar y crear una jerarquía arquitectura-HU.
/// </summary>
public interface IIntegrateArchitectureHuUseCase
{
    IntegrateArchitectureHuPreparation Prepare(
        string markdown,
        bool validateOnly);

    Task<IntegracionArquitecturaHUCreateResponse> ExecuteAsync(
        IntegrateArchitectureHuCommand command,
        IntegrateArchitectureHuPreparation preparation,
        CancellationToken cancellationToken);
}
