using API_HistoriasUsuarioIA_funcion.Application.Options;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion;

public static class OperationalOptionsRegistration
{
    public static IServiceCollection AddValidatedOperationalOptions(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services
            .AddOptions<RequestLimitsOptions>()
            .Bind(configuration.GetSection(RequestLimitsOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<RequestLimitsOptions>, RequestLimitsOptionsValidator>();

        services
            .AddOptions<RequestValidationOptions>()
            .Bind(configuration.GetSection(RequestValidationOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<RequestValidationOptions>, RequestValidationOptionsValidator>();

        services
            .AddOptions<TransportOptions>()
            .Bind(configuration.GetSection(TransportOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<TransportOptions>, TransportOptionsValidator>();

        services
            .AddOptions<WorkItemLimitsOptions>()
            .Bind(configuration.GetSection(WorkItemLimitsOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<WorkItemLimitsOptions>, WorkItemLimitsOptionsValidator>();

        services
            .AddOptions<ArchitectureIntegrationOptions>()
            .Bind(configuration.GetSection(ArchitectureIntegrationOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<ArchitectureIntegrationOptions>, ArchitectureIntegrationOptionsValidator>();

        services
            .AddOptions<CvAnalysisOptions>()
            .Bind(configuration.GetSection(CvAnalysisOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<CvAnalysisOptions>, CvAnalysisOptionsValidator>();

        services
            .AddOptions<ObservabilityOptions>()
            .Bind(configuration.GetSection(ObservabilityOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<ObservabilityOptions>, ObservabilityOptionsValidator>();

        return services;
    }
}
