using System.Diagnostics;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que importa un backlog markdown y crea jerarquia Epic-Feature-Historia en Azure DevOps.
    /// </summary>
    /// <remarks>
    /// Puede ejecutarse en modo solo validacion con <c>x-validate-only</c> o <c>x-parse-only</c>. En modo creacion
    /// resuelve tipos de work item del proceso, normaliza rutas de area/iteracion y vincula features e historias con
    /// relaciones padre-hijo. Las operaciones de creacion se mantienen sin reintento para evitar duplicados.
    /// </remarks>
    public class IntegracionArquitecturaHUFunction
    {
        private readonly ILogger<IntegracionArquitecturaHUFunction> _logger;
        private readonly IIntegrateArchitectureHuUseCase _integrateArchitectureHuUseCase;
        private readonly AzureDevOpsOptions _azureDevOpsOptions;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;

        public IntegracionArquitecturaHUFunction(
            ILogger<IntegracionArquitecturaHUFunction> logger,
            IIntegrateArchitectureHuUseCase integrateArchitectureHuUseCase,
            IOptions<AzureDevOpsOptions> azureDevOpsOptions,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _integrateArchitectureHuUseCase = integrateArchitectureHuUseCase;
            _azureDevOpsOptions = azureDevOpsOptions.Value;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST v1.0.0/azdo/integracion-arquitectura-hu/create</c>.
        /// </summary>
        /// <param name="request">
        /// Solicitud con JSON que contiene markdown en <c>markdown</c>, <c>markdownContent</c>,
        /// <c>estructura_backlog_markdown</c> u otro campo textual equivalente. Para creacion requiere PAT por
        /// header y organizacion, proyecto, iteracion y area por body, headers o variables de configuracion.
        /// </param>
        /// <param name="cancellationToken">Token de cancelacion usado en parseo, validacion y llamadas externas.</param>
        /// <returns>
        /// <c>200</c> con resumen de parseo o IDs creados, <c>400</c> por markdown/contexto invalido o configuracion
        /// faltante, <c>401/403</c> por autorizacion Azure DevOps, <c>408</c> por timeout y <c>5xx</c> por errores externos
        /// o internos.
        /// </returns>
        [Function("IntegracionArquitecturaHU")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1.0.0/azdo/integracion-arquitectura-hu/create")] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var endpoint = "v1.0.0/azdo/integracion-arquitectura-hu/create";
            var correlationId = _requestValidation.Prepare(request);
            var clientApp = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader);
            var resolvedContext = new ResolvedAzdoContext();
            var requestBodyText = string.Empty;

            IActionResult Respond(IActionResult result, int statusCode)
            {
                _errorLogging.LogResponseWithBody(
                    _logger,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    statusCode,
                    _errorLogging.ExtractResponseBody(result),
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        durationMs = startedAt.ElapsedMilliseconds
                    });
                return result;
            }

            var bodyRead = await _requestValidation.ReadBodyAsync(
                request,
                correlationId,
                requiredBody: true,
                maxBodyBytes: _requestLimits.ArchitectureBodyBytes,
                cancellationToken);
            if (!bodyRead.Succeeded)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(bodyRead.Error!, bodyRead.StatusCode),
                    bodyRead.StatusCode);
            }

            requestBodyText = bodyRead.Body;

            var jsonValidationError = _requestValidation.ValidateJsonIfPresent(requestBodyText, correlationId);
            if (jsonValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(jsonValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            string markdownContent;
            try
            {
                markdownContent = ExtractMarkdownContentFromJson(requestBodyText);
            }
            catch (JsonException ex)
            {
                var errorBody = ErrorResponseFactory.InvalidJson(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            if (string.IsNullOrWhiteSpace(markdownContent))
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "No se encontro contenido del backlog en el JSON."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var markdownValidationError = _requestValidation.ValidateRequiredText(
                markdownContent,
                "markdown",
                _requestValidation.MaxArchitectureMarkdownLength,
                correlationId,
                allowLineBreaks: true);
            if (markdownValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(markdownValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var validateOnly = IsTrueFlag(HttpResponseHeaderHelper.GetHeader(request, "x-validate-only"))
                || IsTrueFlag(HttpResponseHeaderHelper.GetHeader(request, "x-parse-only"));

            var preparation = _integrateArchitectureHuUseCase.Prepare(markdownContent, validateOnly);
            if (preparation.ValidationResponse is not null)
            {
                return Respond(
                    new OkObjectResult(preparation.ValidationResponse),
                    StatusCodes.Status200OK);
            }

            if (!preparation.HasEpics)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(
                            correlationId,
                            "No se detectaron epicas validas en el markdown."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var azurePat = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzurePatHeader);
            var bodyContext = DeserializeRequestContext(requestBodyText);
            var defaults = _azureDevOpsOptions.Defaults ?? new AzureDevOpsDefaultsOptions();

            var organization = FirstNonEmpty(
                bodyContext.AzdoOrg,
                HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzdoOrganizationHeader),
                defaults.Organization);

            var project = FirstNonEmpty(
                bodyContext.AzdoProject,
                HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzdoProjectHeader),
                defaults.Project);

            var iterationPath = FirstNonEmpty(
                bodyContext.IterationPath,
                HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzdoIterationPathHeader),
                defaults.IterationPath);

            var areaPath = FirstNonEmpty(
                bodyContext.AreaPath,
                HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzdoAreaPathHeader),
                defaults.AreaPath);

            resolvedContext = new ResolvedAzdoContext
            {
                Organization = organization,
                AzurePath = project
            };

            var patValidationError = _requestValidation.ValidateAzurePat(azurePat, correlationId);
            if (patValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(patValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var missingConfiguration = new List<string>();
            if (string.IsNullOrWhiteSpace(organization))
                missingConfiguration.Add($"{HttpResponseHeaderHelper.AzdoOrganizationHeader} o AzureDevOps:Defaults:Organization");

            if (string.IsNullOrWhiteSpace(project))
                missingConfiguration.Add($"{HttpResponseHeaderHelper.AzdoProjectHeader} o AzureDevOps:Defaults:Project");

            if (string.IsNullOrWhiteSpace(iterationPath))
                missingConfiguration.Add($"{HttpResponseHeaderHelper.AzdoIterationPathHeader} o AzureDevOps:Defaults:IterationPath");

            if (string.IsNullOrWhiteSpace(areaPath))
                missingConfiguration.Add($"{HttpResponseHeaderHelper.AzdoAreaPathHeader} o AzureDevOps:Defaults:AreaPath");

            if (missingConfiguration.Count > 0)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "Faltan datos requeridos para Azure DevOps."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var contextValidationError = _requestValidation.FirstError(
                _requestValidation.ValidateOrganization(organization, correlationId),
                _requestValidation.ValidateProject(project, correlationId),
                _requestValidation.ValidateRequiredText(
                    iterationPath,
                    "iterationPath",
                    _requestValidation.MaxPathLength,
                    correlationId),
                _requestValidation.ValidateRequiredText(
                    areaPath,
                    "areaPath",
                    _requestValidation.MaxPathLength,
                    correlationId));

            if (contextValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(contextValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var normalizedIterationPath = ArchitectureHuPathNormalizer.Normalize(iterationPath, "iteration");
            var normalizedAreaPath = ArchitectureHuPathNormalizer.Normalize(areaPath, "area");

            if (string.IsNullOrWhiteSpace(normalizedIterationPath))
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "iterationPath es invalido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            if (string.IsNullOrWhiteSpace(normalizedAreaPath))
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "areaPath es invalido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            try
            {
                var response = await _integrateArchitectureHuUseCase.ExecuteAsync(
                    new IntegrateArchitectureHuCommand(
                        organization,
                        project,
                        normalizedAreaPath,
                        normalizedIterationPath,
                        azurePat,
                        markdownContent,
                        validateOnly,
                        correlationId,
                        clientApp),
                    preparation,
                    cancellationToken);

                return Respond(new OkObjectResult(response), StatusCodes.Status200OK);
            }
            catch (AzDoRequestException ex)
            {
                var statusCode = ExternalStatusCodeMapper.Map(ex.StatusCode);
                var errorBody = ErrorResponseFactory.AzureDevOps(ex, correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, statusCode),
                    statusCode);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                var errorBody = ErrorResponseFactory.AzureDevOpsTimeout(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status408RequestTimeout),
                    StatusCodes.Status408RequestTimeout);
            }
            catch (Exception ex)
            {
                var errorBody = ErrorResponseFactory.Unexpected(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError),
                    StatusCodes.Status500InternalServerError);
            }
        }

        private static bool IsTrueFlag(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return false;

            var normalized = value.Trim();
            return normalized.Equals("1", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("true", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("yes", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("si", StringComparison.OrdinalIgnoreCase);
        }

        private static string FirstNonEmpty(params string?[] values)
        {
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value))
                    return value.Trim();
            }

            return string.Empty;
        }

        private IntegracionArquitecturaHURequest DeserializeRequestContext(string requestBodyText)
        {
            if (string.IsNullOrWhiteSpace(requestBodyText))
                return new IntegracionArquitecturaHURequest();

            try
            {
                return JsonSerializer.Deserialize<IntegracionArquitecturaHURequest>(requestBodyText, _requestValidation.JsonOptions)
                    ?? new IntegracionArquitecturaHURequest();
            }
            catch (JsonException)
            {
                return new IntegracionArquitecturaHURequest();
            }
        }

        private string ExtractMarkdownContentFromJson(string requestBodyText)
        {
            if (string.IsNullOrWhiteSpace(requestBodyText))
                return string.Empty;

            try
            {
                using var document = JsonDocument.Parse(
                    requestBodyText,
                    new JsonDocumentOptions { MaxDepth = _requestValidation.JsonOptions.MaxDepth });
                var root = document.RootElement;

                if (root.ValueKind == JsonValueKind.String)
                    return ExtractMarkdownContentFromPotentialNestedJson(root.GetString() ?? string.Empty);

                string[] preferredKeys =
                [
                    "estructura_backlog_markdown",
                    "markdownContent",
                    "markdown",
                    "backlogMarkdown",
                    "content",
                    "text"
                ];

                if (root.ValueKind == JsonValueKind.Object)
                {
                    foreach (var key in preferredKeys)
                    {
                        if (TryGetStringPropertyIgnoreCase(root, key, out var value) && !string.IsNullOrWhiteSpace(value))
                            return ExtractMarkdownContentFromPotentialNestedJson(value);
                    }
                }

                var bestCandidate = FindBestMarkdownCandidate(root);
                return ExtractMarkdownContentFromPotentialNestedJson(bestCandidate);
            }
            catch (JsonException)
            {
                return ExtractMarkdownContentFromLooseJson(requestBodyText);
            }
        }

        private string ExtractMarkdownContentFromPotentialNestedJson(string value)
        {
            var trimmed = value?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(trimmed) || !LooksLikeJsonPayload(trimmed))
                return trimmed;

            try
            {
                var extracted = ExtractMarkdownContentFromJson(trimmed);
                if (!string.IsNullOrWhiteSpace(extracted)
                    && !extracted.Equals(trimmed, StringComparison.Ordinal))
                {
                    return extracted.Trim();
                }
            }
            catch (JsonException)
            {
                return trimmed;
            }

            return trimmed;
        }

        private static bool LooksLikeJsonPayload(string value)
        {
            if (value.Length < 2)
                return false;

            return (value[0] == '{' && value[^1] == '}')
                || (value[0] == '[' && value[^1] == ']')
                || (value[0] == '"' && value[^1] == '"');
        }

        private static string ExtractMarkdownContentFromLooseJson(string requestBodyText)
        {
            if (string.IsNullOrWhiteSpace(requestBodyText))
                return string.Empty;

            string[] preferredKeys =
            [
                "estructura_backlog_markdown",
                "markdownContent",
                "markdown",
                "backlogMarkdown",
                "content",
                "text"
            ];

            foreach (var source in BuildLooseJsonCandidates(requestBodyText))
            {
                foreach (var key in preferredKeys)
                {
                    if (!TryExtractLooseJsonValue(source, key, out var rawValue))
                        continue;

                    var normalized = NormalizeLooseJsonString(rawValue);
                    if (!string.IsNullOrWhiteSpace(normalized))
                        return normalized;
                }
            }

            return requestBodyText.Trim();
        }

        private static IEnumerable<string> BuildLooseJsonCandidates(string requestBodyText)
        {
            var primary = requestBodyText.Trim();
            if (string.IsNullOrWhiteSpace(primary))
                yield break;

            yield return primary;

            var unescapedQuotes = primary.Replace("\\\"", "\"", StringComparison.Ordinal);
            if (!string.Equals(unescapedQuotes, primary, StringComparison.Ordinal))
                yield return unescapedQuotes;

            if (primary.Length >= 2 && primary[0] == '"' && primary[^1] == '"')
            {
                var withoutOuterQuotes = primary[1..^1];
                yield return withoutOuterQuotes;

                var withoutOuterQuotesUnescaped = withoutOuterQuotes.Replace("\\\"", "\"", StringComparison.Ordinal);
                if (!string.Equals(withoutOuterQuotesUnescaped, withoutOuterQuotes, StringComparison.Ordinal))
                    yield return withoutOuterQuotesUnescaped;
            }
        }

        private static bool TryExtractLooseJsonValue(string text, string key, out string value)
        {
            value = string.Empty;
            if (string.IsNullOrWhiteSpace(text) || string.IsNullOrWhiteSpace(key))
                return false;

            var keyToken = $"\"{key}\"";
            var escapedKeyToken = $"\\\"{key}\\\"";

            var keyIndex = text.IndexOf(keyToken, StringComparison.OrdinalIgnoreCase);
            var escapedKeyIndex = text.IndexOf(escapedKeyToken, StringComparison.OrdinalIgnoreCase);
            var matchedTokenLength = keyToken.Length;
            if (keyIndex < 0 || (escapedKeyIndex >= 0 && escapedKeyIndex < keyIndex))
            {
                keyIndex = escapedKeyIndex;
                matchedTokenLength = escapedKeyToken.Length;
            }

            if (keyIndex < 0)
                return false;

            var colonIndex = text.IndexOf(':', keyIndex + matchedTokenLength);
            if (colonIndex < 0)
                return false;

            var tail = text[(colonIndex + 1)..].TrimStart();
            if (tail.Length == 0)
                return false;

            if (tail[0] == '"')
            {
                var closingQuoteIndex = FindLooseJsonClosingQuote(tail);
                if (closingQuoteIndex <= 0)
                    return false;

                value = tail.Substring(1, closingQuoteIndex - 1);
                return true;
            }

            var endIndex = tail.IndexOfAny([',', '}']);
            value = endIndex >= 0 ? tail[..endIndex].Trim() : tail.Trim();
            return !string.IsNullOrWhiteSpace(value);
        }

        private static int FindLooseJsonClosingQuote(string text)
        {
            if (string.IsNullOrWhiteSpace(text) || text[0] != '"')
                return -1;

            var endBraceIndex = text.LastIndexOf('}');
            var searchLimit = endBraceIndex >= 0 ? endBraceIndex : text.Length;
            var candidate = text.LastIndexOf('"', searchLimit - 1);
            return candidate;
        }

        private static string NormalizeLooseJsonString(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            return value
                .Replace("\\r\\n", "\n", StringComparison.Ordinal)
                .Replace("\\n", "\n", StringComparison.Ordinal)
                .Replace("\\r", "\r", StringComparison.Ordinal)
                .Replace("\\t", "\t", StringComparison.Ordinal)
                .Replace("\\\"", "\"", StringComparison.Ordinal)
                .Replace("\\\\", "\\", StringComparison.Ordinal)
                .Trim();
        }

        private static bool TryGetStringPropertyIgnoreCase(JsonElement element, string propertyName, out string value)
        {
            value = string.Empty;
            if (element.ValueKind != JsonValueKind.Object)
                return false;

            foreach (var property in element.EnumerateObject())
            {
                if (!property.Name.Equals(propertyName, StringComparison.OrdinalIgnoreCase))
                    continue;

                if (property.Value.ValueKind == JsonValueKind.String)
                {
                    value = property.Value.GetString() ?? string.Empty;
                    return true;
                }

                return false;
            }

            return false;
        }

        private static string FindBestMarkdownCandidate(JsonElement root)
        {
            string bestCandidate = string.Empty;
            var bestScore = int.MinValue;
            Traverse(root);
            return bestCandidate;

            void Traverse(JsonElement current)
            {
                if (current.ValueKind == JsonValueKind.String)
                {
                    var candidate = current.GetString() ?? string.Empty;
                    var score = ScoreMarkdownCandidate(candidate);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestCandidate = candidate;
                    }

                    return;
                }

                if (current.ValueKind == JsonValueKind.Object)
                {
                    foreach (var property in current.EnumerateObject())
                        Traverse(property.Value);

                    return;
                }

                if (current.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in current.EnumerateArray())
                        Traverse(item);
                }
            }
        }

        private static int ScoreMarkdownCandidate(string candidate)
        {
            if (string.IsNullOrWhiteSpace(candidate))
                return int.MinValue;

            var normalized = candidate.Trim();
            if (normalized.Length < 30)
                return int.MinValue + normalized.Length;

            var score = normalized.Length;
            if (normalized.Contains("epica", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("epic", StringComparison.OrdinalIgnoreCase))
            {
                score += 1500;
            }

            if (normalized.Contains("feature", StringComparison.OrdinalIgnoreCase))
                score += 1200;

            if (normalized.Contains("historia", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("user story", StringComparison.OrdinalIgnoreCase))
            {
                score += 1000;
            }

            if (normalized.Contains("titulo", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("tÃ­tulo", StringComparison.OrdinalIgnoreCase))
            {
                score += 800;
            }

            if (normalized.Contains("criterios de aceptacion", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("criterios de aceptaciÃ³n", StringComparison.OrdinalIgnoreCase))
            {
                score += 700;
            }

            return score;
        }

    }
}
