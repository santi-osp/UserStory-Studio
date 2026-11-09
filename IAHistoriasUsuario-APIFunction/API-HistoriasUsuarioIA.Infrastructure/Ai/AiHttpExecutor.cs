using System.Buffers;
using System.Diagnostics;
using System.Text;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

public sealed record AiHttpResponse(int StatusCode, string Body);

public interface IAiHttpExecutor
{
    Task<AiHttpResponse> SendAsync(
        HttpClient client,
        Func<HttpRequestMessage> requestFactory,
        string provider,
        string model,
        AiJsonGenerationRequest request,
        CancellationToken cancellationToken);
}

public sealed class AiHttpExecutor : IAiHttpExecutor
{
    private static readonly UTF8Encoding StrictUtf8 = new(
        encoderShouldEmitUTF8Identifier: false,
        throwOnInvalidBytes: true);
    private static readonly HashSet<int> TransientStatusCodes = [408, 429, 500, 502, 503, 504];
    private readonly AiConnectionOptions _options;
    private readonly ILogger<AiHttpExecutor> _logger;
    private readonly int _readBufferBytes;

    public AiHttpExecutor(
        IOptions<AiConnectionOptions> options,
        IOptions<TransportOptions> transport,
        ILogger<AiHttpExecutor> logger)
    {
        _options = options.Value;
        _readBufferBytes = transport.Value.ReadBufferBytes;
        _logger = logger;
    }

    public async Task<AiHttpResponse> SendAsync(
        HttpClient client,
        Func<HttpRequestMessage> requestFactory,
        string provider,
        string model,
        AiJsonGenerationRequest request,
        CancellationToken cancellationToken)
    {
        var maxAttempts = _options.RetryCount + 1;
        _logger.LogInformation(
            "AI request starting. Provider={AiProvider} Operation={AiOperation} Model={AiModel} SystemPromptLength={SystemPromptLength} UserPromptLength={UserPromptLength} TimeoutSeconds={TimeoutSeconds} MaxAttempts={MaxAttempts}",
            provider, request.Operation, model, request.SystemPrompt.Length, request.UserPrompt.Length,
            _options.TimeoutSeconds, maxAttempts);

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            var stopwatch = Stopwatch.StartNew();
            try
            {
                using var httpRequest = requestFactory();
                using var response = await client.SendAsync(
                    httpRequest,
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken);
                var body = await ReadResponseBodyAsync(
                    response.Content,
                    provider,
                    _options.MaxResponseBodyBytes,
                    cancellationToken);
                var statusCode = (int)response.StatusCode;
                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation(
                        "AI request completed. Provider={AiProvider} Operation={AiOperation} Model={AiModel} DurationMs={DurationMs} RemoteStatus={RemoteStatus} RetryAttempt={RetryAttempt} BodyLength={BodyLength} Outcome=Success",
                        provider, request.Operation, model, stopwatch.ElapsedMilliseconds, statusCode,
                        attempt - 1, body.Length);
                    return new AiHttpResponse(statusCode, body);
                }

                if (attempt < maxAttempts && TransientStatusCodes.Contains(statusCode))
                {
                    await DelayBeforeRetryAsync(provider, request.Operation, attempt, statusCode, cancellationToken);
                    continue;
                }

                _logger.LogWarning(
                    "AI request failed. Provider={AiProvider} Operation={AiOperation} Model={AiModel} DurationMs={DurationMs} RemoteStatus={RemoteStatus} RetryAttempt={RetryAttempt} BodyLength={BodyLength} Outcome=HttpError",
                    provider, request.Operation, model, stopwatch.ElapsedMilliseconds, statusCode,
                    attempt - 1, body.Length);
                throw new AiProviderHttpException(provider, statusCode, body.Length);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (OperationCanceledException exception)
            {
                if (attempt < maxAttempts)
                {
                    await DelayBeforeRetryAsync(provider, request.Operation, attempt, null, cancellationToken);
                    continue;
                }
                throw new AiProviderTimeoutException(provider, exception);
            }
            catch (HttpRequestException exception)
            {
                if (attempt < maxAttempts)
                {
                    await DelayBeforeRetryAsync(provider, request.Operation, attempt, null, cancellationToken);
                    continue;
                }
                throw new AiProviderHttpException(provider, null, 0, exception);
            }
        }

        throw new InvalidOperationException("AI retry loop ended unexpectedly.");
    }

    private async Task<string> ReadResponseBodyAsync(
        HttpContent content,
        string provider,
        int maxResponseBodyBytes,
        CancellationToken cancellationToken)
    {
        if (content.Headers.ContentLength is > 0
            && content.Headers.ContentLength.Value > maxResponseBodyBytes)
        {
            throw new AiInvalidResponseException(
                provider,
                "El proveedor de IA devolvio una respuesta demasiado grande.");
        }

        await using var source = await content.ReadAsStreamAsync(cancellationToken);
        var initialCapacity = content.Headers.ContentLength is > 0
            ? (int)Math.Min(content.Headers.ContentLength.Value, maxResponseBodyBytes)
            : 0;
        await using var buffer = new MemoryStream(initialCapacity);
        var chunk = ArrayPool<byte>.Shared.Rent(
            Math.Min(_readBufferBytes, maxResponseBodyBytes + 1));

        try
        {
            var totalBytes = 0;
            while (true)
            {
                var bytesToRead = Math.Min(chunk.Length, maxResponseBodyBytes - totalBytes + 1);
                var read = await source.ReadAsync(chunk.AsMemory(0, bytesToRead), cancellationToken);
                if (read == 0)
                    break;

                totalBytes += read;
                if (totalBytes > maxResponseBodyBytes)
                {
                    throw new AiInvalidResponseException(
                        provider,
                        "El proveedor de IA devolvio una respuesta demasiado grande.");
                }

                await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
            }

            try
            {
                return StrictUtf8.GetString(buffer.GetBuffer(), 0, checked((int)buffer.Length));
            }
            catch (DecoderFallbackException exception)
            {
                throw new AiInvalidResponseException(
                    provider,
                    "El proveedor de IA devolvio una respuesta que no usa UTF-8 valido.",
                    exception);
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(chunk, clearArray: true);
        }
    }

    private async Task DelayBeforeRetryAsync(
        string provider,
        string operation,
        int attempt,
        int? statusCode,
        CancellationToken cancellationToken)
    {
        _logger.LogWarning(
            "AI request will retry. Provider={AiProvider} Operation={AiOperation} RetryAttempt={RetryAttempt} RemoteStatus={RemoteStatus}",
            provider, operation, attempt, statusCode);
        if (_options.RetryDelayMilliseconds > 0)
            await Task.Delay(_options.RetryDelayMilliseconds, cancellationToken);
    }
}
