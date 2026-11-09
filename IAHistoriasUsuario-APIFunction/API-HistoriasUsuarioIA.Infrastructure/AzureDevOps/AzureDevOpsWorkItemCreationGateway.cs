using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

/// <summary>
/// Adaptador que reutiliza el servicio Azure DevOps existente para operaciones de creacion.
/// </summary>
public sealed class AzureDevOpsWorkItemCreationGateway : IAzureDevOpsWorkItemCreationGateway
{
    private readonly IAzDoServiceFactory _azdoServiceFactory;
    private readonly ILogger<AzureDevOpsWorkItemCreationGateway> _logger;
    private readonly ObservabilityOptions _observability;
    private readonly JsonPayloadSerializer _jsonSerializer;

    public AzureDevOpsWorkItemCreationGateway(
        IAzDoServiceFactory azdoServiceFactory,
        ILogger<AzureDevOpsWorkItemCreationGateway> logger,
        IOptions<ObservabilityOptions> observability,
        JsonPayloadSerializer jsonSerializer)
    {
        _azdoServiceFactory = azdoServiceFactory;
        _logger = logger;
        _observability = observability.Value;
        _jsonSerializer = jsonSerializer;
    }

    public IAzureDevOpsWorkItemCreationSession CreateSession(
        CreateAzureDevOpsItemsCommand command)
    {
        var service = _azdoServiceFactory.Create(
            command.Organization,
            command.Project,
            command.AzurePat,
            _logger);

        return new AzureDevOpsWorkItemCreationSession(
            service,
            command.Project,
            _observability.MaxExternalErrorDetailLength,
            _jsonSerializer.Options.MaxDepth);
    }

    public IAzureDevOpsWorkItemCreationSession CreateSession(CreateTestCasesCommand command)
    {
        var service = _azdoServiceFactory.Create(
            command.Organization,
            command.Project,
            command.AzurePat,
            _logger);
        return new AzureDevOpsWorkItemCreationSession(
            service,
            command.Project,
            _observability.MaxExternalErrorDetailLength,
            _jsonSerializer.Options.MaxDepth);
    }

    private sealed class AzureDevOpsWorkItemCreationSession : IAzureDevOpsWorkItemCreationSession
    {
        private readonly IAzDoService _azdoService;
        private readonly string _project;
        private readonly int _maxExternalErrorDetailLength;
        private readonly int _maxJsonDepth;

        public AzureDevOpsWorkItemCreationSession(
            IAzDoService azdoService,
            string project,
            int maxExternalErrorDetailLength,
            int maxJsonDepth)
        {
            _azdoService = azdoService;
            _project = project;
            _maxExternalErrorDetailLength = maxExternalErrorDetailLength;
            _maxJsonDepth = maxJsonDepth;
        }

        public async Task<WorkItemConfigResponse> GetWorkItemConfigAsync(string requestedWorkItemType)
        {
            var config = await _azdoService.GetWorkItemConfigAsync(_project, requestedWorkItemType);
            if (!config.WorkItemType.Equals(AzureDevOpsProtocol.TestCaseWorkItemType, StringComparison.OrdinalIgnoreCase))
                return config;

            var stateFields = config.Fields
                .Where(field => field.ReferenceName.Equals(AzureDevOpsProtocol.StateReferenceName, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            var hydrated = await _azdoService.PopulateUiFieldOptionsAsync(
                _project,
                config.WorkItemType,
                stateFields);
            return new WorkItemConfigResponse
            {
                Project = config.Project,
                WorkItemType = config.WorkItemType,
                Fields = hydrated
            };
        }

        public Task<int> CreateWorkItemAsync(
            CreateWorkItemPayload payload,
            WorkItemConfigResponse workItemConfig) =>
            _azdoService.CreateWorkItemAsync(payload, workItemConfig);

        public async Task<CreatedTestCase> CreateTestCaseAsync(
            string iterationPath,
            string areaPath,
            TestCaseFields testCase)
        {
            try
            {
                return await _azdoService.CreateTestCaseAsync(iterationPath, areaPath, testCase);
            }
            catch (AzDoRequestException ex)
            {
                throw Mutation(ex);
            }
        }

        public async Task UpdateTestCaseStateAsync(int testCaseId, string state)
        {
            try
            {
                await _azdoService.UpdateTestCaseStateAsync(testCaseId, state);
            }
            catch (AzDoRequestException ex)
            {
                throw Mutation(ex);
            }
        }

        public Task<TestPlanContext> GetTestPlanContextAsync(int planId) =>
            _azdoService.GetTestPlanContextAsync(planId);

        public Task<IReadOnlyList<TestSuiteSummary>> GetDirectChildSuitesAsync(int planId, int rootSuiteId) =>
            _azdoService.GetDirectChildSuitesAsync(planId, rootSuiteId);

        public async Task<CreatedTestSuite> CreateRequirementSuiteAsync(
            int planId,
            int parentSuiteId,
            int requirementId)
        {
            try
            {
                return await _azdoService.CreateRequirementSuiteAsync(planId, parentSuiteId, requirementId);
            }
            catch (AzDoRequestException ex)
            {
                throw Mutation(ex);
            }
        }

        public async Task<CreatedTestSuite> CreateStaticSuiteAsync(
            int planId,
            int parentSuiteId,
            string name)
        {
            try
            {
                return await _azdoService.CreateStaticSuiteAsync(planId, parentSuiteId, name);
            }
            catch (AzDoRequestException ex)
            {
                throw Mutation(ex);
            }
        }

        public async Task LinkTestedByAsync(int workItemId, int testCaseId)
        {
            try
            {
                await _azdoService.LinkTestedByAsync(workItemId, testCaseId);
            }
            catch (AzDoRequestException ex)
            {
                throw Mutation(ex);
            }
        }

        public async Task AddTestCaseToSuiteAsync(int planId, int suiteId, int testCaseId)
        {
            try
            {
                await _azdoService.AddTestCaseToSuiteAsync(planId, suiteId, testCaseId);
            }
            catch (AzDoRequestException ex)
            {
                throw Mutation(ex);
            }
        }

        public string WorkItemUrl(int workItemId) =>
            _azdoService.WorkItemUrl(workItemId);

        private AzureDevOpsMutationException Mutation(AzDoRequestException exception) =>
            new(
                exception.Operation,
                exception.StatusCode,
                AzureDevOpsErrorMessageSanitizer.ToSafeMutationDetail(
                    exception,
                    _maxExternalErrorDetailLength,
                    _maxJsonDepth));
    }
}
