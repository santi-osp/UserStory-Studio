using System.Text.Json;
using System.Text.Json.Nodes;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Helper de trazabilidad para registrar solo metadatos estructurales de request/response.
    /// </summary>
    /// <remarks>
    /// Se usa en endpoints para mantener un formato de log consistente con correlation id y contexto operativo.
    /// </remarks>
    public sealed class ErrorLoggingHelper
    {
        private readonly ObservabilityOptions _options;
        private readonly JsonPayloadSerializer _jsonSerializer;

        public ErrorLoggingHelper(
            IOptions<ObservabilityOptions> options,
            JsonPayloadSerializer jsonSerializer)
        {
            _options = options.Value;
            _jsonSerializer = jsonSerializer;
        }

        private static readonly HashSet<string> SensitiveNames = new(StringComparer.OrdinalIgnoreCase)
        {
            "authorization",
            "cookie",
            "set-cookie",
            "setcookie",
            "openaiapikey",
            "azurepat",
            "pat",
            "personalaccesstoken",
            "token",
            "accesstoken",
            "refreshtoken",
            "apikey",
            "secret",
            "clientsecret"
        };

        private static readonly HashSet<string> ContentNames = new(StringComparer.OrdinalIgnoreCase)
        {
            "body",
            "requestbody",
            "responsebody",
            "prompt",
            "systemprompt",
            "raw",
            "rawoutputtext",
            "jsonpayloadtext",
            "markdown",
            "markdowncontent",
            "estructura_backlog_markdown",
            "content",
            "text",
            "description",
            "acceptancecriteria",
            "comments",
            "renderedtext",
            "sourceworkitemtext",
            "title"
        };

        /// <summary>
        /// Registra una excepcion junto con body de entrada, respuesta calculada y contexto adicional.
        /// </summary>
        public void LogExceptionWithBodies(
            ILogger logger,
            Exception exception,
            string endpoint,
            string correlationId,
            string requestBody,
            object? responseBody,
            object? context = null)
        {
            logger.LogError(
                "Endpoint error trace. Endpoint: {Endpoint}. CorrelationId: {CorrelationId}. ExceptionType: {ExceptionType}. RequestBodySummary: {RequestBodySummary}. ResponseBodySummary: {ResponseBodySummary}. Context: {Context}",
                endpoint,
                correlationId,
                exception.GetType().Name,
                Serialize(CreateBodySummary(requestBody)),
                Serialize(CreatePayloadSummary(responseBody)),
                Serialize(SanitizeContext(context)));
        }

        /// <summary>
        /// Registra un error sin excepcion cuando el fallo ya fue detectado por validacion local.
        /// </summary>
        public void LogErrorWithBodies(
            ILogger logger,
            string endpoint,
            string correlationId,
            string requestBody,
            object? responseBody,
            object? context = null)
        {
            logger.LogError(
                "Endpoint error trace. Endpoint: {Endpoint}. CorrelationId: {CorrelationId}. RequestBodySummary: {RequestBodySummary}. ResponseBodySummary: {ResponseBodySummary}. Context: {Context}",
                endpoint,
                correlationId,
                Serialize(CreateBodySummary(requestBody)),
                Serialize(CreatePayloadSummary(responseBody)),
                Serialize(SanitizeContext(context)));
        }

        /// <summary>
        /// Registra la respuesta final de un endpoint, incluyendo estado y body sanitizado.
        /// </summary>
        public void LogResponseWithBody(
            ILogger logger,
            string endpoint,
            string correlationId,
            string requestBody,
            int statusCode,
            object? responseBody,
            object? context = null)
        {
            logger.LogInformation(
                "Endpoint response trace. Endpoint: {Endpoint}. CorrelationId: {CorrelationId}. RequestBodySummary: {RequestBodySummary}. StatusCode: {StatusCode}. ResponseBodySummary: {ResponseBodySummary}. Context: {Context}",
                endpoint,
                correlationId,
                Serialize(CreateBodySummary(requestBody)),
                statusCode,
                Serialize(CreatePayloadSummary(responseBody)),
                Serialize(SanitizeContext(context)));
        }

        /// <summary>
        /// Registra una solicitud entrante con body sanitizado y contexto de operacion.
        /// </summary>
        public void LogRequestWithBody(
            ILogger logger,
            string endpoint,
            string correlationId,
            string requestBody,
            object? context = null)
        {
            logger.LogInformation(
                "Endpoint request trace. Endpoint: {Endpoint}. CorrelationId: {CorrelationId}. RequestBodySummary: {RequestBodySummary}. Context: {Context}",
                endpoint,
                correlationId,
                Serialize(CreateBodySummary(requestBody)),
                Serialize(SanitizeContext(context)));
        }

        /// <summary>
        /// Extrae un cuerpo serializable desde los tipos de <see cref="IActionResult"/> usados por las funciones.
        /// </summary>
        public object? ExtractResponseBody(IActionResult result)
        {
            return result switch
            {
                ObjectResult objectResult => objectResult.Value,
                JsonResult jsonResult => jsonResult.Value,
                ContentResult contentResult => contentResult.Content,
                StatusCodeResult statusCodeResult => new { status = statusCodeResult.StatusCode },
                _ => new { type = result.GetType().Name }
            };
        }

        public string RedactHeaderValue(string headerName, string? value)
        {
            if (IsSensitiveName(headerName) || ContainsSecretMarker(value))
                return "[REDACTED]";

            return Truncate(RemoveLineBreaks(value), _options.MaxScalarLogLength);
        }

        public string Truncate(string? value, int? maxLength = null)
        {
            if (string.IsNullOrEmpty(value))
                return string.Empty;

            var effectiveMaxLength = maxLength ?? _options.MaxGenericTextLength;
            if (effectiveMaxLength <= 0)
                return string.Empty;

            return value.Length <= effectiveMaxLength
                ? value
                : $"{value[..effectiveMaxLength]}...[TRUNCATED]";
        }

        private object CreateBodySummary(string body)
        {
            if (string.IsNullOrEmpty(body))
            {
                return new
                {
                    length = 0,
                    isJson = false
                };
            }

            var summary = new Dictionary<string, object?>
            {
                ["length"] = body.Length,
                ["isJson"] = false
            };

            try
            {
                using var document = JsonDocument.Parse(
                    body,
                    new JsonDocumentOptions { MaxDepth = _jsonSerializer.Options.MaxDepth });
                summary["isJson"] = true;
                summary["jsonKind"] = document.RootElement.ValueKind.ToString();
                if (document.RootElement.ValueKind == JsonValueKind.Object)
                    summary["propertyCount"] = document.RootElement.EnumerateObject().Count();
                else if (document.RootElement.ValueKind == JsonValueKind.Array)
                    summary["itemCount"] = document.RootElement.GetArrayLength();
            }
            catch (JsonException)
            {
                summary["jsonKind"] = "Invalid";
            }

            return summary;
        }

        private object CreatePayloadSummary(object? payload)
        {
            if (payload is null)
                return new { type = "null", length = 0 };

            if (payload is string text)
                return CreateBodySummary(text);

            var serialized = SafeSerializeRaw(payload);
            var summary = new Dictionary<string, object?>
            {
                ["type"] = payload.GetType().Name,
                ["serializedLength"] = serialized.Length
            };

            try
            {
                using var document = JsonDocument.Parse(
                    serialized,
                    new JsonDocumentOptions { MaxDepth = _jsonSerializer.Options.MaxDepth });
                summary["jsonKind"] = document.RootElement.ValueKind.ToString();
                if (document.RootElement.ValueKind == JsonValueKind.Object)
                {
                    summary["propertyCount"] = document.RootElement.EnumerateObject().Count();
                    TryCopySafeProperty(document.RootElement, summary, "code");
                    TryCopySafeProperty(document.RootElement, summary, "correlationId");
                    TryCopySafeProperty(document.RootElement, summary, "status");
                    TryCopySafeProperty(document.RootElement, summary, "count");
                }
                else if (document.RootElement.ValueKind == JsonValueKind.Array)
                {
                    summary["itemCount"] = document.RootElement.GetArrayLength();
                }
            }
            catch (JsonException)
            {
                summary["jsonKind"] = "Invalid";
            }

            return summary;
        }

        private object? SanitizeContext(object? context)
        {
            if (context is null)
                return null;

            if (context is string text)
                return SanitizeStringValue(string.Empty, text);

            try
            {
                var json = JsonSerializer.Serialize(context, _jsonSerializer.Options);
                var node = JsonNode.Parse(
                    json,
                    documentOptions: new JsonDocumentOptions { MaxDepth = _jsonSerializer.Options.MaxDepth });
                if (node is null)
                    return new { type = context.GetType().Name };

                SanitizeJsonNode(node);
                return node;
            }
            catch
            {
                return new
                {
                    type = context.GetType().Name
                };
            }
        }

        private void SanitizeJsonNode(JsonNode node)
        {
            if (node is JsonObject obj)
            {
                foreach (var propertyName in obj.Select(item => item.Key).ToArray())
                {
                    var child = obj[propertyName];
                    if (IsSensitiveName(propertyName))
                    {
                        obj[propertyName] = "[REDACTED]";
                        continue;
                    }

                    if (IsContentName(propertyName))
                    {
                        obj[propertyName] = JsonSerializer.SerializeToNode(
                            CreateContentSummary(child),
                            _jsonSerializer.Options);
                        continue;
                    }

                    if (child is not null)
                        SanitizeJsonNode(child);
                }

                return;
            }

            if (node is JsonArray array)
            {
                var originalCount = array.Count;
                for (var index = 0; index < array.Count; index++)
                {
                    var child = array[index];
                    if (child is not null)
                        SanitizeJsonNode(child);
                }

                while (array.Count > _options.MaxContextArrayItems)
                    array.RemoveAt(array.Count - 1);

                if (originalCount > _options.MaxContextArrayItems)
                {
                    array.Add(new JsonObject
                    {
                        ["truncatedItems"] = originalCount - _options.MaxContextArrayItems
                    });
                }

                return;
            }

            if (node is JsonValue valueNode &&
                valueNode.TryGetValue<string>(out var textValue))
            {
                var sanitized = SanitizeStringValue(string.Empty, textValue);
                if (!ReferenceEquals(sanitized, textValue))
                    node.ReplaceWith(JsonValue.Create(sanitized));
            }
        }

        private object CreateContentSummary(JsonNode? node)
        {
            if (node is null)
                return new { length = 0 };

            if (node is JsonValue valueNode && valueNode.TryGetValue<string>(out var text))
                return CreateBodySummary(text);

            var serialized = node.ToJsonString(_jsonSerializer.Options);
            return CreateBodySummary(serialized);
        }

        private object SanitizeStringValue(string name, string value)
        {
            if (IsSensitiveName(name) || ContainsSecretMarker(value))
                return "[REDACTED]";

            return Truncate(RemoveLineBreaks(value), _options.MaxScalarLogLength);
        }

        private static bool IsSensitiveName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return false;

            var normalized = NormalizeName(name);
            if (SensitiveNames.Contains(normalized))
                return true;

            return normalized.Contains("authorization", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("password", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("secret", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("token", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("apikey", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith("pat", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsContentName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return false;

            var normalized = NormalizeName(name);
            if (ContentNames.Contains(normalized))
                return true;

            return normalized.Contains("prompt", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("markdown", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("rawoutput", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("payloadtext", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("comment", StringComparison.OrdinalIgnoreCase);
        }

        private static bool ContainsSecretMarker(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return false;

            return value.Contains("Bearer ", StringComparison.OrdinalIgnoreCase)
                || value.Contains("Basic ", StringComparison.OrdinalIgnoreCase)
                || value.Contains("AiConnection__OpenAI__ApiKey", StringComparison.OrdinalIgnoreCase)
                || value.Contains("AZURE_PAT", StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeName(string value)
        {
            var chars = value
                .Where(char.IsLetterOrDigit)
                .Select(char.ToLowerInvariant)
                .ToArray();

            return new string(chars);
        }

        private void TryCopySafeProperty(JsonElement element, IDictionary<string, object?> target, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var property))
                return;

            if (property.ValueKind == JsonValueKind.String)
                target[propertyName] = Truncate(RemoveLineBreaks(property.GetString()), _options.MaxScalarLogLength);
            else if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var intValue))
                target[propertyName] = intValue;
        }

        private string Serialize(object? payload)
        {
            if (payload is null)
                return "<null>";

            if (payload is string text)
                return Truncate(text, _options.MaxScalarLogLength);

            try
            {
                return JsonSerializer.Serialize(payload, _jsonSerializer.Options);
            }
            catch
            {
                return $"<serialization-error:{payload.GetType().Name}>";
            }
        }

        private string SafeSerializeRaw(object payload)
        {
            try
            {
                return JsonSerializer.Serialize(payload, _jsonSerializer.Options);
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string RemoveLineBreaks(string? value) =>
            (value ?? string.Empty)
                .Replace('\r', ' ')
                .Replace('\n', ' ');
    }
}
