namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateTestCases;

public sealed record GenerateTestCasesCommand(
    string Prompt,
    string SystemPrompt,
    string? RequestedModel,
    string CorrelationId,
    string ClientApp);
