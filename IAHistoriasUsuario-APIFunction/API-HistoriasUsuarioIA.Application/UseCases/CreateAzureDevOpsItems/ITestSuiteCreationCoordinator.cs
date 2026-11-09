using API_HistoriasUsuarioIA_funcion.Application.Abstractions;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

public interface ITestSuiteCreationCoordinator
{
    Task<SuiteCreationResolution> CreateAvailableStaticSuiteAsync(
        IAzureDevOpsWorkItemCreationSession session,
        TestPlanContext plan,
        string title);
}

public sealed record SuiteCreationResolution(
    CreatedTestSuite Suite,
    string BaseName,
    bool Renamed);
