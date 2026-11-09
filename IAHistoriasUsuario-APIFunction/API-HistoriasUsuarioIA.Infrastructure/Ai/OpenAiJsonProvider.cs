using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

public sealed class OpenAiJsonProvider : IAiProviderClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IAiHttpExecutor _httpExecutor;
    private readonly AiConnectionOptions _options;
    private readonly JsonPayloadSerializer _jsonSerializer;

    public OpenAiJsonProvider(
        IHttpClientFactory httpClientFactory,
        IAiHttpExecutor httpExecutor,
        IOptions<AiConnectionOptions> options,
        JsonPayloadSerializer jsonSerializer)
    {
        _httpClientFactory = httpClientFactory;
        _httpExecutor = httpExecutor;
        _options = options.Value;
        _jsonSerializer = jsonSerializer;
    }

    public string Provider => AiProviderNames.OpenAI;

    public async Task<AiJsonGenerationResult> GenerateJsonAsync(
        AiJsonGenerationRequest request,
        CancellationToken cancellationToken)
    {
        var providerOptions = _options.OpenAI;
        var apiKey = providerOptions.ApiKey?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new AiConfigurationException("AiConnection:OpenAI:ApiKey no esta configurada.");
        if (!AiConnectionOptionsValidator.IsAllowedProviderUrl(providerOptions.BaseUrl))
            throw new AiConfigurationException("AiConnection:OpenAI:BaseUrl no es valida.");

        var model = string.IsNullOrWhiteSpace(request.RequestedModel)
            ? providerOptions.DefaultModel?.Trim()
            : request.RequestedModel.Trim();
        if (string.IsNullOrWhiteSpace(model))
            throw new AiConfigurationException("AiConnection:OpenAI:DefaultModel no esta configurado.");

        var requestBody = JsonSerializer.Serialize(new
        {
            model,
            input = new object[]
            {
                new { role = "system", content = request.SystemPrompt },
                new { role = "user", content = request.UserPrompt }
            }
        }, _jsonSerializer.Options);
        var client = _httpClientFactory.CreateClient(AiHttpClientNames.OpenAI);
        var response = await _httpExecutor.SendAsync(
            client,
            () => CreateRequest(requestBody, apiKey),
            Provider,
            model,
            request,
            cancellationToken);

        try
        {
            using var document = JsonDocument.Parse(
                response.Body,
                new JsonDocumentOptions { MaxDepth = _jsonSerializer.Options.MaxDepth });
            var outputText = AiHelpers.ExtractOutputText(document.RootElement);
            var generatedJson = AiHelpers.ExtractJsonFromText(outputText);
            return new AiJsonGenerationResult(Provider, model, outputText, generatedJson);
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException)
        {
            throw new AiInvalidResponseException(
                Provider,
                "OpenAI devolvio una respuesta que no pudo normalizarse.",
                exception);
        }
    }

    private static HttpRequestMessage CreateRequest(string requestBody, string apiKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "v1/responses")
        {
            Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        return request;
    }
}

public static class AiHttpClientNames
{
    public const string OpenAI = "AiConnection.OpenAI";
    public const string N8n = "AiConnection.N8n";
}
