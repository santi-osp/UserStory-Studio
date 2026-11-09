using System.Net;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Common;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Tests.Function.Configuration;

public sealed class OperationalConsumerTests
{
    [Fact]
    public void AzureDevOpsServiceRejectsInvalidOperationalLimitsInsteadOfSilentlyClampingThem()
    {
        using var client = new HttpClient(new RecordingHandler());

        Assert.Throws<ArgumentOutOfRangeException>(() => new AzDoService(
            "org",
            "project",
            client,
            "7.1",
            logger: null,
            defaultWorkItemSearchTop: 201,
            maxWorkItemSearchTop: 200,
            projectsTop: 100,
            classificationDepth: 100,
            commentsTop: 200,
            testPlansTop: 50,
            maxExternalErrorDetailLength: 500,
            jsonOptions: TestOptionsFactory.JsonSerializer.Options));
    }

    [Fact]
    public async Task AzureDevOpsQueriesUseConfiguredTopAndDepthValues()
    {
        var handler = new RecordingHandler();
        using var client = new HttpClient(handler);
        var service = new AzDoService(
            "org",
            "project",
            client,
            "7.1",
            logger: null,
            defaultWorkItemSearchTop: 100,
            maxWorkItemSearchTop: 200,
            projectsTop: 17,
            classificationDepth: 18,
            commentsTop: 19,
            testPlansTop: 20,
            maxExternalErrorDetailLength: 500,
            jsonOptions: new JsonPayloadSerializer(Options.Create(new RequestValidationOptions())).Options);

        await service.GetProjectsAsync();
        await service.GetClassificationPathsAsync("project", "areas");
        await service.GetWorkItemDiscussionCommentsAsync(123);
        await service.GetTestPlansAsync();

        Assert.Contains(handler.RequestUris, uri => uri.Contains("$top=17", StringComparison.Ordinal));
        Assert.Contains(handler.RequestUris, uri => uri.Contains("$depth=18", StringComparison.Ordinal));
        Assert.Contains(handler.RequestUris, uri => uri.Contains("$top=19", StringComparison.Ordinal)
            && uri.Contains("includeDeleted=true", StringComparison.Ordinal));
        Assert.Contains(handler.RequestUris, uri => uri.Contains("$top=20", StringComparison.Ordinal));
    }

    [Fact]
    public void ObservabilityLimitsControlScalarGenericArrayAndExternalDetailSanitization()
    {
        var options = new ObservabilityOptions
        {
            MaxScalarLogLength = 5,
            MaxContextArrayItems = 2,
            MaxGenericTextLength = 7,
            MaxExternalErrorDetailLength = 12
        };
        var serializer = new JsonPayloadSerializer(Options.Create(new RequestValidationOptions()));
        var helper = new ErrorLoggingHelper(Options.Create(options), serializer);
        var logger = new CapturingLogger();

        Assert.Equal("1234567...[TRUNCATED]", helper.Truncate("12345678"));
        Assert.Equal("12345...[TRUNCATED]", helper.RedactHeaderValue("x-safe", "123456"));
        Assert.Equal("[REDACTED]", helper.RedactHeaderValue("Authorization", "secret"));

        helper.LogRequestWithBody(
            logger,
            "endpoint",
            "correlation",
            "{}",
            new { values = new[] { "first", "second", "third" } });
        Assert.Contains("\"truncatedItems\":1", logger.LastMessage, StringComparison.Ordinal);
        Assert.DoesNotContain("third", logger.LastMessage, StringComparison.Ordinal);

        var exception = new AzDoRequestException(
            "operation",
            400,
            "https://example.test",
            "{\"message\":\"abcdefghijklmnopqrst\"}");
        var detail = AzureDevOpsErrorMessageSanitizer.ToSafeMutationDetail(
            exception,
            options.MaxExternalErrorDetailLength,
            serializer.Options.MaxDepth);
        Assert.Equal("abcdefghijkl", detail);

        var sensitive = new AzDoRequestException(
            "operation",
            400,
            "https://example.test",
            "{\"message\":\"See https://internal.example.test and x-azdo-pat\"}");
        Assert.Equal(
            "Azure DevOps rechazo la operacion con estado 400.",
            AzureDevOpsErrorMessageSanitizer.ToSafeMutationDetail(
                sensitive,
                options.MaxExternalErrorDetailLength,
                serializer.Options.MaxDepth));
    }

    [Fact]
    public async Task SuiteCoordinatorHonorsConfiguredMaximumNameAttempts()
    {
        var session = new AlwaysConflictingCreationSession();
        var coordinator = new TestSuiteCreationCoordinator(
            TimeProvider.System,
            NullLogger<TestSuiteCreationCoordinator>.Instance,
            maximumNameAttempts: 2);

        await Assert.ThrowsAsync<TestSuiteNameConflictException>(() =>
            coordinator.CreateAvailableStaticSuiteAsync(
                session,
                new TestPlanContext(1, "Plan", 2),
                "Suite"));

        Assert.Equal(2, session.CreateAttempts);
        Assert.Equal(2, session.SiblingQueries);
    }

    [Fact]
    public void TestCaseContentValidatorUsesTheSharedWorkItemLimit()
    {
        var limits = new WorkItemLimitsOptions { MaxTestCases = 2 };
        var validator = new TestCaseContentValidator(Options.Create(limits));
        var validCase = new TestCaseFields
        {
            Title = "Case",
            State = "Design",
            Steps = [new TestCaseStep { Action = "act", Expected = "result" }]
        };

        Assert.True(validator.AreValid([validCase, validCase], requireAny: true));
        Assert.False(validator.AreValid([validCase, validCase, validCase], requireAny: true));
    }

