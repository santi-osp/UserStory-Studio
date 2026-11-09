using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Tests.Function.Configuration;

public sealed class OperationalOptionsTests
{
    [Fact]
    public void TypedDefaultsPreserveAllPreviousOperationalValues()
    {
        var requestBodies = new RequestLimitsOptions();
        Assert.Equal(65_536, requestBodies.SmallBodyBytes);
        Assert.Equal(2_097_152, requestBodies.AiBodyBytes);
        Assert.Equal(2_097_152, requestBodies.WorkItemBodyBytes);
        Assert.Equal(2_097_152, requestBodies.ArchitectureBodyBytes);
        Assert.Equal(1_048_576, requestBodies.CvBodyBytes);

        var request = new RequestValidationOptions();
        Assert.Equal(32, request.MaxJsonDepth);
        Assert.Equal(1_024, request.MaxSecretHeaderLength);
        Assert.Equal(128, request.MaxCorrelationIdLength);
        Assert.Equal(16_384, new TransportOptions().ReadBufferBytes);

        var workItems = new WorkItemLimitsOptions();
        Assert.Equal(255, workItems.MaxTitleLength);
        Assert.Equal(262_144, workItems.MaxDescriptionLength);
        Assert.Equal(16_384, workItems.MaxTestStepTextLength);
        Assert.Equal(50, workItems.MaxTestCases);
        Assert.Equal(100, workItems.MaxTestCaseSteps);
        Assert.Equal(100, workItems.MaxAdditionalFields);

        Assert.Equal(1_000_000, new ArchitectureIntegrationOptions().MaxMarkdownLength);

        var cv = new CvAnalysisOptions();
        Assert.Equal(200_000, cv.MaxTextLength);
        Assert.Equal(18_000, cv.MaxPromptTextLength);
        Assert.Equal(1_000, cv.MaxPageCount);

        var observability = new ObservabilityOptions();
        Assert.Equal(300, observability.MaxScalarLogLength);
        Assert.Equal(20, observability.MaxContextArrayItems);
        Assert.Equal(1_000, observability.MaxGenericTextLength);
        Assert.Equal(500, observability.MaxExternalErrorDetailLength);

        var ai = new AiConnectionOptions();
        Assert.Equal(100, ai.TimeoutSeconds);
        Assert.Equal(0, ai.RetryCount);
        Assert.Equal(250, ai.RetryDelayMilliseconds);
        Assert.Equal(4_194_304, ai.MaxResponseBodyBytes);
        Assert.Equal(500_000, ai.MaxPromptLength);
        Assert.Equal(128, ai.MaxModelLength);

        var azdo = new AzureDevOpsOptions();
        Assert.Equal((100, 200, 256), (azdo.Search.DefaultTop, azdo.Search.MaxTop, azdo.Search.MaxSearchTextLength));
        Assert.Equal((100, 2, 500), (azdo.Http.TimeoutSeconds, azdo.Http.RetryCount, azdo.Http.RetryDelayMilliseconds));
        Assert.Equal((256, 256, 4_000, 200, 256, 100),
            (azdo.Limits.MaxOrganizationLength, azdo.Limits.MaxProjectLength, azdo.Limits.MaxPathLength,
                azdo.Limits.MaxWorkItemIds, azdo.Limits.MaxReferenceNameLength,
                azdo.Limits.ReferenceNameRegexTimeoutMilliseconds));
        Assert.Equal((100, 100, 200, 50),
            (azdo.Queries.ProjectsTop, azdo.Queries.ClassificationDepth, azdo.Queries.CommentsTop, azdo.Queries.TestPlansTop));
        Assert.Equal(3, azdo.Creation.StaticSuiteNameAttempts);
    }

