using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Contexto Azure DevOps resuelto para una solicitud HTTP.
    /// </summary>
    public sealed class ResolvedAzdoContext
    {
        /// <summary>
        /// Organizacion Azure DevOps efectiva.
        /// </summary>
        public string Organization { get; init; } = string.Empty;

        /// <summary>
        /// Ruta Azure DevOps usada como filtro o fuente para inferir proyecto.
        /// </summary>
        public string AzurePath { get; init; } = string.Empty;
    }

    /// <summary>
    /// Resuelve contexto Azure DevOps desde body, headers y configuracion tipada.
    /// </summary>
    /// <remarks>
    /// La precedencia es body, headers y finalmente configuracion. Este orden permite que la UI envie contexto por
    /// solicitud sin depender de valores globales del ambiente.
    /// </remarks>
    public static class AzdoContextResolver
    {
        /// <summary>
        /// Obtiene organizacion y ruta Azure DevOps efectiva para una solicitud.
        /// </summary>
        public static ResolvedAzdoContext ResolveAzdoContext(
            HttpRequest request,
            AzureDevOpsOptions options,
            JsonSerializerOptions jsonOptions,
            string? requestBodyText = null)
        {
            var (bodyOrganization, bodyPath) = ExtractBodyContext(requestBodyText, jsonOptions.MaxDepth);
            var headerOrganization = NormalizeValue(GetHeaderValue(request, HttpResponseHeaderHelper.AzdoOrganizationHeader));
            var headerPath = NormalizePath(GetHeaderValue(request, HttpResponseHeaderHelper.AzdoPathHeader));
            var defaults = options.Defaults ?? new AzureDevOpsDefaultsOptions();
            var configuredOrganization = NormalizeValue(defaults.Organization);
            var configuredPath = NormalizePath(
                defaults.Project);

            var organization = FirstNonEmpty(
                NormalizeValue(bodyOrganization),
                headerOrganization,
                configuredOrganization);

            var azurePath = FirstNonEmpty(
                NormalizePath(bodyPath),
                headerPath,
                configuredPath);

            return new ResolvedAzdoContext
            {
                Organization = organization,
                AzurePath = azurePath
            };
        }

        /// <summary>
        /// Normaliza rutas Azure DevOps a separador <c>/</c> para comparaciones y filtros.
        /// </summary>
        public static string NormalizePath(string? value)
        {
            return AzdoPathHelper.NormalizePath(value);
        }

        /// <summary>
        /// Determina si una ruta candidato pertenece al filtro recibido o si el filtro queda cubierto por la ruta.
        /// </summary>
        public static bool MatchesAzurePath(string candidatePath, string azurePathFilter)
        {
            return AzdoPathHelper.MatchesAzurePath(candidatePath, azurePathFilter);
        }

        private static (string Organization, string AzurePath) ExtractBodyContext(
            string? requestBodyText,
            int maxJsonDepth)
        {
            if (string.IsNullOrWhiteSpace(requestBodyText))
                return (string.Empty, string.Empty);

            try
            {
                using var doc = JsonDocument.Parse(
                    requestBodyText,
                    new JsonDocumentOptions { MaxDepth = maxJsonDepth });
                if (!doc.RootElement.TryGetProperty("azdoContext", out var azdoContext) ||
                    azdoContext.ValueKind != JsonValueKind.Object)
                {
                    return (string.Empty, string.Empty);
                }

                var organization = azdoContext.TryGetProperty("organization", out var bodyOrganization)
                    ? bodyOrganization.GetString() ?? string.Empty
                    : string.Empty;

                var azurePath = azdoContext.TryGetProperty("azurePath", out var bodyPath)
                    ? bodyPath.GetString() ?? string.Empty
                    : string.Empty;

                return (organization, azurePath);
            }
            catch (JsonException)
            {
                return (string.Empty, string.Empty);
            }
        }

        private static string GetHeaderValue(HttpRequest request, string headerName)
        {
            if (request.Headers.TryGetValue(headerName, out var values))
                return values.FirstOrDefault() ?? string.Empty;

            return string.Empty;
        }

        private static string FirstNonEmpty(params string[] values)
        {
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value))
                    return value;
            }

            return string.Empty;
        }

        private static string NormalizeValue(string? value) =>
            string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
    }

    /// <summary>
    /// Centraliza headers transversales de respuesta y lectura de headers de entrada.
    /// </summary>
    /// <remarks>
    /// Propaga <c>x-correlation-id</c> y expone los headers usados por las funciones para Azure DevOps.
    /// </remarks>
    public static class HttpResponseHeaderHelper
    {
        public const string CorrelationHeader = "x-correlation-id";
        public const string ClientAppHeader = "x-client-app";
        public const string AzurePatHeader = "x-azdo-pat";
        public const string AzdoOrganizationHeader = "x-azdo-organization";
        public const string AzdoProjectHeader = "x-azdo-project";
        public const string AzdoPathHeader = "x-azdo-path";
        public const string AzdoIterationPathHeader = "x-azdo-iteration-path";
        public const string AzdoAreaPathHeader = "x-azdo-area-path";

        /// <summary>
        /// Configura la correlacion y devuelve el correlation id efectivo.
        /// La plataforma administra origen, metodos y headers CORS. La unica excepcion aplicacional
        /// expone el correlation id que consume el frontend para trazabilidad de errores.
        /// </summary>
        public static string Prepare(HttpRequest request, int maxCorrelationIdLength)
        {
            var responseHeaders = request.HttpContext.Response.Headers;
            responseHeaders["Access-Control-Expose-Headers"] = CorrelationHeader;

            var requestedCorrelationId = GetHeader(request, CorrelationHeader);
            var correlationId = IsSafeCorrelationId(requestedCorrelationId, maxCorrelationIdLength)
                ? requestedCorrelationId
                : request.HttpContext.TraceIdentifier;
            responseHeaders[CorrelationHeader] = correlationId;
            return correlationId;
        }

        /// <summary>
        /// Lee un header de la solicitud y retorna cadena vacia cuando no existe.
        /// </summary>
        public static string GetHeader(HttpRequest request, string headerName)
        {
            if (request.Headers.TryGetValue(headerName, out var values))
                return values.FirstOrDefault()?.Trim() ?? string.Empty;

            return string.Empty;
        }

        private static bool IsSafeCorrelationId(string value, int maxCorrelationIdLength)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > maxCorrelationIdLength)
                return false;

            return value.All(character =>
                char.IsAsciiLetterOrDigit(character)
                || character is '-' or '_' or '.' or ':' or '/');
        }
    }
}
