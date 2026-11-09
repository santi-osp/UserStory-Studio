namespace API_HistoriasUsuarioIA_funcion.Application.Common;

/// <summary>
/// Error de aplicacion reusable por futuros casos de uso sin exponer detalles tecnicos.
/// </summary>
public sealed record ApplicationError(
    string Code,
    string Message,
    ErrorType Type,
    string? Detail = null);
