using API_HistoriasUsuarioIA_funcion.Application.Common;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Domain.Policies;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;

internal static class TestOptionsFactory
{
    public static JsonPayloadSerializer JsonSerializer { get; } =
        new(Options.Create(new RequestValidationOptions()));

    public static TestCaseContentValidator TestCaseValidator { get; } =
        new(Options.Create(new WorkItemLimitsOptions()));

    public static RequestValidationHelper RequestValidation { get; } =
        CreateRequestValidationHelper();

    public static ErrorLoggingHelper ErrorLogging { get; } =
        new(Options.Create(new ObservabilityOptions()), JsonSerializer);

    public static RequestValidationHelper CreateRequestValidationHelper(
        RequestValidationOptions? requestValidation = null,
        TransportOptions? transport = null,
        WorkItemLimitsOptions? workItems = null,
        ArchitectureIntegrationOptions? architecture = null,
        CvAnalysisOptions? cv = null,
        AiConnectionOptions? ai = null,
        AzureDevOpsOptions? azureDevOps = null)
    {
        requestValidation ??= new RequestValidationOptions();
        var serializer = new JsonPayloadSerializer(Options.Create(requestValidation));
        return new RequestValidationHelper(
            Options.Create(requestValidation),
            Options.Create(transport ?? new TransportOptions()),
            Options.Create(workItems ?? new WorkItemLimitsOptions()),
            Options.Create(architecture ?? new ArchitectureIntegrationOptions()),
            Options.Create(cv ?? new CvAnalysisOptions()),
            Options.Create(ai ?? new AiConnectionOptions()),
            Options.Create(azureDevOps ?? new AzureDevOpsOptions()),
            serializer);
    }

    public static WorkItemFieldPolicy CreateWorkItemFieldPolicy(
        int maxReferenceNameLength = AzureDevOpsLimitsOptions.DefaultMaxReferenceNameLength,
        int regexTimeoutMilliseconds = AzureDevOpsLimitsOptions.DefaultReferenceNameRegexTimeoutMilliseconds) =>
        new(maxReferenceNameLength, TimeSpan.FromMilliseconds(regexTimeoutMilliseconds));
}
