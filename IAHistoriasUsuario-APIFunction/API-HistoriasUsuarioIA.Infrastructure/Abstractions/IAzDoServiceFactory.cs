using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Fabrica servicios Azure DevOps ligados a una organizacion, proyecto y PAT especificos de la solicitud.
    /// </summary>
    public interface IAzDoServiceFactory
    {
        /// <summary>
        /// Crea un servicio para operar contra Azure DevOps con contexto normalizado.
        /// </summary>
        IAzDoService Create(string organization, string project, string azurePat, ILogger? logger = null);
    }
}
