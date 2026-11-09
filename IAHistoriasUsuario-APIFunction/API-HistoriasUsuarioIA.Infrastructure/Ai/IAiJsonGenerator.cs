namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

public sealed record AiJsonGenerationRequest(
    string SystemPrompt,
    string UserPrompt,
    string? RequestedModel,
    string Operation);

public sealed record AiJsonGenerationResult(
    string Provider,
    string Model,
    string RawOutputText,
    string JsonPayloadText);

public interface IAiJsonGenerator
{
    Task<AiJsonGenerationResult> GenerateJsonAsync(
        AiJsonGenerationRequest request,
        CancellationToken cancellationToken = default);
}

public interface IAiProviderClient
{
    string Provider { get; }

    Task<AiJsonGenerationResult> GenerateJsonAsync(
        AiJsonGenerationRequest request,
        CancellationToken cancellationToken);
}
