namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;

public sealed record CreateTestCasesCommand(
    string Organization,
    string Project,
    string AzurePat,
    CreateTestCasesPayload Payload,
    string CorrelationId,
    string ClientApp);
