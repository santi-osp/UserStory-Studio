namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoTestPlans;

/// <summary>
/// Datos necesarios para consultar Test Plans de un proyecto Azure DevOps.
/// </summary>
public sealed record GetAzdoTestPlansQuery(
    string Organization,
    string Project,
    string AzurePat,
    string CorrelationId,
    string ClientApp);
