using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateTestCases;

public interface IGenerateTestCasesUseCase
{
    Task<GenerateWorkItemUseCaseResponse> ExecuteAsync(
        GenerateTestCasesCommand command,
        CancellationToken cancellationToken);
}
