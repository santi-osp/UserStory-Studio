namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Utilidad para inferir proyecto desde una ruta Azure DevOps normalizada.
    /// </summary>
    internal static class AzdoProjectResolver
    {
        /// <summary>
        /// Devuelve el primer segmento de <paramref name="azurePath"/> como nombre de proyecto.
        /// </summary>
        public static string ExtractProjectFromAzurePath(string azurePath)
        {
            var normalizedPath = AzdoContextResolver.NormalizePath(azurePath);
            if (string.IsNullOrWhiteSpace(normalizedPath))
                return string.Empty;

            var segments = normalizedPath.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            return segments.Length > 0 ? segments[0] : string.Empty;
        }
    }
}
