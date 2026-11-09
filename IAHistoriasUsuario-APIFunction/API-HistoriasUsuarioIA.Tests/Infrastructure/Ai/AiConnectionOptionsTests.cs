using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

namespace API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.Ai;

public sealed class AiConnectionOptionsTests
{
    [Fact]
    public void MissingRequiredProviderConfigurationFailsExplicitly()
    {
        var options = new AiConnectionOptions();

        Assert.Equal(string.Empty, options.Provider);
        Assert.Equal(100, options.TimeoutSeconds);
        Assert.Equal(0, options.RetryCount);
        Assert.Equal(250, options.RetryDelayMilliseconds);
        Assert.Equal(4 * 1024 * 1024, options.MaxResponseBodyBytes);
        Assert.Equal(500_000, options.MaxPromptLength);
        Assert.Equal(128, options.MaxModelLength);
        Assert.True(new AiConnectionOptionsValidator().Validate(null, options).Failed);
    }

    [Theory]
    [InlineData("openai", "OpenAI")]
    [InlineData("OPENAI", "OpenAI")]
    [InlineData("n8n", "N8n")]
    [InlineData("N8N", "N8n")]
    public void ProviderNamesAreCaseInsensitiveAndNormalized(string configured, string expected)
    {
        Assert.Equal(expected, AiProviderNames.NormalizeKnown(configured));
    }

    [Fact]
    public void N8nDoesNotRequireAnOpenAiKey()
    {
        var options = ValidN8n("https://n8n.example/webhook");
        options.Provider = "n8n";

        Assert.True(new AiConnectionOptionsValidator().Validate(null, options).Succeeded);
    }

    [Theory]
    [InlineData("http://n8n.example/webhook")]
    [InlineData("ftp://n8n.example/webhook")]
    [InlineData("https://user:secret@n8n.example/webhook")]
    [InlineData("https://n8n.example/webhook#fragment")]
    public void ProviderUrlRejectsInsecureOrAmbiguousDestinations(string url)
    {
        var options = ValidN8n(url);

        Assert.True(new AiConnectionOptionsValidator().Validate(null, options).Failed);
    }

    [Theory]
    [InlineData("https://n8n.example/webhook")]
    public void ProviderUrlAllowsHttps(string url)
    {
        var options = ValidN8n(url);

        Assert.True(new AiConnectionOptionsValidator().Validate(null, options).Succeeded);
    }

    [Theory]
    [MemberData(nameof(InvalidOptions))]
    public void InvalidConfigurationFailsExplicitly(AiConnectionOptions options, string expected)
    {
        var result = new AiConnectionOptionsValidator().Validate(null, options);

        Assert.True(result.Failed);
        Assert.Contains(result.Failures, failure => failure.Contains(expected, StringComparison.Ordinal));
    }

    public static TheoryData<AiConnectionOptions, string> InvalidOptions => new()
    {
        { new AiConnectionOptions { Provider = "Unknown" }, "Provider" },
        { new AiConnectionOptions { Provider = "OpenAI" }, "ApiKey" },
        { new AiConnectionOptions { Provider = "N8n" }, "N8n:Url" },
        { new AiConnectionOptions { Provider = "N8n", N8n = new() { Url = "relative" } }, "N8n:Url" },
        { ValidOpenAi().WithApiKey("<YOUR_OPENAI_API_KEY>"), "ApiKey" },
        { ValidOpenAi().WithTimeout(0), "TimeoutSeconds" },
        { ValidOpenAi().WithTimeout(AiConnectionOptions.MaxTimeoutSeconds + 1), "TimeoutSeconds" },
        { ValidOpenAi().WithRetry(6), "RetryCount" },
        { ValidOpenAi().WithDelay(-1), "RetryDelayMilliseconds" },
        { ValidOpenAi().WithMaxResponse(0), "MaxResponseBodyBytes" },
        { ValidOpenAi().WithMaxResponse(AiConnectionOptions.AbsoluteMaxResponseBodyBytes + 1), "MaxResponseBodyBytes" },
        { ValidN8n("https://n8n.example/webhook").WithoutN8nModel(), "N8n:DefaultModel" }
    };

    private static AiConnectionOptions ValidOpenAi() => new()
    {
        Provider = "OpenAI",
        TimeoutSeconds = 100,
        MaxResponseBodyBytes = 4 * 1024 * 1024,
        OpenAI = new OpenAiProviderOptions
        {
            ApiKey = "test-key",
            BaseUrl = "https://api.openai.com/",
            DefaultModel = "model"
        }
    };

    private static AiConnectionOptions ValidN8n(string url) => new()
    {
        Provider = AiProviderNames.N8n,
        TimeoutSeconds = 100,
        MaxResponseBodyBytes = 4 * 1024 * 1024,
        N8n = new N8nProviderOptions
        {
            Url = url,
            DefaultModel = "model"
        }
    };
}

internal static class AiConnectionOptionsTestExtensions
{
    public static AiConnectionOptions WithTimeout(this AiConnectionOptions options, int value)
    {
        options.TimeoutSeconds = value;
        return options;
    }

    public static AiConnectionOptions WithApiKey(this AiConnectionOptions options, string value)
    {
        options.OpenAI.ApiKey = value;
        return options;
    }

    public static AiConnectionOptions WithRetry(this AiConnectionOptions options, int value)
    {
        options.RetryCount = value;
        return options;
    }

    public static AiConnectionOptions WithDelay(this AiConnectionOptions options, int value)
    {
        options.RetryDelayMilliseconds = value;
        return options;
    }

    public static AiConnectionOptions WithMaxResponse(this AiConnectionOptions options, int value)
    {
        options.MaxResponseBodyBytes = value;
        return options;
    }

    public static AiConnectionOptions WithoutN8nModel(this AiConnectionOptions options)
    {
        options.N8n.DefaultModel = string.Empty;
        return options;
    }
}
