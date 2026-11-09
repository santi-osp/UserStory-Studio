using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateTestCases;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai.Gateways;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Tests.Application.UseCases;

public sealed class AiUseCaseProviderParityTests
{
    [Theory]
    [InlineData(AiProviderNames.OpenAI)]
    [InlineData(AiProviderNames.N8n)]
    public async Task EveryAiUseCaseUsesTheConfiguredProviderWithoutChangingItsContract(string providerName)
    {
        var provider = new OperationResultProvider(providerName);
        var options = new AiConnectionOptions
        {
            Provider = providerName,
            TimeoutSeconds = 100,
            MaxResponseBodyBytes = 4 * 1024 * 1024,
            OpenAI = new OpenAiProviderOptions
            {
                ApiKey = "test-key",
                BaseUrl = "https://api.openai.com/",
                DefaultModel = "model"
            },
            N8n = new N8nProviderOptions
            {
                Url = "https://n8n.example/webhook",
                DefaultModel = "model"
            }
        };
        var generator = new AiJsonGenerator([provider], Options.Create(options));
        var generationGateway = new WorkItemGenerationAiGateway(generator);

        var workItem = await new GenerateWorkItemUseCase(
            generationGateway,
            NullLogger<GenerateWorkItemUseCase>.Instance,
            TestOptionsFactory.JsonSerializer,
            TestOptionsFactory.TestCaseValidator).ExecuteAsync(
                new GenerateWorkItemCommand(
                    "work item prompt",
                    "work item system",
                    "model",
                    "cid",
                    "tests"),
                CancellationToken.None);
        Assert.Contains("\"workItem\"", workItem.Json);

        var testCases = await new GenerateTestCasesUseCase(
            generationGateway,
            NullLogger<GenerateTestCasesUseCase>.Instance,
            TestOptionsFactory.JsonSerializer,
            TestOptionsFactory.TestCaseValidator).ExecuteAsync(
                new GenerateTestCasesCommand(
                    "test cases prompt",
                    "test cases system",
                    "model",
                    "cid",
                    "tests"),
                CancellationToken.None);
        Assert.Contains("\"testCases\"", testCases.Json);

        var evaluation = await new EvaluateWorkItemUseCase(
            new StubAzureDevOpsEvaluationGateway(),
            new WorkItemEvaluationAiGateway(generator, TestOptionsFactory.JsonSerializer),
            NullLogger<EvaluateWorkItemUseCase>.Instance,
            TestOptionsFactory.JsonSerializer).ExecuteAsync(
                new EvaluateWorkItemCommand(
                    "org",
                    "project",
                    42,
                    "model",
                    "evaluation prompt",
                    "evaluation system",
                    "pat-placeholder",
                    "cid",
                    "tests"),
                CancellationToken.None);
        Assert.Equal(42, evaluation.WorkItemId);

        var cv = await new AnalyzeCvUseCase(
            new CvAnalysisAiGateway(generator, new StubPromptProvider()),
            NullLogger<AnalyzeCvUseCase>.Instance,
            Options.Create(new CvAnalysisOptions()),
            TestOptionsFactory.JsonSerializer).ExecuteAsync(
                new AnalyzeCvCommand(
                    "cv text",
                    "model",
                    "cv.pdf",
                    "tests",
                    1,
                    "cid",
                    "tests"),
                CancellationToken.None);
        Assert.Equal("cv.pdf", cv.FileName);

        Assert.Equal(
            ["GenerateWorkItem", "GenerateTestCases", "EvaluateWorkItem", "AnalyzeCv"],
            provider.Operations);
    }

    private sealed class OperationResultProvider : IAiProviderClient
    {
        public OperationResultProvider(string provider) => Provider = provider;

        public string Provider { get; }
        public List<string> Operations { get; } = [];

        public Task<AiJsonGenerationResult> GenerateJsonAsync(
            AiJsonGenerationRequest request,
            CancellationToken cancellationToken)
        {
            Operations.Add(request.Operation);
            var json = request.Operation switch
            {
                "GenerateWorkItem" => """
                    {"workItemType":"User Story","workItem":{"title":"Title","description":"Description","acceptanceCriteria":"AC"},"testCases":[]}
                    """,
                "GenerateTestCases" => """
                    {"suiteTitle":"Functional suite","testCases":[{"title":"Case","state":"Ready","steps":[{"action":"Act","expected":"Expected"}]}]}
                    """,
                _ => "{}"
            };
            return Task.FromResult(new AiJsonGenerationResult(
                Provider,
                "model",
                json,
                json));
        }
    }

    private sealed class StubAzureDevOpsEvaluationGateway : IAzureDevOpsWorkItemEvaluationGateway
    {
        public Task<WorkItemEvaluationSource> GetEvaluationSourceAsync(
            EvaluateWorkItemCommand command,
            CancellationToken cancellationToken) =>
            Task.FromResult(new WorkItemEvaluationSource(
                new AzdoWorkItemDetails
                {
                    Id = command.WorkItemId,
                    Title = "Title",
                    WorkItemType = "User Story"
                },
                "https://dev.azure.com/org/project/_workitems/edit/42"));
    }

    private sealed class StubPromptProvider : IPromptProvider
    {
        public Task<string> GetPromptAsync(
            string promptName,
            CancellationToken cancellationToken = default) =>
            Task.FromResult("cv system prompt");
    }
}