    [Fact]
    public void ValidatorsAcceptMinimumAndAbsoluteCeilingValues()
    {
        AssertSuccess(new RequestLimitsOptionsValidator(), new RequestLimitsOptions
        {
            SmallBodyBytes = 1,
            AiBodyBytes = 1,
            WorkItemBodyBytes = 1,
            ArchitectureBodyBytes = 1,
            CvBodyBytes = 1
        });
        AssertSuccess(new RequestLimitsOptionsValidator(), new RequestLimitsOptions
        {
            SmallBodyBytes = RequestLimitsOptions.AbsoluteMaxSmallBodyBytes,
            AiBodyBytes = RequestLimitsOptions.AbsoluteMaxAiBodyBytes,
            WorkItemBodyBytes = RequestLimitsOptions.AbsoluteMaxWorkItemBodyBytes,
            ArchitectureBodyBytes = RequestLimitsOptions.AbsoluteMaxArchitectureBodyBytes,
            CvBodyBytes = RequestLimitsOptions.AbsoluteMaxCvBodyBytes
        });
        AssertSuccess(new RequestValidationOptionsValidator(), new RequestValidationOptions
        {
            MaxJsonDepth = 1,
            MaxSecretHeaderLength = 1,
            MaxCorrelationIdLength = 1
        });
        AssertSuccess(new RequestValidationOptionsValidator(), new RequestValidationOptions
        {
            MaxJsonDepth = RequestValidationOptions.AbsoluteMaxJsonDepth,
            MaxSecretHeaderLength = RequestValidationOptions.AbsoluteMaxSecretHeaderLength,
            MaxCorrelationIdLength = RequestValidationOptions.AbsoluteMaxCorrelationIdLength
        });
        AssertSuccess(new TransportOptionsValidator(), new TransportOptions
        {
            ReadBufferBytes = TransportOptions.MinReadBufferBytes
        });
        AssertSuccess(new TransportOptionsValidator(), new TransportOptions
        {
            ReadBufferBytes = TransportOptions.AbsoluteMaxReadBufferBytes
        });
        AssertSuccess(new WorkItemLimitsOptionsValidator(), new WorkItemLimitsOptions
        {
            MaxTitleLength = 1,
            MaxDescriptionLength = 1,
            MaxTestStepTextLength = 1,
            MaxTestCases = 1,
            MaxTestCaseSteps = 1,
            MaxAdditionalFields = 1
        });
        AssertSuccess(new WorkItemLimitsOptionsValidator(), new WorkItemLimitsOptions
        {
            MaxTitleLength = WorkItemLimitsOptions.AbsoluteMaxTitleLength,
            MaxDescriptionLength = WorkItemLimitsOptions.AbsoluteMaxDescriptionLength,
            MaxTestStepTextLength = WorkItemLimitsOptions.AbsoluteMaxTestStepTextLength,
            MaxTestCases = WorkItemLimitsOptions.AbsoluteMaxTestCases,
            MaxTestCaseSteps = WorkItemLimitsOptions.AbsoluteMaxTestCaseSteps,
            MaxAdditionalFields = WorkItemLimitsOptions.AbsoluteMaxAdditionalFields
        });
        AssertSuccess(new ArchitectureIntegrationOptionsValidator(), new ArchitectureIntegrationOptions
        {
            MaxMarkdownLength = 1
        });
        AssertSuccess(new ArchitectureIntegrationOptionsValidator(), new ArchitectureIntegrationOptions
        {
            MaxMarkdownLength = ArchitectureIntegrationOptions.AbsoluteMaxMarkdownLength
        });
        AssertSuccess(new CvAnalysisOptionsValidator(), new CvAnalysisOptions
        {
            MaxTextLength = 1,
            MaxPromptTextLength = 1,
            MaxPageCount = 1
        });
        AssertSuccess(new CvAnalysisOptionsValidator(), new CvAnalysisOptions
        {
            MaxTextLength = CvAnalysisOptions.AbsoluteMaxTextLength,
            MaxPromptTextLength = CvAnalysisOptions.AbsoluteMaxPromptTextLength,
            MaxPageCount = CvAnalysisOptions.AbsoluteMaxPageCount
        });
        AssertSuccess(new ObservabilityOptionsValidator(), new ObservabilityOptions
        {
            MaxScalarLogLength = 1,
            MaxContextArrayItems = 1,
            MaxGenericTextLength = 1,
            MaxExternalErrorDetailLength = 1
        });
        AssertSuccess(new ObservabilityOptionsValidator(), new ObservabilityOptions
        {
            MaxScalarLogLength = ObservabilityOptions.AbsoluteMaxScalarLogLength,
            MaxContextArrayItems = ObservabilityOptions.AbsoluteMaxContextArrayItems,
            MaxGenericTextLength = ObservabilityOptions.AbsoluteMaxGenericTextLength,
            MaxExternalErrorDetailLength = ObservabilityOptions.AbsoluteMaxExternalErrorDetailLength
        });
        AssertSuccess(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions
        {
            Search = new() { DefaultTop = 1, MaxTop = 1, MaxSearchTextLength = 1 },
            Http = new() { TimeoutSeconds = 1, RetryCount = 0, RetryDelayMilliseconds = 0 },
            Limits = new()
            {
                MaxOrganizationLength = 1,
                MaxProjectLength = 1,
                MaxPathLength = 1,
                MaxWorkItemIds = 1,
                MaxReferenceNameLength = 1,
                ReferenceNameRegexTimeoutMilliseconds = 1
            },
            Queries = new() { ProjectsTop = 1, ClassificationDepth = 1, CommentsTop = 1, TestPlansTop = 1 },
            Creation = new() { StaticSuiteNameAttempts = 1 }
        });
        AssertSuccess(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions
        {
            Search = new()
            {
                DefaultTop = AzureDevOpsSearchOptions.AbsoluteMaxTop,
                MaxTop = AzureDevOpsSearchOptions.AbsoluteMaxTop,
                MaxSearchTextLength = AzureDevOpsSearchOptions.AbsoluteMaxSearchTextLength
            },
            Http = new()
            {
                TimeoutSeconds = 1,
                RetryCount = AzureDevOpsHttpOptions.MaxRetryCount,
                RetryDelayMilliseconds = AzureDevOpsHttpOptions.MaxRetryDelayMilliseconds
            }
        });
        AssertSuccess(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions
        {
            Http = new()
            {
                TimeoutSeconds = AzureDevOpsHttpOptions.MaxTimeoutSeconds,
                RetryCount = 1,
                RetryDelayMilliseconds = 0
            }
        });

        var aiMinimum = ValidOpenAiOptions();
        aiMinimum.TimeoutSeconds = 1;
        aiMinimum.RetryCount = 0;
        aiMinimum.RetryDelayMilliseconds = 0;
        aiMinimum.MaxResponseBodyBytes = 1;
        aiMinimum.MaxPromptLength = 1;
        aiMinimum.MaxModelLength = 1;
        aiMinimum.OpenAI.DefaultModel = "m";
        AssertSuccess(new AiConnectionOptionsValidator(), aiMinimum);

        var aiMaximum = ValidOpenAiOptions();
        aiMaximum.TimeoutSeconds = 1;
        aiMaximum.RetryCount = AiConnectionOptions.MaxRetryCount;
        aiMaximum.RetryDelayMilliseconds = AiConnectionOptions.MaxRetryDelayMilliseconds;
        aiMaximum.MaxResponseBodyBytes = AiConnectionOptions.AbsoluteMaxResponseBodyBytes;
        aiMaximum.MaxPromptLength = AiConnectionOptions.AbsoluteMaxPromptLength;
        aiMaximum.MaxModelLength = AiConnectionOptions.AbsoluteMaxModelLength;
        AssertSuccess(new AiConnectionOptionsValidator(), aiMaximum);

        var aiMaximumTimeout = ValidOpenAiOptions();
        aiMaximumTimeout.TimeoutSeconds = AiConnectionOptions.MaxTimeoutSeconds;
        aiMaximumTimeout.RetryCount = 1;
        aiMaximumTimeout.RetryDelayMilliseconds = 0;
        AssertSuccess(new AiConnectionOptionsValidator(), aiMaximumTimeout);
    }

