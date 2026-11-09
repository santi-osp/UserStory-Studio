using API_HistoriasUsuarioIA_funcion;
using API_HistoriasUsuarioIA_funcion.Application;
using API_HistoriasUsuarioIA_funcion.Infrastructure;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration)
    .AddValidatedOperationalOptions(builder.Configuration);

builder.Services.AddSingleton<RequestValidationHelper>();
builder.Services.AddSingleton<ErrorLoggingHelper>();

// Application Insights queda habilitado para Functions Worker y el filtro por defecto se remueve abajo para respetar host.json.
builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();

builder.Logging.Services.Configure<LoggerFilterOptions>(options =>
{
    var applicationInsightsRule = options.Rules.FirstOrDefault(rule =>
        rule.ProviderName == "Microsoft.Extensions.Logging.ApplicationInsights.ApplicationInsightsLoggerProvider");

    if (applicationInsightsRule is not null)
    {
        options.Rules.Remove(applicationInsightsRule);
    }
});

builder.Build().Run();
