using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Infrastructure;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Tests.Function.Configuration;

public sealed class ConfigurationSecurityTests
{
    [Fact]
    public void EveryOptionsSectionIsBoundValidatedAndResolvableOnce()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var configuration = ValidConfiguration();

        services
            .AddInfrastructure(configuration)
            .AddValidatedOperationalOptions(configuration);

        using var provider = services.BuildServiceProvider();
        AssertOptionAndSingleValidator<RequestLimitsOptions>(provider);
        AssertOptionAndSingleValidator<RequestValidationOptions>(provider);
        AssertOptionAndSingleValidator<TransportOptions>(provider);
        AssertOptionAndSingleValidator<WorkItemLimitsOptions>(provider);
        AssertOptionAndSingleValidator<ArchitectureIntegrationOptions>(provider);
        AssertOptionAndSingleValidator<CvAnalysisOptions>(provider);
        AssertOptionAndSingleValidator<ObservabilityOptions>(provider);
        AssertOptionAndSingleValidator<AiConnectionOptions>(provider);
        AssertOptionAndSingleValidator<AzureDevOpsOptions>(provider);
    }

    [Fact]
    public async Task ValidateOnStartFailsBeforeConsumersRunWhenCriticalConfigurationIsMissing()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.Services
            .AddInfrastructure(builder.Configuration)
            .AddValidatedOperationalOptions(builder.Configuration);

        using var host = builder.Build();
        await Assert.ThrowsAsync<OptionsValidationException>(() =>
            host.StartAsync(CancellationToken.None));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-an-integer")]
    public void EmptyOrNonConvertibleIntegerFailsClosedWhenOptionsAreResolved(string configuredValue)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Transport:ReadBufferBytes"] = configuredValue
            })
            .Build();
        var services = new ServiceCollection();
        services.AddValidatedOperationalOptions(configuration);

        using var provider = services.BuildServiceProvider();
        Assert.ThrowsAny<Exception>(() =>
            provider.GetRequiredService<IOptions<TransportOptions>>().Value);
    }

    [Fact]
    public void PartialSectionUsesOnlySafeTypedDefaultsForMissingProperties()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RequestValidation:MaxJsonDepth"] = "12"
            })
            .Build();
        var services = new ServiceCollection();
        services.AddValidatedOperationalOptions(configuration);

        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<RequestValidationOptions>>().Value;

        Assert.Equal(12, options.MaxJsonDepth);
        Assert.Equal(RequestValidationOptions.DefaultMaxSecretHeaderLength, options.MaxSecretHeaderLength);
        Assert.Equal(RequestValidationOptions.DefaultMaxCorrelationIdLength, options.MaxCorrelationIdLength);
    }

    [Fact]
    public void LaterConfigurationSourceHasPrecedence()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RequestValidation:MaxJsonDepth"] = "10"
            })
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RequestValidation:MaxJsonDepth"] = "11"
            })
            .Build();

        Assert.Equal(11, configuration
            .GetSection(RequestValidationOptions.SectionName)
            .Get<RequestValidationOptions>()!
            .MaxJsonDepth);
    }

    [Fact]
    public void DoubleUnderscoreEnvironmentNameBindsNestedPropertyCaseInsensitively()
    {
        const string prefix = "GOAL13_TEST_";
        const string variable = prefix + "requestvalidation__maxjsondepth";
        var previous = Environment.GetEnvironmentVariable(variable);

        try
        {
            Environment.SetEnvironmentVariable(variable, "13");
            var configuration = new ConfigurationBuilder()
                .AddEnvironmentVariables(prefix)
                .Build();

            Assert.Equal(13, configuration
                .GetSection(RequestValidationOptions.SectionName)
                .Get<RequestValidationOptions>()!
                .MaxJsonDepth);
        }
        finally
        {
            Environment.SetEnvironmentVariable(variable, previous);
        }
    }

    [Fact]
    public void IOptionsDoesNotChangeAfterFirstResolution()
    {
        var configuration = new ConfigurationManager();
        configuration["RequestValidation:MaxJsonDepth"] = "14";
        var services = new ServiceCollection();
        services.AddValidatedOperationalOptions(configuration);

        using var provider = services.BuildServiceProvider();
        var first = provider.GetRequiredService<IOptions<RequestValidationOptions>>().Value;
        configuration["RequestValidation:MaxJsonDepth"] = "15";
        var second = provider.GetRequiredService<IOptions<RequestValidationOptions>>().Value;

        Assert.Same(first, second);
        Assert.Equal(14, second.MaxJsonDepth);
    }

    [Fact]
    public void UnselectedProviderMayRemainEmptyWhileSelectedProviderFailsClosed()
    {
        var n8n = new AiConnectionOptions
        {
            Provider = AiProviderNames.N8n,
            N8n = new N8nProviderOptions
            {
                Url = "https://n8n.example.test/webhook",
                DefaultModel = "model"
            }
        };

        Assert.True(new AiConnectionOptionsValidator().Validate(null, n8n).Succeeded);

        n8n.N8n.Url = string.Empty;
        Assert.True(new AiConnectionOptionsValidator().Validate(null, n8n).Failed);
    }

    private static IConfiguration ValidConfiguration() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AiConnection:Provider"] = "N8n",
                ["AiConnection:N8n:Url"] = "https://n8n.example.test/webhook",
                ["AiConnection:N8n:DefaultModel"] = "model"
            })
            .Build();

    private static void AssertOptionAndSingleValidator<T>(IServiceProvider provider)
        where T : class
    {
        Assert.NotNull(provider.GetRequiredService<IOptions<T>>().Value);
        Assert.Single(provider.GetServices<IValidateOptions<T>>());
    }
}
