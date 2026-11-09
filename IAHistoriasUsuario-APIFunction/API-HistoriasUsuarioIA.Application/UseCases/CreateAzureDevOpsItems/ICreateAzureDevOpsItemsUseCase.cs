namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

/// <summary>
/// Caso de uso para crear un Work Item y sus elementos asociados en Azure DevOps.
/// </summary>
public interface ICreateAzureDevOpsItemsUseCase
{
    Task<CreateAzureDevOpsItemsUseCaseResponse> ExecuteAsync(
        CreateAzureDevOpsItemsCommand command,
        CancellationToken cancellationToken);
}
