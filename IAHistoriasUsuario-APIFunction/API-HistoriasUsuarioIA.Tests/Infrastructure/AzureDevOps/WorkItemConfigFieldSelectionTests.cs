using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemConfig;
using API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.AzureDevOps;

public sealed class WorkItemConfigFieldSelectionTests
{
    [Fact]
    public void FilterContentFieldsForUi_UsesCanonicalOrderAndRealReferencesOnly()
    {
        var acceptanceCriteria = Field(
            "acceptanceCriteria",
            "MICROSOFT.VSTS.COMMON.ACCEPTANCECRITERIA",
            type: "html",
            required: true);
        acceptanceCriteria.HasDefaultValue = true;
        acceptanceCriteria.IsReadOnly = true;
        var fields = new[]
        {
            Field("priority", "Microsoft.VSTS.Common.Priority"),
            acceptanceCriteria,
            Field("description", "system.description", type: "html"),
            Field("title", "System.Title", required: true)
        };

        var result = AzDoService.FilterContentFieldsForUi(fields);

        Assert.Collection(
            result,
            field => Assert.Equal("System.Title", field.ReferenceName),
            field => Assert.Equal("system.description", field.ReferenceName),
            field => Assert.Same(acceptanceCriteria, field));
        Assert.True(result[2].Required);
        Assert.True(result[2].HasDefaultValue);
        Assert.True(result[2].IsReadOnly);
    }

    [Fact]
    public void FilterContentFieldsForUi_DoesNotInventAcceptanceCriteria()
    {
        var result = AzDoService.FilterContentFieldsForUi(
        [
            Field("title", "System.Title"),
            Field("description", "System.Description")
        ]);

        Assert.Equal(
            ["System.Title", "System.Description"],
            result.Select(field => field.ReferenceName));
    }

    [Fact]
    public void MergeContentAndDynamicUiFields_DeduplicatesReferenceNamesCaseInsensitively()
    {
        var title = Field("title", "System.Title");
        var duplicateTitle = Field("duplicate", "system.title");
        var priority = Field("priority", "Microsoft.VSTS.Common.Priority");

        var result = AzDoService.MergeContentAndDynamicUiFields(
            [title],
            [duplicateTitle, priority]);

        Assert.Equal([title, priority], result);
    }

    [Fact]
    public async Task Gateway_HydratesOnlyDynamicFieldsAndReturnsContentFirst()
    {
        var service = new RecordingAzDoService(new WorkItemConfigResponse
        {
            Project = "project",
            WorkItemType = "Custom Requirement",
            Fields =
            [
                Field("priority", "Microsoft.VSTS.Common.Priority"),
                Field("description", "System.Description", type: "html"),
                Field("title", "System.Title", required: true),
                Field("acceptanceCriteria", "Microsoft.VSTS.Common.AcceptanceCriteria", type: "html")
            ]
        });
        var gateway = CreateGateway(service);

        var result = await gateway.GetWorkItemConfigAsync(Query("Custom Requirement"), CancellationToken.None);

        Assert.Equal(
            [
                "System.Title",
                "System.Description",
                "Microsoft.VSTS.Common.AcceptanceCriteria",
                "Microsoft.VSTS.Common.Priority"
            ],
            result.Fields.Select(field => field.ReferenceName));
        Assert.Single(service.LastHydrationInput);
        Assert.Equal("Microsoft.VSTS.Common.Priority", service.LastHydrationInput[0].ReferenceName);
    }

    [Fact]
    public async Task Gateway_PreservesTestCaseStateOnlyBranch()
    {
        var service = new RecordingAzDoService(new WorkItemConfigResponse
        {
            Project = "project",
            WorkItemType = AzureDevOpsProtocol.TestCaseWorkItemType,
            Fields =
            [
                Field("title", "System.Title"),
                Field("state", AzureDevOpsProtocol.StateReferenceName)
            ]
        });
        var gateway = CreateGateway(service);

        var result = await gateway.GetWorkItemConfigAsync(Query("Test Case"), CancellationToken.None);

        var state = Assert.Single(result.Fields);
        Assert.Equal(AzureDevOpsProtocol.StateReferenceName, state.ReferenceName);
        Assert.Single(service.LastHydrationInput);
        Assert.Equal(AzureDevOpsProtocol.StateReferenceName, service.LastHydrationInput[0].ReferenceName);
    }

