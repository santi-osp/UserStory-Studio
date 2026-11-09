using System.Text;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Tests.Function.Helpers;

public sealed class RequestValidationHelperTests
{
    private const string CorrelationId = "security-test";

    [Fact]
    public async Task ReadBodyAsync_AcceptsBodyWithinLimit()
    {
        var request = CreateRequest("{\"prompt\":\"ok\"}", includeContentLength: true);

        var result = await TestOptionsFactory.RequestValidation.ReadBodyAsync(
            request,
            CorrelationId,
            requiredBody: true,
            maxBodyBytes: 64,
            CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal("{\"prompt\":\"ok\"}", result.Body);
    }

    [Fact]
    public async Task ReadBodyAsync_RejectsOversizedContentLengthBeforeReadingStream()
    {
        var context = new DefaultHttpContext();
        context.Request.ContentLength = 65;
        context.Request.Body = new ThrowOnReadStream();

        var result = await TestOptionsFactory.RequestValidation.ReadBodyAsync(
            context.Request,
            CorrelationId,
            requiredBody: true,
            maxBodyBytes: 64,
            CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, result.StatusCode);
        Assert.Equal("PAYLOAD_TOO_LARGE", result.Error?.Code);
    }

    [Fact]
    public async Task ReadBodyAsync_RejectsOversizedStreamWithoutContentLength()
    {
        var request = CreateRequest(new string('a', 65), includeContentLength: false);

        var result = await TestOptionsFactory.RequestValidation.ReadBodyAsync(
            request,
            CorrelationId,
            requiredBody: true,
            maxBodyBytes: 64,
            CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, result.StatusCode);
    }

    [Fact]
    public async Task ReadBodyAsync_UsesConfiguredSharedReadBuffer()
    {
        var configuredBuffer = TransportOptions.MinReadBufferBytes;
        var helper = TestOptionsFactory.CreateRequestValidationHelper(
            transport: new TransportOptions { ReadBufferBytes = configuredBuffer });
        var context = new DefaultHttpContext();
        var stream = new RecordingReadStream(Encoding.UTF8.GetBytes(new string('a', configuredBuffer + 10)));
        context.Request.Body = stream;

        var result = await helper.ReadBodyAsync(
            context.Request,
            CorrelationId,
            requiredBody: true,
            maxBodyBytes: configuredBuffer * 2,
            CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal(configuredBuffer, stream.MaximumRequestedBytes);
    }

    [Fact]
    public void ValidateJsonIfPresent_RejectsJsonOverMaximumDepth()
    {
        var json = string.Concat(
            Enumerable.Repeat("{\"nested\":", TestOptionsFactory.RequestValidation.MaxJsonDepth + 1))
            + "null"
            + new string('}', TestOptionsFactory.RequestValidation.MaxJsonDepth + 1);

        var result = TestOptionsFactory.RequestValidation.ValidateJsonIfPresent(json, CorrelationId);

        Assert.Equal("INVALID_JSON", result?.Code);
    }

    [Fact]
    public void JsonValidationAndPayloadSerializerUseTheSameConfiguredDepth()
    {
        var helper = TestOptionsFactory.CreateRequestValidationHelper(
            requestValidation: new RequestValidationOptions { MaxJsonDepth = 4 });

        Assert.Equal(4, helper.MaxJsonDepth);
        Assert.Equal(4, helper.JsonOptions.MaxDepth);

        var accepted = helper.ValidateJsonIfPresent("{\"a\":{\"b\":1}}", CorrelationId);
        var rejected = helper.ValidateJsonIfPresent("{\"a\":{\"b\":{\"c\":{\"d\":{\"e\":1}}}}}", CorrelationId);
        Assert.Null(accepted);
        Assert.Equal("INVALID_JSON", rejected?.Code);
    }

    [Fact]
    public void ValidateWorkItemIds_RejectsOversizedList()
    {
        var ids = Enumerable.Range(1, TestOptionsFactory.RequestValidation.MaxWorkItemIds + 1).ToArray();

        var result = TestOptionsFactory.RequestValidation.ValidateWorkItemIds(ids, hasInvalidIds: false, CorrelationId);

        Assert.Equal("VALIDATION_ERROR", result?.Code);
    }

    [Fact]
    public void ValidateOptionalText_RejectsTextOverLimit()
    {
        var result = TestOptionsFactory.RequestValidation.ValidateOptionalText(
            "12345",
            "field",
            maxLength: 4,
            CorrelationId);

        Assert.Equal("VALIDATION_ERROR", result?.Code);
    }

    [Fact]
    public void ValidateTestCases_RejectsTooManyItemsAndSteps()
    {
        var tooManyCases = Enumerable
            .Range(0, TestOptionsFactory.RequestValidation.MaxTestCases + 1)
            .Select(index => ValidTestCase(index))
            .ToArray();
        var casesResult = TestOptionsFactory.RequestValidation.ValidateTestCases(tooManyCases, CorrelationId);

        var tooManySteps = ValidTestCase(1);
        tooManySteps.Steps = Enumerable
            .Range(0, TestOptionsFactory.RequestValidation.MaxTestCaseSteps + 1)
            .Select(_ => new TestCaseStep { Action = "accion", Expected = "resultado" })
            .ToList();
        var stepsResult = TestOptionsFactory.RequestValidation.ValidateTestCases([tooManySteps], CorrelationId);

        Assert.Equal("VALIDATION_ERROR", casesResult?.Code);
        Assert.Equal("VALIDATION_ERROR", stepsResult?.Code);
    }

    [Fact]
    public void ValidateWorkItemPayload_RejectsHostileHtmlAndStructuredDynamicValue()
    {
        var hostileHtml = new CreateWorkItemPayload
        {
            Hu = new WorkItemFields
            {
                Title = "Titulo",
                Description = "<img src=x onerror=alert(1)>",
                AcceptanceCriteria = "<p>Criterios</p>"
            }
        };
        var structuredValue = new CreateWorkItemPayload
        {
            Hu = new WorkItemFields
            {
                Title = "Titulo",
                Description = "<p>Descripcion</p>",
                AcceptanceCriteria = "<p>Criterios</p>",
                AdditionalFields =
                {
                    ["Custom.Object"] = System.Text.Json.JsonSerializer.SerializeToElement(new { nested = true })
                }
            }
        };

        var htmlResult = TestOptionsFactory.RequestValidation.ValidateWorkItemPayload(hostileHtml, CorrelationId);
        var structuredResult = TestOptionsFactory.RequestValidation.ValidateWorkItemPayload(structuredValue, CorrelationId);

        Assert.Equal("VALIDATION_ERROR", htmlResult?.Code);
        Assert.Equal("VALIDATION_ERROR", structuredResult?.Code);
    }

    [Fact]
    public void ConfiguredOperationalLimitsReachAllRequestValidationConsumers()
    {
        var helper = TestOptionsFactory.CreateRequestValidationHelper(
            requestValidation: new RequestValidationOptions
            {
                MaxJsonDepth = 8,
                MaxSecretHeaderLength = 3,
                MaxCorrelationIdLength = 3
            },
            workItems: new WorkItemLimitsOptions
            {
                MaxTitleLength = 3,
                MaxDescriptionLength = 4,
                MaxTestStepTextLength = 5,
                MaxTestCases = 1,
                MaxTestCaseSteps = 1,
                MaxAdditionalFields = 1
            },
            architecture: new ArchitectureIntegrationOptions { MaxMarkdownLength = 6 },
            cv: new CvAnalysisOptions { MaxTextLength = 7, MaxPromptTextLength = 6, MaxPageCount = 2 },
            ai: new AiConnectionOptions { MaxPromptLength = 8, MaxModelLength = 3 },
            azureDevOps: new AzureDevOpsOptions
            {
                Search = new AzureDevOpsSearchOptions { MaxSearchTextLength = 4 },
                Limits = new AzureDevOpsLimitsOptions
                {
                    MaxOrganizationLength = 3,
                    MaxProjectLength = 4,
                    MaxPathLength = 5,
                    MaxWorkItemIds = 2
                }
            });

        Assert.NotNull(helper.ValidateAzurePat("1234", CorrelationId));
        Assert.NotNull(helper.ValidateOrganization("1234", CorrelationId));
        Assert.NotNull(helper.ValidateProject("12345", CorrelationId));
        Assert.NotNull(helper.ValidateOptionalPath("123456", "path", CorrelationId));
        Assert.NotNull(helper.ValidateModel("1234", CorrelationId));
        Assert.NotNull(helper.ValidateCvPageCount(3, CorrelationId));
        Assert.NotNull(helper.ValidateWorkItemIds([1, 2, 3], false, CorrelationId));
        Assert.NotNull(helper.ValidateRequiredText("1234567", "markdown", helper.MaxArchitectureMarkdownLength, CorrelationId));
        Assert.NotNull(helper.ValidateRequiredText("12345678", "cv", helper.MaxCvTextLength, CorrelationId));
        Assert.NotNull(helper.ValidateRequiredText("123456789", "prompt", helper.MaxPromptLength, CorrelationId));
        Assert.Equal(4, helper.MaxSearchTextLength);

        var payload = new CreateWorkItemPayload
        {
            Hu = new WorkItemFields
            {
                Title = "1234",
                Description = "12345",
                AcceptanceCriteria = "ok",
                AdditionalFields =
                {
                    ["Custom.One"] = System.Text.Json.JsonSerializer.SerializeToElement("one"),
                    ["Custom.Two"] = System.Text.Json.JsonSerializer.SerializeToElement("two")
                }
            }
        };
        Assert.NotNull(helper.ValidateWorkItemPayload(payload, CorrelationId));

        var cases = new[]
        {
            new TestCaseFields
            {
                Title = "one",
                State = "ok",
                Steps =
                [
                    new TestCaseStep { Action = "123456", Expected = "ok" },
                    new TestCaseStep { Action = "ok", Expected = "ok" }
                ]
            },
            ValidTestCase(2)
        };
        Assert.NotNull(helper.ValidateTestCases(cases, CorrelationId));

        var context = new DefaultHttpContext();
        context.TraceIdentifier = "srv";
        context.Request.Headers[HttpResponseHeaderHelper.CorrelationHeader] = "1234";
        Assert.Equal("srv", helper.Prepare(context.Request));
    }

    [Fact]
    public async Task GenerateFunction_Returns413WithoutExecutingUseCase()
    {
        var useCase = new TrackingGenerateWorkItemUseCase();
        var function = new GenerateWorkItemFunction(
            NullLogger<GenerateWorkItemFunction>.Instance,
            useCase,
            Options.Create(new RequestLimitsOptions()),
            TestOptionsFactory.RequestValidation,
            TestOptionsFactory.ErrorLogging);
        var context = new DefaultHttpContext();
        context.Request.ContentLength = new RequestLimitsOptions().AiBodyBytes + 1L;
        context.Request.Body = new ThrowOnReadStream();

        var response = await function.Run(context.Request, CancellationToken.None);

        var objectResult = Assert.IsType<ObjectResult>(response);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, objectResult.StatusCode);
        Assert.False(useCase.WasExecuted);
    }

    [Fact]
    public void Prepare_ReplacesUnsafeCorrelationId()
    {
        var context = new DefaultHttpContext();
        context.TraceIdentifier = "server-trace";
        context.Request.Headers[HttpResponseHeaderHelper.CorrelationHeader] = "attacker\r\nvalue";

        var correlationId = TestOptionsFactory.RequestValidation.Prepare(context.Request);

        Assert.Equal("server-trace", correlationId);
        Assert.Equal("server-trace", context.Response.Headers[HttpResponseHeaderHelper.CorrelationHeader]);
    }

    private static HttpRequest CreateRequest(string body, bool includeContentLength)
    {
        var bytes = Encoding.UTF8.GetBytes(body);
        var context = new DefaultHttpContext();
        context.Request.Body = new MemoryStream(bytes);
        if (includeContentLength)
            context.Request.ContentLength = bytes.Length;
        return context.Request;
    }

    private static TestCaseFields ValidTestCase(int index) => new()
    {
        Title = $"Caso {index}",
        State = "Design",
        Steps = [new TestCaseStep { Action = "accion", Expected = "resultado" }]
    };

    private sealed class TrackingGenerateWorkItemUseCase : IGenerateWorkItemUseCase
    {
        public bool WasExecuted { get; private set; }

        public Task<GenerateWorkItemUseCaseResponse> ExecuteAsync(
            GenerateWorkItemCommand command,
            CancellationToken cancellationToken)
        {
            WasExecuted = true;
            throw new InvalidOperationException("El caso de uso no debe ejecutarse.");
        }
    }

    private sealed class ThrowOnReadStream : Stream
    {
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override void Flush() => throw new NotSupportedException();
        public override int Read(byte[] buffer, int offset, int count) =>
            throw new InvalidOperationException("El stream no debe leerse.");
        public override ValueTask<int> ReadAsync(
            Memory<byte> buffer,
            CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("El stream no debe leerse.");
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    private sealed class RecordingReadStream(byte[] bytes) : Stream
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
        protected override void Dispose(bool disposing)
        {
            if (disposing)
                _inner.Dispose();
            base.Dispose(disposing);
        }
    }
}
