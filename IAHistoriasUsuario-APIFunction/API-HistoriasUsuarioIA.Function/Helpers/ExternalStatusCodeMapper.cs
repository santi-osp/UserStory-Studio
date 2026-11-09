using Microsoft.AspNetCore.Http;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Mapea estados HTTP de servicios externos a estados seguros para exponer desde la API.
    /// </summary>
    internal static class ExternalStatusCodeMapper
    {
        /// <summary>
        /// Conserva errores de cliente/autorizacion relevantes y transforma fallos externos de servidor en 502.
        /// </summary>
        public static int Map(int statusCode)
        {
            return statusCode switch
            {
                StatusCodes.Status400BadRequest => StatusCodes.Status400BadRequest,
                StatusCodes.Status401Unauthorized => StatusCodes.Status401Unauthorized,
                StatusCodes.Status403Forbidden => StatusCodes.Status403Forbidden,
                StatusCodes.Status408RequestTimeout => StatusCodes.Status408RequestTimeout,
                >= 500 and <= 599 => StatusCodes.Status502BadGateway,
                _ => StatusCodes.Status502BadGateway
            };
        }
    }
}
