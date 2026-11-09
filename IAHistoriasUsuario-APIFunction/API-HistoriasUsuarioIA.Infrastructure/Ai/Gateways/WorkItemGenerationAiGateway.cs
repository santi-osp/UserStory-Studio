using API_HistoriasUsuarioIA_funcion.Application.Abstractions;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai.Gateways;

public sealed class WorkItemGenerationAiGateway : IWorkItemGenerationAiGateway
{
    private readonly IAiJsonGenerator _aiJsonGenerator;

    public WorkItemGenerationAiGateway(IAiJsonGenerator aiJsonGenerator)
    {
        _aiJsonGenerator = aiJsonGenerator;
    }

    public async Task<WorkItemGenerationAiResponse> GenerateAsync(
        string prompt,
        string? systemPrompt,
        string? requestedModel,
        string operation,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(systemPrompt))
            throw new ArgumentException("systemPrompt es requerido para generar work items.", nameof(systemPrompt));

        var result = await _aiJsonGenerator.GenerateJsonAsync(
            new AiJsonGenerationRequest(systemPrompt, prompt, requestedModel, operation),
            cancellationToken);

        return new WorkItemGenerationAiResponse(
            result.Model,
            result.RawOutputText,
            result.JsonPayloadText);
    }
}
