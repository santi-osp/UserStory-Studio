using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

public sealed class AiJsonGenerator : IAiJsonGenerator
{
    private readonly IReadOnlyDictionary<string, IAiProviderClient> _providers;
    private readonly AiConnectionOptions _options;

    public AiJsonGenerator(
        IEnumerable<IAiProviderClient> providers,
        IOptions<AiConnectionOptions> options)
    {
        _providers = providers.ToDictionary(
            provider => provider.Provider,
            StringComparer.OrdinalIgnoreCase);
        _options = options.Value;
    }

    public Task<AiJsonGenerationResult> GenerateJsonAsync(
        AiJsonGenerationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.SystemPrompt))
            throw new ArgumentException("systemPrompt es requerido.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.UserPrompt))
            throw new ArgumentException("userPrompt es requerido.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.Operation))
            throw new ArgumentException("operation es requerida.", nameof(request));

        var providerName = AiProviderNames.NormalizeKnown(_options.Provider);
        if (!_providers.TryGetValue(providerName, out var provider))
            throw new UnsupportedAiProviderException(providerName);

        return provider.GenerateJsonAsync(
            request with
            {
                SystemPrompt = request.SystemPrompt.Trim(),
                UserPrompt = request.UserPrompt.Trim(),
                Operation = request.Operation.Trim()
            },
            cancellationToken);
    }
}
