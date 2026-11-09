using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using API_HistoriasUsuarioIA_funcion.Domain.Policies;
using API_HistoriasUsuarioIA_funcion.Infrastructure;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.DependencyInjection;

public sealed class InfrastructureDependencyInjectionTests
{
    [Fact]
    public void AddInfrastructureRegistersProvidersGatewaysAndValidatedOptions()
    {
        var configuration = ValidConfiguration();
        var services = new ServiceCollection();
        services.AddLogging();

        services.AddApplication().AddInfrastructure(configuration);
        using var provider = services.BuildServiceProvider();

        Assert.Single(provider.GetServices<IAiJsonGenerator>());
        Assert.Equal(2, provider.GetServices<IAiProviderClient>().Count());
        Assert.Single(provider.GetServices<IAiHttpExecutor>());
        Assert.Single(provider.GetServices<IWorkItemGenerationAiGateway>());
        Assert.Single(provider.GetServices<IWorkItemEvaluationAiGateway>());
        Assert.Single(provider.GetServices<ICvAnalysisAiGateway>());
        Assert.Single(provider.GetServices<IWorkItemFieldPolicy>());
        Assert.Single(provider.GetServices<ITestSuiteCreationCoordinator>());

        Assert.Equal("N8n", provider.GetRequiredService<IOptions<AiConnectionOptions>>().Value.Provider);
        Assert.Equal(90, provider.GetRequiredService<IOptions<AzureDevOpsOptions>>().Value.Http.TimeoutSeconds);
        Assert.DoesNotContain(services, descriptor =>
            descriptor.ServiceType.FullName?.Contains("AuthenticationOptions", StringComparison.Ordinal) == true
            || descriptor.ServiceType.FullName?.Contains("CorsOptions", StringComparison.Ordinal) == true);

        Assert.Equal(ServiceLifetime.Singleton,
            Assert.Single(services, descriptor => descriptor.ServiceType == typeof(IWorkItemFieldPolicy)).Lifetime);
        Assert.Equal(ServiceLifetime.Transient,
            Assert.Single(services, descriptor => descriptor.ServiceType == typeof(ITestSuiteCreationCoordinator)).Lifetime);
    }

    [Fact]
    public void AddInfrastructureBindsEveryHierarchicalSection()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplication().AddInfrastructure(ValidConfiguration());
        using var provider = services.BuildServiceProvider();

        var ai = provider.GetRequiredService<IOptions<AiConnectionOptions>>().Value;
        Assert.Equal(120, ai.TimeoutSeconds);
        Assert.Equal("https://n8n.example/webhook", ai.N8n.Url);

        var azdo = provider.GetRequiredService<IOptions<AzureDevOpsOptions>>().Value;
        Assert.Equal(75, azdo.Search.DefaultTop);
        Assert.Equal(150, azdo.Search.MaxTop);
        Assert.Equal("ExampleOrg", azdo.Defaults.Organization);
        Assert.Equal("ExampleProject", azdo.Defaults.Project);
        Assert.Equal("ExampleProject/Area", azdo.Defaults.AreaPath);

        var clients = provider.GetRequiredService<IHttpClientFactory>();
        Assert.Equal(TimeSpan.FromSeconds(120), clients.CreateClient(AiHttpClientNames.OpenAI).Timeout);
        Assert.Equal(TimeSpan.FromSeconds(120), clients.CreateClient(AiHttpClientNames.N8n).Timeout);
        Assert.Equal(TimeSpan.FromSeconds(90), clients.CreateClient("AzureDevOps").Timeout);
    }

    [Fact]
    public void OpenAiProviderBindsItsHierarchicalSubsection()
    {
        var configuration = ValidConfiguration();
        configuration["AiConnection:Provider"] = "OpenAI";
        configuration["AiConnection:OpenAI:ApiKey"] = "test-key";
        configuration["AiConnection:OpenAI:BaseUrl"] = "https://api.openai.com/";
        configuration["AiConnection:OpenAI:DefaultModel"] = "approved-model";
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplication().AddInfrastructure(configuration);
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<AiConnectionOptions>>().Value;
        Assert.Equal("OpenAI", options.Provider);
        Assert.Equal("test-key", options.OpenAI.ApiKey);
        Assert.Equal("approved-model", options.OpenAI.DefaultModel);
        Assert.True(new AiConnectionOptionsValidator().Validate(null, options).Succeeded);
    }

    private static ConfigurationManager ValidConfiguration() => new()
    {
        ["AiConnection:Provider"] = "N8n",
        ["AiConnection:TimeoutSeconds"] = "120",
        ["AiConnection:RetryCount"] = "0",
        ["AiConnection:RetryDelayMilliseconds"] = "250",
        ["AiConnection:MaxResponseBodyBytes"] = "4194304",
        ["AiConnection:N8n:Url"] = "https://n8n.example/webhook",
        ["AiConnection:N8n:DefaultModel"] = "model",
        ["AzureDevOps:Search:DefaultTop"] = "75",
        ["AzureDevOps:Search:MaxTop"] = "150",
        ["AzureDevOps:Http:TimeoutSeconds"] = "90",
        ["AzureDevOps:Http:RetryCount"] = "2",
        ["AzureDevOps:Http:RetryDelayMilliseconds"] = "500",
        ["AzureDevOps:Defaults:Organization"] = "ExampleOrg",
        ["AzureDevOps:Defaults:Project"] = "ExampleProject",
        ["AzureDevOps:Defaults:AreaPath"] = "ExampleProject/Area",
        ["AzureDevOps:Defaults:IterationPath"] = "ExampleProject/Sprint 1"
    };
}
