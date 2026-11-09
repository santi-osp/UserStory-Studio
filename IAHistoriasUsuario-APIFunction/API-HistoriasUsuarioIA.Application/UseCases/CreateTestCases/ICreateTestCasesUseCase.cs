using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;

public interface ICreateTestCasesUseCase
{
    Task<CreateAzureDevOpsItemsUseCaseResponse> ExecuteAsync(
        CreateTestCasesCommand command,
        CancellationToken cancellationToken);
}
