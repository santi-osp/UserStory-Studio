using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;

namespace API_HistoriasUsuarioIA_funcion.Tests.Function.Configuration;

public sealed class ConfigurationOptionsTests
{
    [Fact]
    public void AzureDevOpsDefaultsAndSearchDefaultsAreCoherent()
    {
        var options = new AzureDevOpsOptions();

        Assert.Equal("7.1", AzureDevOpsProtocol.ApiVersion);
        Assert.Equal(100, options.Search.DefaultTop);
        Assert.Equal(200, options.Search.MaxTop);
        Assert.Equal(100, options.Http.TimeoutSeconds);
        Assert.Equal(2, options.Http.RetryCount);
        Assert.NotNull(options.Defaults);
        Assert.True(new AzureDevOpsOptionsValidator().Validate(null, options).Succeeded);
    }

    [Fact]
    public void AzureDevOpsRejectsInvalidSearchRanges()
    {
        var options = new AzureDevOpsOptions
        {
            Search = new AzureDevOpsSearchOptions { DefaultTop = 200, MaxTop = 100 }
        };

        var result = new AzureDevOpsOptionsValidator().Validate(null, options);
        Assert.True(result.Failed);
        Assert.Contains(result.Failures, failure => failure.Contains("MaxTop", StringComparison.Ordinal));
    }

    [Fact]
    public void AzureDevOpsRejectsUnboundedOperationalValues()
    {
        var options = new AzureDevOpsOptions
        {
            Search = new AzureDevOpsSearchOptions
            {
                DefaultTop = 100,
                MaxTop = AzureDevOpsSearchOptions.AbsoluteMaxTop + 1
            },
            Http = new AzureDevOpsHttpOptions
            {
                TimeoutSeconds = AzureDevOpsHttpOptions.MaxTimeoutSeconds + 1,
                RetryCount = AzureDevOpsHttpOptions.MaxRetryCount + 1,
                RetryDelayMilliseconds = AzureDevOpsHttpOptions.MaxRetryDelayMilliseconds + 1
            }
        };

        var result = new AzureDevOpsOptionsValidator().Validate(null, options);

        Assert.True(result.Failed);
        Assert.Contains(result.Failures, failure => failure.Contains("MaxTop", StringComparison.Ordinal));
        Assert.Contains(result.Failures, failure => failure.Contains("TimeoutSeconds", StringComparison.Ordinal));
        Assert.Contains(result.Failures, failure => failure.Contains("RetryCount", StringComparison.Ordinal));
        Assert.Contains(result.Failures, failure => failure.Contains("RetryDelayMilliseconds", StringComparison.Ordinal));
    }

    [Fact]
    public void AzureDevOpsRejectsInvalidConfiguredDefaults()
    {
        var options = new AzureDevOpsOptions
        {
            Defaults = new AzureDevOpsDefaultsOptions
            {
                Organization = "https://dev.azure.com/example",
                Project = new string('p', AzureDevOpsLimitsOptions.DefaultMaxProjectLength + 1),
                AreaPath = "Area\nPath"
            }
        };

        var result = new AzureDevOpsOptionsValidator().Validate(null, options);

        Assert.True(result.Failed);
        Assert.Contains(result.Failures, failure => failure.Contains("Organization", StringComparison.Ordinal));
        Assert.Contains(result.Failures, failure => failure.Contains("Project", StringComparison.Ordinal));
        Assert.Contains(result.Failures, failure => failure.Contains("AreaPath", StringComparison.Ordinal));
    }

    [Fact]
    public void RequestLimitsRejectZeroAndValuesAboveAbsoluteCeilings()
    {
        var zero = new RequestLimitsOptions { AiBodyBytes = 0 };
        var excessive = new RequestLimitsOptions
        {
            CvBodyBytes = RequestLimitsOptions.AbsoluteMaxCvBodyBytes + 1
        };

        var validator = new RequestLimitsOptionsValidator();

        Assert.True(validator.Validate(null, zero).Failed);
        Assert.True(validator.Validate(null, excessive).Failed);
        Assert.True(validator.Validate(null, new RequestLimitsOptions()).Succeeded);
    }

    [Fact]
    public void N8nValidationDoesNotRequireOpenAiSecret()
    {
        var options = new AiConnectionOptions
        {
            Provider = "N8n",
            TimeoutSeconds = 100,
            MaxResponseBodyBytes = 4 * 1024 * 1024,
            N8n = new N8nProviderOptions
            {
                Url = "https://n8n.example/webhook",
                DefaultModel = "model"
            }
        };

        Assert.True(new AiConnectionOptionsValidator().Validate(null, options).Succeeded);
        Assert.Equal(string.Empty, options.OpenAI.ApiKey);
    }
}