    [Fact]
    public void ValidatorsRejectZeroNegativeAboveCeilingAndInvalidRelationships()
    {
        AssertFailure(new RequestLimitsOptionsValidator(), new RequestLimitsOptions { SmallBodyBytes = 0 });
        AssertFailure(new RequestLimitsOptionsValidator(), new RequestLimitsOptions { AiBodyBytes = -1 });
        AssertFailure(new RequestLimitsOptionsValidator(), new RequestLimitsOptions { CvBodyBytes = RequestLimitsOptions.AbsoluteMaxCvBodyBytes + 1 });

        AssertFailure(new RequestValidationOptionsValidator(), new RequestValidationOptions { MaxJsonDepth = 0 });
        AssertFailure(new RequestValidationOptionsValidator(), new RequestValidationOptions { MaxSecretHeaderLength = -1 });
        AssertFailure(new RequestValidationOptionsValidator(), new RequestValidationOptions { MaxCorrelationIdLength = RequestValidationOptions.AbsoluteMaxCorrelationIdLength + 1 });
        AssertFailure(new TransportOptionsValidator(), new TransportOptions { ReadBufferBytes = 0 });
        AssertFailure(new TransportOptionsValidator(), new TransportOptions { ReadBufferBytes = TransportOptions.MinReadBufferBytes - 1 });
        AssertFailure(new TransportOptionsValidator(), new TransportOptions { ReadBufferBytes = TransportOptions.AbsoluteMaxReadBufferBytes + 1 });

        AssertFailure(new WorkItemLimitsOptionsValidator(), new WorkItemLimitsOptions { MaxTitleLength = 0 });
        AssertFailure(new WorkItemLimitsOptionsValidator(), new WorkItemLimitsOptions { MaxDescriptionLength = -1 });
        AssertFailure(new WorkItemLimitsOptionsValidator(), new WorkItemLimitsOptions { MaxTestStepTextLength = WorkItemLimitsOptions.AbsoluteMaxTestStepTextLength + 1 });
        AssertFailure(new WorkItemLimitsOptionsValidator(), new WorkItemLimitsOptions { MaxTestCases = WorkItemLimitsOptions.AbsoluteMaxTestCases + 1 });
        AssertFailure(new WorkItemLimitsOptionsValidator(), new WorkItemLimitsOptions { MaxTestCaseSteps = 0 });
        AssertFailure(new WorkItemLimitsOptionsValidator(), new WorkItemLimitsOptions { MaxAdditionalFields = -1 });

        AssertFailure(new ArchitectureIntegrationOptionsValidator(), new ArchitectureIntegrationOptions { MaxMarkdownLength = 0 });
        AssertFailure(new ArchitectureIntegrationOptionsValidator(), new ArchitectureIntegrationOptions { MaxMarkdownLength = ArchitectureIntegrationOptions.AbsoluteMaxMarkdownLength + 1 });
        AssertFailure(new CvAnalysisOptionsValidator(), new CvAnalysisOptions { MaxTextLength = 0 });
        AssertFailure(new CvAnalysisOptionsValidator(), new CvAnalysisOptions { MaxPromptTextLength = -1 });
        AssertFailure(new CvAnalysisOptionsValidator(), new CvAnalysisOptions { MaxPageCount = CvAnalysisOptions.AbsoluteMaxPageCount + 1 });
        AssertFailure(new CvAnalysisOptionsValidator(), new CvAnalysisOptions { MaxTextLength = 10, MaxPromptTextLength = 11 });

        AssertFailure(new ObservabilityOptionsValidator(), new ObservabilityOptions { MaxScalarLogLength = 0 });
        AssertFailure(new ObservabilityOptionsValidator(), new ObservabilityOptions { MaxContextArrayItems = -1 });
        AssertFailure(new ObservabilityOptionsValidator(), new ObservabilityOptions { MaxGenericTextLength = ObservabilityOptions.AbsoluteMaxGenericTextLength + 1 });
        AssertFailure(new ObservabilityOptionsValidator(), new ObservabilityOptions { MaxExternalErrorDetailLength = 0 });

        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Search = new() { DefaultTop = 2, MaxTop = 1 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Limits = new() { MaxOrganizationLength = 0 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Limits = new() { MaxProjectLength = -1 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Limits = new() { MaxPathLength = AzureDevOpsLimitsOptions.AbsoluteMaxPathLength + 1 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Limits = new() { MaxWorkItemIds = 0 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Limits = new() { MaxReferenceNameLength = AzureDevOpsLimitsOptions.AbsoluteMaxReferenceNameLength + 1 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Limits = new() { ReferenceNameRegexTimeoutMilliseconds = 0 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Queries = new() { ProjectsTop = 0 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Queries = new() { ClassificationDepth = AzureDevOpsQueryOptions.AbsoluteMaxClassificationDepth + 1 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Queries = new() { CommentsTop = -1 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Queries = new() { TestPlansTop = AzureDevOpsQueryOptions.AbsoluteMaxTestPlansTop + 1 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions { Creation = new() { StaticSuiteNameAttempts = 0 } });
        AssertFailure(new AzureDevOpsOptionsValidator(), new AzureDevOpsOptions
        {
            Http = new()
            {
                TimeoutSeconds = AzureDevOpsHttpOptions.MaxTimeoutSeconds,
                RetryCount = AzureDevOpsHttpOptions.MaxRetryCount,
                RetryDelayMilliseconds = AzureDevOpsHttpOptions.MaxRetryDelayMilliseconds
            }
        });

        var ai = ValidOpenAiOptions();
        ai.MaxPromptLength = 0;
        AssertFailure(new AiConnectionOptionsValidator(), ai);
        ai = ValidOpenAiOptions();
        ai.MaxModelLength = AiConnectionOptions.AbsoluteMaxModelLength + 1;
        AssertFailure(new AiConnectionOptionsValidator(), ai);
        ai = ValidOpenAiOptions();
        ai.TimeoutSeconds = -1;
        AssertFailure(new AiConnectionOptionsValidator(), ai);
        ai = ValidOpenAiOptions();
        ai.RetryCount = AiConnectionOptions.MaxRetryCount + 1;
        AssertFailure(new AiConnectionOptionsValidator(), ai);
        ai = ValidOpenAiOptions();
        ai.RetryDelayMilliseconds = -1;
        AssertFailure(new AiConnectionOptionsValidator(), ai);
        ai = ValidOpenAiOptions();
        ai.MaxResponseBodyBytes = AiConnectionOptions.AbsoluteMaxResponseBodyBytes + 1;
        AssertFailure(new AiConnectionOptionsValidator(), ai);
        ai = ValidOpenAiOptions();
        ai.TimeoutSeconds = AiConnectionOptions.MaxTimeoutSeconds;
        ai.RetryCount = AiConnectionOptions.MaxRetryCount;
        ai.RetryDelayMilliseconds = AiConnectionOptions.MaxRetryDelayMilliseconds;
        AssertFailure(new AiConnectionOptionsValidator(), ai);
    }

    [Fact]
    public void HierarchicalAppSettingNamesBindToTypedOptions()
    {
        var values = new Dictionary<string, string?>
        {
            ["RequestValidation:MaxJsonDepth"] = "12",
            ["Transport:ReadBufferBytes"] = "2048",
            ["WorkItemLimits:MaxTestCases"] = "7",
            ["ArchitectureIntegration:MaxMarkdownLength"] = "9000",
            ["CvAnalysis:MaxTextLength"] = "19000",
            ["CvAnalysis:MaxPromptTextLength"] = "17000",
            ["CvAnalysis:MaxPageCount"] = "99",
            ["Observability:MaxExternalErrorDetailLength"] = "123",
            ["AiConnection:MaxPromptLength"] = "12345",
            ["AzureDevOps:Limits:MaxOrganizationLength"] = "42",
            ["AzureDevOps:Queries:ProjectsTop"] = "17",
            ["AzureDevOps:Creation:StaticSuiteNameAttempts"] = "2"
        };
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();

        Assert.Equal(12, configuration.GetSection(RequestValidationOptions.SectionName).Get<RequestValidationOptions>()!.MaxJsonDepth);
        Assert.Equal(2048, configuration.GetSection(TransportOptions.SectionName).Get<TransportOptions>()!.ReadBufferBytes);
        Assert.Equal(7, configuration.GetSection(WorkItemLimitsOptions.SectionName).Get<WorkItemLimitsOptions>()!.MaxTestCases);
        Assert.Equal(9000, configuration.GetSection(ArchitectureIntegrationOptions.SectionName).Get<ArchitectureIntegrationOptions>()!.MaxMarkdownLength);
        var cv = configuration.GetSection(CvAnalysisOptions.SectionName).Get<CvAnalysisOptions>()!;
        Assert.Equal((19000, 17000, 99), (cv.MaxTextLength, cv.MaxPromptTextLength, cv.MaxPageCount));
        Assert.Equal(123, configuration.GetSection(ObservabilityOptions.SectionName).Get<ObservabilityOptions>()!.MaxExternalErrorDetailLength);
        Assert.Equal(12345, configuration.GetSection(AiConnectionOptions.SectionName).Get<AiConnectionOptions>()!.MaxPromptLength);
        var azdo = configuration.GetSection(AzureDevOpsOptions.SectionName).Get<AzureDevOpsOptions>()!;
        Assert.Equal((42, 17, 2), (azdo.Limits.MaxOrganizationLength, azdo.Queries.ProjectsTop, azdo.Creation.StaticSuiteNameAttempts));
    }

    [Fact]
    public void InvalidBoundConfigurationThrowsOptionsValidationExceptionWhenResolved()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Transport:ReadBufferBytes"] = "0"
            })
            .Build();
        var services = new ServiceCollection();
        services.AddSingleton<IValidateOptions<TransportOptions>, TransportOptionsValidator>();
        services.AddOptions<TransportOptions>()
            .Bind(configuration.GetSection(TransportOptions.SectionName))
            .ValidateOnStart();

        using var provider = services.BuildServiceProvider();
        var exception = Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<TransportOptions>>().Value);
        Assert.Contains("Transport:ReadBufferBytes", exception.Message, StringComparison.Ordinal);
    }

    private static AiConnectionOptions ValidOpenAiOptions() => new()
    {
        Provider = AiProviderNames.OpenAI,
        OpenAI = new OpenAiProviderOptions
        {
            ApiKey = "test-key",
            BaseUrl = "https://api.example.test/",
            DefaultModel = "test-model"
        }
    };

    private static void AssertSuccess<T>(IValidateOptions<T> validator, T options) where T : class =>
        Assert.True(validator.Validate(null, options).Succeeded);

    private static void AssertFailure<T>(IValidateOptions<T> validator, T options) where T : class =>
        Assert.True(validator.Validate(null, options).Failed);
}
