using System.Net;
using System.Text;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.Ai.Providers;

public sealed class AiProviderTests
{
    [Fact]
    public async Task N8nPostsDynamicPromptsWithoutPrivateHeadersAndUsesGeneratedObject()
    {
        var handler = new RecordingHandler(_ => JsonResponse(HttpStatusCode.OK, """
            {
              "generatedObject": { "source": "object", "count": 2 },
              "generatedText": "{\"source\":\"text\"}"
            }
            """));
        var options = N8nOptions();
        var provider = CreateN8nProvider(handler, options);

        var result = await provider.GenerateJsonAsync(
            new AiJsonGenerationRequest(
                "dynamic system prompt",
                "dynamic user prompt",
                "requested-model",
                "GenerateWorkItem"),
            CancellationToken.None);

        var sent = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, sent.Method);
        Assert.Equal("https://n8n.example/webhook", sent.Uri);
        Assert.Null(sent.Authorization);
        Assert.DoesNotContain(sent.HeaderNames, name =>
            name.Equals("x-azdo-pat", StringComparison.OrdinalIgnoreCase)
            || name.Equals("cookie", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("application/json", sent.ContentType);
        using var requestJson = JsonDocument.Parse(sent.Body);
        Assert.Equal("requested-model", requestJson.RootElement.GetProperty("model").GetString());
        var input = requestJson.RootElement.GetProperty("input");
        Assert.Equal("system", input[0].GetProperty("role").GetString());
        Assert.Equal("dynamic system prompt", input[0].GetProperty("content").GetString());
        Assert.Equal("user", input[1].GetProperty("role").GetString());
        Assert.Equal("dynamic user prompt", input[1].GetProperty("content").GetString());
        Assert.Equal(AiProviderNames.N8n, result.Provider);
        Assert.Equal("{\"source\":\"text\"}", result.RawOutputText);
        using var generated = JsonDocument.Parse(result.JsonPayloadText);
        Assert.Equal("object", generated.RootElement.GetProperty("source").GetString());
        Assert.Equal(2, generated.RootElement.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task OpenAiKeepsResponsesApiRequestAndBearerAuthentication()
    {
        var handler = new RecordingHandler(_ => JsonResponse(HttpStatusCode.OK, """
            {
              "output": [
                { "content": [ { "type": "output_text", "text": "{\"ok\":true}" } ] }
              ]
            }
            """));
        var options = OpenAiOptions();
        var provider = CreateOpenAiProvider(handler, options);

        var result = await provider.GenerateJsonAsync(
            new AiJsonGenerationRequest("system", "user", null, "AnalyzeCv"),
            CancellationToken.None);

        var sent = Assert.Single(handler.Requests);
        Assert.Equal("https://api.openai.com/v1/responses", sent.Uri);
        Assert.Equal("Bearer test-api-key", sent.Authorization);
        using var json = JsonDocument.Parse(sent.Body);
        Assert.Equal("default-model", json.RootElement.GetProperty("model").GetString());
        Assert.Equal("system", json.RootElement.GetProperty("input")[0].GetProperty("content").GetString());
        Assert.Equal("user", json.RootElement.GetProperty("input")[1].GetProperty("content").GetString());
        Assert.Equal("{\"ok\":true}", result.JsonPayloadText);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-json")]
    [InlineData("{\"generatedText\":\"{}\"}")]
    [InlineData("{\"generatedObject\":[1],\"generatedText\":\"[1]\"}")]
    public async Task N8nRejectsInvalidEnvelopes(string body)
    {
        var handler = new RecordingHandler(_ => JsonResponse(HttpStatusCode.OK, body));
        var provider = CreateN8nProvider(handler, N8nOptions());

        await Assert.ThrowsAsync<AiInvalidResponseException>(() =>
            provider.GenerateJsonAsync(
                new AiJsonGenerationRequest("system", "user", null, "EvaluateWorkItem"),
                CancellationToken.None));
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task ProviderHttpErrorsRemainControlledWithoutDefaultRetry(HttpStatusCode status)
    {
        var handler = new RecordingHandler(_ => JsonResponse(status, "remote-body-not-exposed"));
        var provider = CreateN8nProvider(handler, N8nOptions());

        var exception = await Assert.ThrowsAsync<AiProviderHttpException>(() =>
            provider.GenerateJsonAsync(
                new AiJsonGenerationRequest("system", "user", null, "GenerateTestCases"),
                CancellationToken.None));

        Assert.Equal((int)status, exception.StatusCode);
        Assert.Equal(1, handler.CallCount);
        Assert.DoesNotContain("remote-body-not-exposed", exception.Message);
    }

    [Fact]
    public async Task ConfiguredRetryOnlyRetriesTransientFailures()
    {
        var responses = new Queue<HttpStatusCode>(
            [HttpStatusCode.InternalServerError, HttpStatusCode.OK]);
        var handler = new RecordingHandler(_ => JsonResponse(
            responses.Dequeue(),
            "{\"generatedObject\":{\"ok\":true},\"generatedText\":\"{}\"}"));
        var options = N8nOptions();
        options.RetryCount = 1;
        options.RetryDelayMilliseconds = 0;
        var provider = CreateN8nProvider(handler, options);

        await provider.GenerateJsonAsync(
            new AiJsonGenerationRequest("system", "user", null, "GenerateWorkItem"),
            CancellationToken.None);

        Assert.Equal(2, handler.CallCount);
    }

    [Fact]
    public async Task ProviderTimeoutIsControlledWhenTheCallerDidNotCancel()
    {
        var handler = new RecordingHandler(_ =>
            throw new TaskCanceledException("provider timeout"));
        var provider = CreateN8nProvider(handler, N8nOptions());

        await Assert.ThrowsAsync<AiProviderTimeoutException>(() =>
            provider.GenerateJsonAsync(
                new AiJsonGenerationRequest("system", "user", null, "AnalyzeCv"),
                CancellationToken.None));

        Assert.Equal(1, handler.CallCount);
    }

    [Fact]
    public async Task ProviderSelectionIsDeterministicAndNeverFallsBack()
    {
        var openAi = new StubProvider(AiProviderNames.OpenAI);
        var n8n = new StubProvider(AiProviderNames.N8n, new AiProviderHttpException("N8n", 500, 0));
        var options = N8nOptions();
        var generator = new AiJsonGenerator([openAi, n8n], Options.Create(options));

        await Assert.ThrowsAsync<AiProviderHttpException>(() => generator.GenerateJsonAsync(
            new AiJsonGenerationRequest("system", "user", null, "GenerateWorkItem")));

        Assert.Equal(0, openAi.CallCount);
        Assert.Equal(1, n8n.CallCount);
    }

    [Fact]
    public async Task UnknownProviderFailsBeforeAnyRemoteProviderIsCalled()
    {
        var openAi = new StubProvider(AiProviderNames.OpenAI);
        var n8n = new StubProvider(AiProviderNames.N8n);
        var generator = new AiJsonGenerator(
            [openAi, n8n],
            Options.Create(new AiConnectionOptions { Provider = "Unknown" }));

        await Assert.ThrowsAsync<UnsupportedAiProviderException>(() =>
            generator.GenerateJsonAsync(
                new AiJsonGenerationRequest("system", "user", null, "AnalyzeCv")));

        Assert.Equal(0, openAi.CallCount);
        Assert.Equal(0, n8n.CallCount);
    }

    [Fact]
    public async Task MissingSelectedProviderConfigurationFailsBeforeRemoteCall()
    {
        var handler = new RecordingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK));
        var provider = CreateN8nProvider(
            handler,
            new AiConnectionOptions
            {
                Provider = AiProviderNames.N8n,
                N8n = new N8nProviderOptions { DefaultModel = "model" }
            });

        await Assert.ThrowsAsync<AiConfigurationException>(() =>
            provider.GenerateJsonAsync(
                new AiJsonGenerationRequest("system", "user", null, "AnalyzeCv"),
                CancellationToken.None));

        Assert.Equal(0, handler.CallCount);
    }

    [Fact]
    public async Task CallerCancellationIsNotRetriedOrConvertedToTimeout()
    {
        using var cancellation = new CancellationTokenSource();
        var handler = new RecordingHandler(_ =>
        {
            cancellation.Cancel();
            throw new OperationCanceledException(cancellation.Token);
        });
        var options = N8nOptions();
        options.RetryCount = 2;
        var provider = CreateN8nProvider(handler, options);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            provider.GenerateJsonAsync(
                new AiJsonGenerationRequest("system", "user", null, "AnalyzeCv"),
                cancellation.Token));

        Assert.Equal(1, handler.CallCount);
    }

    [Fact]
    public async Task StructuredLogsContainDimensionsButNotPromptsOrRemoteBodies()
    {
        var handler = new RecordingHandler(_ =>
            JsonResponse(HttpStatusCode.BadRequest, "sensitive-remote-body"));
        var options = N8nOptions();
        var logger = new RecordingLogger<AiHttpExecutor>();
        var executor = new AiHttpExecutor(
            Options.Create(options),
            Options.Create(new TransportOptions()),
            logger);
        var client = new HttpClient(handler);
        var request = new AiJsonGenerationRequest(
            "sensitive-system-prompt",
            "sensitive-user-prompt",
            null,
            "GenerateWorkItem");

        await Assert.ThrowsAsync<AiProviderHttpException>(() => executor.SendAsync(
            client,
            () => new HttpRequestMessage(HttpMethod.Post, "https://n8n.example/webhook"),
            AiProviderNames.N8n,
            "model",
            request,
            CancellationToken.None));

        var messages = string.Join("\n", logger.Messages);
        Assert.Contains("Provider=N8n", messages);
        Assert.Contains("Operation=GenerateWorkItem", messages);
        Assert.DoesNotContain("sensitive-system-prompt", messages);
        Assert.DoesNotContain("sensitive-user-prompt", messages);
        Assert.DoesNotContain("sensitive-remote-body", messages);
    }

    private static N8nJsonProvider CreateN8nProvider(
        RecordingHandler handler,
        AiConnectionOptions options)
    {
        var factory = new SingleClientFactory(new HttpClient(handler));
        var executor = new AiHttpExecutor(
            Options.Create(options),
            Options.Create(new TransportOptions()),
            NullLogger<AiHttpExecutor>.Instance);
        return new N8nJsonProvider(
            factory,
            executor,
            Options.Create(options),
            NullLogger<N8nJsonProvider>.Instance,
            TestOptionsFactory.JsonSerializer);
    }

    private static OpenAiJsonProvider CreateOpenAiProvider(
        RecordingHandler handler,
        AiConnectionOptions options)
    {
        var client = new HttpClient(handler) { BaseAddress = new Uri(options.OpenAI.BaseUrl) };
        var factory = new SingleClientFactory(client);
        var executor = new AiHttpExecutor(
            Options.Create(options),
            Options.Create(new TransportOptions()),
            NullLogger<AiHttpExecutor>.Instance);
        return new OpenAiJsonProvider(
            factory,
            executor,
            Options.Create(options),
            TestOptionsFactory.JsonSerializer);
    }

    private static AiConnectionOptions N8nOptions() => new()
    {
        Provider = AiProviderNames.N8n,
        TimeoutSeconds = 100,
        MaxResponseBodyBytes = 4 * 1024 * 1024,
        N8n = new N8nProviderOptions
        {
            Url = "https://n8n.example/webhook",
            DefaultModel = "n8n-default"
        }
    };

    private static AiConnectionOptions OpenAiOptions() => new()
    {
        Provider = AiProviderNames.OpenAI,
        TimeoutSeconds = 100,
        MaxResponseBodyBytes = 4 * 1024 * 1024,
        OpenAI = new OpenAiProviderOptions
        {
            ApiKey = "test-api-key",
            BaseUrl = "https://api.openai.com/",
            DefaultModel = "default-model"
        }
    };

    private static HttpResponseMessage JsonResponse(HttpStatusCode status, string body) => new(status)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json")
    };

    private sealed class SingleClientFactory : IHttpClientFactory
    {
        private readonly HttpClient _client;

        public SingleClientFactory(HttpClient client) => _client = client;

        public HttpClient CreateClient(string name) => _client;
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly Func<RequestContext, HttpResponseMessage> _response;

        public RecordingHandler(Func<RequestContext, HttpResponseMessage> response) => _response = response;

        public List<RecordedRequest> Requests { get; } = [];
        public int CallCount { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            CallCount++;
            var body = request.Content is null
                ? string.Empty
                : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add(new RecordedRequest(
                request.Method,
                request.RequestUri!.ToString(),
                request.Headers.Authorization?.ToString(),
                request.Headers.Select(header => header.Key).ToArray(),
                request.Content?.Headers.ContentType?.MediaType,
                body));
            return _response(new RequestContext(cancellationToken));
        }
    }

    private sealed record RequestContext(CancellationToken CancellationToken);
    private sealed record RecordedRequest(
        HttpMethod Method,
        string Uri,
        string? Authorization,
        IReadOnlyList<string> HeaderNames,
        string? ContentType,
        string Body);

    private sealed class StubProvider : IAiProviderClient
    {
        private readonly Exception? _exception;

        public StubProvider(string provider, Exception? exception = null)
        {
            Provider = provider;
            _exception = exception;
        }

        public string Provider { get; }
        public int CallCount { get; private set; }

        public Task<AiJsonGenerationResult> GenerateJsonAsync(
            AiJsonGenerationRequest request,
            CancellationToken cancellationToken)
        {
            CallCount++;
            if (_exception is not null) return Task.FromException<AiJsonGenerationResult>(_exception);
            return Task.FromResult(new AiJsonGenerationResult(
                Provider, "model", "raw", "{\"ok\":true}"));
        }
    }

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public List<string> Messages { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Messages.Add(formatter(state, exception));
    }
}
