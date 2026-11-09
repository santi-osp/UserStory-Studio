using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

public sealed class N8nJsonProvider : IAiProviderClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IAiHttpExecutor _httpExecutor;
    private readonly AiConnectionOptions _options;
    private readonly ILogger<N8nJsonProvider> _logger;
    private readonly JsonPayloadSerializer _jsonSerializer;

    public N8nJsonProvider(
        IHttpClientFactory httpClientFactory,
        IAiHttpExecutor httpExecutor,
        IOptions<AiConnectionOptions> options,
        ILogger<N8nJsonProvider> logger,
        JsonPayloadSerializer jsonSerializer)
    {
        _httpClientFactory = httpClientFactory;
        _httpExecutor = httpExecutor;
        _options = options.Value;
        _logger = logger;
        _jsonSerializer = jsonSerializer;
    }

    public string Provider => AiProviderNames.N8n;

    public async Task<AiJsonGenerationResult> GenerateJsonAsync(
        AiJsonGenerationRequest request,
        CancellationToken cancellationToken)
    {
        var providerOptions = _options.N8n;
        var url = providerOptions.Url?.Trim() ?? string.Empty;
        if (!AiConnectionOptionsValidator.IsAllowedProviderUrl(url))
            throw new AiConfigurationException("AiConnection:N8n:Url no esta configurada o no es valida.");

        var model = string.IsNullOrWhiteSpace(request.RequestedModel)
            ? providerOptions.DefaultModel?.Trim()
            : request.RequestedModel.Trim();
        model ??= string.Empty;
        var requestBody = JsonSerializer.Serialize(new N8nRequest(
            model,
            [
                new N8nInput("system", request.SystemPrompt),
                new N8nInput("user", request.UserPrompt)
            ]), _jsonSerializer.Options);
        var client = _httpClientFactory.CreateClient(AiHttpClientNames.N8n);
        var response = await _httpExecutor.SendAsync(
            client,
            () => new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
            },
            Provider,
            model,
            request,
            cancellationToken);

        try
        {
            var envelope = JsonSerializer.Deserialize<N8nResponseEnvelope>(
                response.Body,
                _jsonSerializer.Options);
            if (envelope is null || envelope.GeneratedObject.ValueKind != JsonValueKind.Object)
                throw new AiInvalidResponseException(
                    Provider,
                    "n8n no devolvio generatedObject como objeto JSON.");

            var jsonPayload = JsonSerializer.Serialize(
                envelope.GeneratedObject,
                _jsonSerializer.Options);
            var rawOutput = string.IsNullOrWhiteSpace(envelope.GeneratedText)
                ? jsonPayload
                : envelope.GeneratedText.Trim();
            if (!string.Equals(rawOutput, jsonPayload, StringComparison.Ordinal))
            {
                _logger.LogWarning(
                    "n8n generatedText differs from generatedObject. Provider={AiProvider} Operation={AiOperation} RawLength={RawLength} JsonLength={JsonLength}",
                    Provider, request.Operation, rawOutput.Length, jsonPayload.Length);
            }

            return new AiJsonGenerationResult(Provider, model, rawOutput, jsonPayload);
        }
        catch (AiInvalidResponseException)
        {
            throw;
        }
        catch (JsonException exception)
        {
            throw new AiInvalidResponseException(
                Provider,
                "n8n devolvio una envoltura JSON invalida.",
                exception);
        }
    }

    private sealed record N8nRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("input")] IReadOnlyList<N8nInput> Input);

    private sealed record N8nInput(
        [property: JsonPropertyName("role")] string Role,
        [property: JsonPropertyName("content")] string Content);

    private sealed class N8nResponseEnvelope
    {
        [JsonPropertyName("generatedObject")]
        public JsonElement GeneratedObject { get; init; }

        [JsonPropertyName("generatedText")]
        public string? GeneratedText { get; init; }
    }
}