    [Fact]
    public async Task CvPromptUsesConfiguredPromptTextLimit()
    {
        var gateway = new CapturingCvGateway();
        var limits = new CvAnalysisOptions
        {
            MaxTextLength = 10,
            MaxPromptTextLength = 6,
            MaxPageCount = 2
        };
        var useCase = new AnalyzeCvUseCase(
            gateway,
            NullLogger<AnalyzeCvUseCase>.Instance,
            Options.Create(limits),
            new JsonPayloadSerializer(Options.Create(new RequestValidationOptions())));

        await useCase.ExecuteAsync(
            new AnalyzeCvCommand("abcdefghij", null, string.Empty, string.Empty, null, "cid", "tests"),
            CancellationToken.None);

        var normalizedPrompt = gateway.Prompt.Replace("\r\n", "\n", StringComparison.Ordinal);
        Assert.Contains("truncado a 6 caracteres", normalizedPrompt, StringComparison.Ordinal);
        Assert.Contains("<<<CV_TEXT>>>\nabcdef\n<<<END_CV_TEXT>>>", normalizedPrompt, StringComparison.Ordinal);
        Assert.DoesNotContain("ghij", normalizedPrompt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AiResponseReaderUsesTheSameConfiguredTransportBuffer()
    {
        var configuredBuffer = TransportOptions.MinReadBufferBytes;
        var responseStream = new ResponseRecordingStream(
            System.Text.Encoding.UTF8.GetBytes(new string('a', configuredBuffer + 10)));
        using var client = new HttpClient(new SingleResponseHandler(new StreamContent(responseStream)));
        var executor = new AiHttpExecutor(
            Options.Create(new AiConnectionOptions
            {
                MaxResponseBodyBytes = configuredBuffer * 2,
                RetryCount = 0
            }),
            Options.Create(new TransportOptions { ReadBufferBytes = configuredBuffer }),
            NullLogger<AiHttpExecutor>.Instance);

        var response = await executor.SendAsync(
            client,
            () => new HttpRequestMessage(HttpMethod.Get, "https://example.test"),
            "provider",
            "model",
            new AiJsonGenerationRequest("system", "user", null, "operation"),
            CancellationToken.None);

        Assert.Equal(configuredBuffer + 10, response.Body.Length);
        Assert.Equal(configuredBuffer, responseStream.MaximumRequestedBytes);
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public List<string> RequestUris { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestUris.Add(request.RequestUri!.OriginalString);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"value\":[],\"comments\":[]}")
            });
        }
    }

    private sealed class SingleResponseHandler(HttpContent content) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
    }

    private sealed class ResponseRecordingStream(byte[] bytes) : Stream
    {
        private readonly MemoryStream _inner = new(bytes);
        public int MaximumRequestedBytes { get; private set; }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => _inner.Length;
        public override long Position { get => _inner.Position; set => throw new NotSupportedException(); }
        public override void Flush() => throw new NotSupportedException();
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            MaximumRequestedBytes = Math.Max(MaximumRequestedBytes, buffer.Length);
            return await _inner.ReadAsync(buffer, cancellationToken);
        }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    private sealed class CapturingLogger : ILogger
    {
        public string LastMessage { get; private set; } = string.Empty;
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            LastMessage = formatter(state, exception);
    }

    private sealed class AlwaysConflictingCreationSession : IAzureDevOpsWorkItemCreationSession
    {
        public int CreateAttempts { get; private set; }
        public int SiblingQueries { get; private set; }

        public Task<IReadOnlyList<TestSuiteSummary>> GetDirectChildSuitesAsync(int planId, int rootSuiteId)
        {
            SiblingQueries++;
            return Task.FromResult<IReadOnlyList<TestSuiteSummary>>([]);
        }

        public Task<CreatedTestSuite> CreateStaticSuiteAsync(int planId, int parentSuiteId, string name)
        {
            CreateAttempts++;
            throw new TestSuiteNameConflictException();
        }

        public Task<WorkItemConfigResponse> GetWorkItemConfigAsync(string requestedWorkItemType) => throw new NotSupportedException();
        public Task<int> CreateWorkItemAsync(CreateWorkItemPayload payload, WorkItemConfigResponse workItemConfig) => throw new NotSupportedException();
        public Task<CreatedTestCase> CreateTestCaseAsync(string iterationPath, string areaPath, TestCaseFields testCase) => throw new NotSupportedException();
        public Task UpdateTestCaseStateAsync(int testCaseId, string state) => throw new NotSupportedException();
        public Task<TestPlanContext> GetTestPlanContextAsync(int planId) => throw new NotSupportedException();
        public Task<CreatedTestSuite> CreateRequirementSuiteAsync(int planId, int parentSuiteId, int requirementId) => throw new NotSupportedException();
        public Task LinkTestedByAsync(int workItemId, int testCaseId) => throw new NotSupportedException();
        public Task AddTestCaseToSuiteAsync(int planId, int suiteId, int testCaseId) => throw new NotSupportedException();
        public string WorkItemUrl(int workItemId) => throw new NotSupportedException();
    }

    private sealed class CapturingCvGateway : ICvAnalysisAiGateway
    {
        public string Prompt { get; private set; } = string.Empty;

        public Task<CvAnalysisAiGatewayResponse> AnalyzeAsync(
            string prompt,
            string? requestedModel,
            CancellationToken cancellationToken)
        {
            Prompt = prompt;
            return Task.FromResult(new CvAnalysisAiGatewayResponse("model", "{}"));
        }
    }
}
