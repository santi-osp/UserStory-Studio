using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;

namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para crear work items sin exponer detalles REST de Azure DevOps.
/// </summary>
public interface IAzureDevOpsWorkItemCreationGateway
{
    IAzureDevOpsWorkItemCreationSession CreateSession(
        CreateAzureDevOpsItemsCommand command);

    IAzureDevOpsWorkItemCreationSession CreateSession(CreateTestCasesCommand command);
}

/// <summary>
/// Operaciones de creacion disponibles para una organizacion, proyecto y credencial concretos.
/// </summary>
public interface IAzureDevOpsWorkItemCreationSession
{
    Task<WorkItemConfigResponse> GetWorkItemConfigAsync(string requestedWorkItemType);

    Task<int> CreateWorkItemAsync(
        CreateWorkItemPayload payload,
        WorkItemConfigResponse workItemConfig);

    Task<CreatedTestCase> CreateTestCaseAsync(
        string iterationPath,
        string areaPath,
        TestCaseFields testCase);

    Task UpdateTestCaseStateAsync(int testCaseId, string state);

    Task<TestPlanContext> GetTestPlanContextAsync(int planId);

    Task<IReadOnlyList<TestSuiteSummary>> GetDirectChildSuitesAsync(int planId, int rootSuiteId);

    Task<CreatedTestSuite> CreateRequirementSuiteAsync(
        int planId,
        int parentSuiteId,
        int requirementId);

    Task<CreatedTestSuite> CreateStaticSuiteAsync(
        int planId,
        int parentSuiteId,
        string name);

    Task LinkTestedByAsync(int workItemId, int testCaseId);

    Task AddTestCaseToSuiteAsync(int planId, int suiteId, int testCaseId);

    string WorkItemUrl(int workItemId);
}
