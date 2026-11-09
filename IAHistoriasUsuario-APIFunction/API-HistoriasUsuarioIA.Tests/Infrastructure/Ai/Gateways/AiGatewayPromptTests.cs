using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai.Gateways;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;

namespace API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.Ai.Gateways;

public sealed class AiGatewayPromptTests
{
    [Fact]
    public async Task WorkItemGeneration_PreservesPromptsModelAndOperation()
    {
        var generator = new RecordingAiGenerator();
        var gateway = new WorkItemGenerationAiGateway(generator);

        var response = await gateway.GenerateAsync(
            "frontend prompt",
            "frontend system prompt",
            "gpt-test",
            "GenerateTestCases",
            CancellationToken.None);

        var call = Assert.Single(generator.Calls);
        Assert.Equal("frontend system prompt", call.SystemPrompt);
        Assert.Equal("frontend prompt", call.UserPrompt);
        Assert.Equal("gpt-test", call.RequestedModel);
        Assert.Equal("GenerateTestCases", call.Operation);
        Assert.Equal("model-used", response.Model);
        Assert.Equal("{\"ok\":true}", response.JsonPayloadText);
    }

    [Fact]
    public async Task WorkItemGeneration_RejectsMissingSystemPromptBeforeProvider()
    {
        var generator = new RecordingAiGenerator();
        var gateway = new WorkItemGenerationAiGateway(generator);

        await Assert.ThrowsAsync<ArgumentException>(() => gateway.GenerateAsync(
            "frontend prompt", " ", "gpt-test", "GenerateWorkItem", CancellationToken.None));

        Assert.Empty(generator.Calls);
    }

    [Fact]
    public async Task WorkItemEvaluation_PreservesPromptsAndAddsAzureWorkItemPayload()
    {
        var generator = new RecordingAiGenerator();
        var gateway = new WorkItemEvaluationAiGateway(generator, TestOptionsFactory.JsonSerializer);

        var response = await gateway.EvaluateAsync(
            new AzdoWorkItemDetails
            {
                Id = 321,
                Title = "Registrar solicitudes",
                WorkItemType = "User Story"
            },
            "frontend evaluation prompt",
            "frontend evaluation system prompt",
            "gpt-test",
            CancellationToken.None);

        var call = Assert.Single(generator.Calls);
        Assert.Equal("frontend evaluation system prompt", call.SystemPrompt);
        Assert.Contains("frontend evaluation prompt", call.UserPrompt);
        Assert.Contains("\"workItem\"", call.UserPrompt);
        Assert.Contains("\"id\":321", call.UserPrompt);
        Assert.Equal("EvaluateWorkItem", call.Operation);
        Assert.Equal("model-used", response.Model);
    }

    [Theory]
    [InlineData("", "frontend system prompt")]
    [InlineData("frontend prompt", "")]
    public async Task WorkItemEvaluation_RejectsMissingPromptsBeforeProvider(
        string prompt,
        string systemPrompt)
    {
        var generator = new RecordingAiGenerator();
        var gateway = new WorkItemEvaluationAiGateway(generator, TestOptionsFactory.JsonSerializer);

        await Assert.ThrowsAsync<ArgumentException>(() => gateway.EvaluateAsync(
            new AzdoWorkItemDetails { Id = 321 },
            prompt,
            systemPrompt,
            "gpt-test",
            CancellationToken.None));

        Assert.Empty(generator.Calls);
    }

    [Fact]
    public async Task CvAnalysis_UsesTheExistingBackendPromptAndOperation()
    {
        var generator = new RecordingAiGenerator();
        var promptProvider = new RecordingPromptProvider("cv system prompt");
        var gateway = new CvAnalysisAiGateway(generator, promptProvider);

        await gateway.AnalyzeAsync("cv user prompt", "gpt-test", CancellationToken.None);

        Assert.Equal(PromptNames.CvAnalysisSystem, promptProvider.RequestedPromptName);
        var call = Assert.Single(generator.Calls);
        Assert.Equal("cv system prompt", call.SystemPrompt);
        Assert.Equal("cv user prompt", call.UserPrompt);
        Assert.Equal("AnalyzeCv", call.Operation);
    }

    private sealed class RecordingAiGenerator : IAiJsonGenerator
    {
        public List<AiJsonGenerationRequest> Calls { get; } = [];

        public Task<AiJsonGenerationResult> GenerateJsonAsync(
            AiJsonGenerationRequest request,
            CancellationToken cancellationToken = default)
        {
            Calls.Add(request);
            return Task.FromResult(new AiJsonGenerationResult(
                AiProviderNames.OpenAI,
                "model-used",
                "raw-output",
                "{\"ok\":true}"));
        }
    }

    private sealed class RecordingPromptProvider : IPromptProvider
    {
        private readonly string _prompt;

        public RecordingPromptProvider(string prompt) => _prompt = prompt;

        public string? RequestedPromptName { get; private set; }

        public Task<string> GetPromptAsync(
            string promptName,
            CancellationToken cancellationToken = default)
        {
            RequestedPromptName = promptName;
            return Task.FromResult(_prompt);
        }
    }
}