    private static AzureDevOpsWorkItemConfigGateway CreateGateway(IAzDoService service) =>
        new(new StubAzDoServiceFactory(service), NullLogger<AzureDevOpsWorkItemConfigGateway>.Instance);

    private static GetAzdoWorkItemConfigQuery Query(string workItemType) =>
        new("organization", "project", workItemType, "pat", "correlation", "tests");

    private static WorkItemFieldConfig Field(
        string name,
        string referenceName,
        string type = "string",
        bool required = false) =>
        new()
        {
            Name = name,
            ReferenceName = referenceName,
            Label = name,
            Type = type,
            Required = required,
            Control = type.Equals("html", StringComparison.OrdinalIgnoreCase) ? "textarea" : "input",
            Options = []
        };

    private sealed class StubAzDoServiceFactory(IAzDoService service) : IAzDoServiceFactory
    {
        public IAzDoService Create(string organization, string project, string azurePat, ILogger? logger = null) => service;
    }

    private sealed class RecordingAzDoService(WorkItemConfigResponse response) : IAzDoService
    {
        public IReadOnlyList<WorkItemFieldConfig> LastHydrationInput { get; private set; } = [];

        public Task<WorkItemConfigResponse> GetWorkItemConfigAsync(string project, string requestedWorkItemType = "") =>
            Task.FromResult(response);

        public Task<IReadOnlyList<WorkItemFieldConfig>> PopulateUiFieldOptionsAsync(
            string project,
            string workItemType,
            IReadOnlyList<WorkItemFieldConfig> fields,
            CancellationToken cancellationToken = default)
        {
            LastHydrationInput = fields.ToArray();
            return Task.FromResult(LastHydrationInput);
        }

        public Task<IReadOnlyList<string>> GetProjectsAsync() => throw new NotSupportedException();
        public Task<IReadOnlyList<string>> GetClassificationPathsAsync(string project, string structureGroup) => throw new NotSupportedException();
        public string WorkItemUrl(int id) => throw new NotSupportedException();
        public Task<string> ResolveWorkItemTypeByCategoryAsync(string project, string categoryReferenceName, string fallbackWorkItemType) => throw new NotSupportedException();
        public Task<int> CreateWorkItemAsync(string workItemType, IReadOnlyDictionary<string, object?> fields) => throw new NotSupportedException();
        public Task LinkParentAsync(int childId, int parentId) => throw new NotSupportedException();
        public Task<int> CreateWorkItemAsync(CreateWorkItemPayload payload, WorkItemConfigResponse workItemConfig) => throw new NotSupportedException();
        public Task<AzdoWorkItemDetails> GetWorkItemDetailsAsync(int workItemId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<WorkItemLookupItem>> SearchWorkItemsAsync(string project, string? areaPath, string? iterationPath, string? searchText, int top, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<CreatedTestCase> CreateTestCaseAsync(string iterationPath, string areaPath, TestCaseFields testCase) => throw new NotSupportedException();
        public Task UpdateTestCaseStateAsync(int testCaseId, string state) => throw new NotSupportedException();
        public Task<WorkItemDiscussionCommentsResponse> GetWorkItemDiscussionCommentsAsync(int workItemId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<WorkItemsDiscussionCommentsResponse> GetWorkItemsDiscussionCommentsAsync(IEnumerable<int> workItemIds, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<TestPlanSummary>> GetTestPlansAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<TestPlanContext> GetTestPlanContextAsync(int planId) => throw new NotSupportedException();
        public Task<IReadOnlyList<TestSuiteSummary>> GetDirectChildSuitesAsync(int planId, int rootSuiteId) => throw new NotSupportedException();
        public Task<CreatedTestSuite> CreateRequirementSuiteAsync(int planId, int parentSuiteId, int requirementId) => throw new NotSupportedException();
        public Task<CreatedTestSuite> CreateStaticSuiteAsync(int planId, int parentSuiteId, string name) => throw new NotSupportedException();
        public Task AddTestCaseToSuiteAsync(int planId, int suiteId, int testCaseId) => throw new NotSupportedException();
        public Task LinkTestedByAsync(int workItemId, int testCaseId) => throw new NotSupportedException();
    }
}
