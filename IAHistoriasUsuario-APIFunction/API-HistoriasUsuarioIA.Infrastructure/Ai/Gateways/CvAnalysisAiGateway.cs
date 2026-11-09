using API_HistoriasUsuarioIA_funcion.Application.Abstractions;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai.Gateways;

public sealed class CvAnalysisAiGateway : ICvAnalysisAiGateway
{
    private readonly IAiJsonGenerator _aiJsonGenerator;
    private readonly IPromptProvider _promptProvider;

    public CvAnalysisAiGateway(
        IAiJsonGenerator aiJsonGenerator,
        IPromptProvider promptProvider)
    {
        _aiJsonGenerator = aiJsonGenerator;
        _promptProvider = promptProvider;
    }

    public async Task<CvAnalysisAiGatewayResponse> AnalyzeAsync(
        string prompt,
        string? requestedModel,
        CancellationToken cancellationToken)
    {
        var systemPrompt = await _promptProvider.GetPromptAsync(
            PromptNames.CvAnalysisSystem,
            cancellationToken);
        var result = await _aiJsonGenerator.GenerateJsonAsync(
            new AiJsonGenerationRequest(systemPrompt, prompt, requestedModel, "AnalyzeCv"),
            cancellationToken);

        return new CvAnalysisAiGatewayResponse(result.Model, result.JsonPayloadText);
    }
}
