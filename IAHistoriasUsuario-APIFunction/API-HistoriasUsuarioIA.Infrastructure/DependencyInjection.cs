using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using API_HistoriasUsuarioIA_funcion.Domain.Policies;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai.Gateways;
using API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Parsing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        services
            .AddOptions<AiConnectionOptions>()
            .Bind(configuration.GetSection(AiConnectionOptions.SectionName))
            .PostConfigure(options =>
            {
                options.Provider = AiProviderNames.NormalizeKnown(options.Provider);
                options.OpenAI ??= new OpenAiProviderOptions();
                options.N8n ??= new N8nProviderOptions();
            })
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<AiConnectionOptions>, AiConnectionOptionsValidator>();

        services
            .AddOptions<AzureDevOpsOptions>()
            .Bind(configuration.GetSection(AzureDevOpsOptions.SectionName))
            .PostConfigure(options =>
            {
                options.Search ??= new AzureDevOpsSearchOptions();
                options.Http ??= new AzureDevOpsHttpOptions();
                options.Defaults ??= new AzureDevOpsDefaultsOptions();
                options.Limits ??= new AzureDevOpsLimitsOptions();
                options.Queries ??= new AzureDevOpsQueryOptions();
                options.Creation ??= new AzureDevOpsCreationOptions();
            })
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<AzureDevOpsOptions>, AzureDevOpsOptionsValidator>();

        services.AddHttpClient(AiHttpClientNames.OpenAI, (serviceProvider, client) =>
        {
            var options = serviceProvider.GetRequiredService<IOptions<AiConnectionOptions>>().Value;
            if (Uri.TryCreate(options.OpenAI.BaseUrl, UriKind.Absolute, out var baseAddress))
                client.BaseAddress = baseAddress;
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
        {
            AllowAutoRedirect = false
        });
        services.AddHttpClient(AiHttpClientNames.N8n, (serviceProvider, client) =>
        {
            var options = serviceProvider.GetRequiredService<IOptions<AiConnectionOptions>>().Value;
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
        {
            AllowAutoRedirect = false
        });

        services.AddHttpClient("AzureDevOps", (serviceProvider, client) =>
        {
            var options = serviceProvider.GetRequiredService<IOptions<AzureDevOpsOptions>>().Value;
            client.Timeout = TimeSpan.FromSeconds(options.Http.TimeoutSeconds);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
        {
            AllowAutoRedirect = false
        });

        services.AddTransient<IAzureDevOpsClientFactory, AzureDevOpsClientFactory>();
        services.AddTransient<IAzDoServiceFactory, AzDoServiceFactory>();
        services.AddSingleton<IPromptProvider, FilePromptProvider>();
        services.AddSingleton<IAiHttpExecutor, AiHttpExecutor>();
        services.AddTransient<IAiProviderClient, OpenAiJsonProvider>();
        services.AddTransient<IAiProviderClient, N8nJsonProvider>();
        services.AddTransient<IAiJsonGenerator, AiJsonGenerator>();
        services.AddTransient<ICvAnalysisAiGateway, CvAnalysisAiGateway>();
        services.AddTransient<IAzureDevOpsWorkItemEvaluationGateway, AzureDevOpsWorkItemEvaluationGateway>();
        services.AddTransient<IWorkItemEvaluationAiGateway, WorkItemEvaluationAiGateway>();
        services.AddTransient<IWorkItemGenerationAiGateway, WorkItemGenerationAiGateway>();
        services.AddTransient<IAzureDevOpsWorkItemCreationGateway, AzureDevOpsWorkItemCreationGateway>();
        services.AddTransient<IArchitectureHuParser, ArchitectureHuParserAdapter>();
        services.AddTransient<IAzureDevOpsArchitectureWorkItemGateway, AzureDevOpsArchitectureWorkItemGateway>();
        services.AddTransient<IAzureDevOpsMetadataGateway, AzureDevOpsMetadataGateway>();
        services.AddTransient<IAzureDevOpsTestPlansGateway, AzureDevOpsTestPlansGateway>();
        services.AddTransient<IAzureDevOpsWorkItemConfigGateway, AzureDevOpsWorkItemConfigGateway>();
        services.AddTransient<IAzureDevOpsWorkItemDiscussionCommentsGateway, AzureDevOpsWorkItemDiscussionCommentsGateway>();
        services.AddTransient<IAzureDevOpsWorkItemSearchGateway, AzureDevOpsWorkItemSearchGateway>();
        services.AddSingleton<IWorkItemFieldPolicy>(serviceProvider =>
        {
            var limits = serviceProvider.GetRequiredService<IOptions<AzureDevOpsOptions>>().Value.Limits;
            return new WorkItemFieldPolicy(
                limits.MaxReferenceNameLength,
                TimeSpan.FromMilliseconds(limits.ReferenceNameRegexTimeoutMilliseconds));
        });
        services.AddTransient<ITestSuiteCreationCoordinator>(serviceProvider =>
        {
            var attempts = serviceProvider.GetRequiredService<IOptions<AzureDevOpsOptions>>()
                .Value.Creation.StaticSuiteNameAttempts;
            return new TestSuiteCreationCoordinator(
                serviceProvider.GetRequiredService<TimeProvider>(),
                serviceProvider.GetRequiredService<Microsoft.Extensions.Logging.ILogger<TestSuiteCreationCoordinator>>(),
                attempts);
        });

        return services;
    }
}
