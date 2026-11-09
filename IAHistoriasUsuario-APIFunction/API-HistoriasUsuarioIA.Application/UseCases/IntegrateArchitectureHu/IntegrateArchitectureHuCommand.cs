namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;

/// <summary>
/// Datos necesarios para validar o crear una jerarquía arquitectura-HU.
/// </summary>
public sealed record IntegrateArchitectureHuCommand(
    string Organization,
    string Project,
    string AreaPath,
    string IterationPath,
    string AzurePat,
    string Markdown,
    bool ValidateOnly,
    string CorrelationId,
    string ClientApp);
