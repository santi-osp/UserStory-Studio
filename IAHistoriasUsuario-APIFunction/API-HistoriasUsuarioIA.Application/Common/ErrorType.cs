namespace API_HistoriasUsuarioIA_funcion.Application.Common;

/// <summary>
/// Clasificacion de errores de aplicacion independiente del transporte HTTP.
/// </summary>
public enum ErrorType
{
    Validation,
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    ExternalService,
    Unexpected
}
