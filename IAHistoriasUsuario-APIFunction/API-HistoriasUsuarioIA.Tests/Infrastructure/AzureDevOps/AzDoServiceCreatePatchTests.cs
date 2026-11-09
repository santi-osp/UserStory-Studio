using System.Reflection;
using System.Net;
using System.Text;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;
using API_HistoriasUsuarioIA_funcion.Domain.Policies;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;
using Microsoft.Extensions.Logging.Abstractions;

namespace API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.AzureDevOps;

public sealed class AzDoServiceCreatePatchTests
{
    [Fact]
    public void BuildWorkItemPatch_UsesCanonicalReferenceNames()
    {
        var payload = new CreateWorkItemPayload
        {
            AreaPath = "Gestion Necesidades TI/Mesa de Ayuda",
            IterationPath = "Gestion Necesidades TI/Sprint 13",
            Hu = new WorkItemFields
            {
                Title = "Titulo",
                Description = "<p>Descripcion</p>",
                AcceptanceCriteria = "<p>Criterios</p>",
                AdditionalFields =
                {
                    ["System.AssignedTo"] = JsonSerializer.SerializeToElement("practiofc@example.com"),
                    ["Microsoft.VSTS.Scheduling.StartDate"] = JsonSerializer.SerializeToElement("2026-07-10T21:15:00-05:00"),
                    ["Microsoft.VSTS.Scheduling.FinishDate"] = JsonSerializer.SerializeToElement("2026-07-11T12:00:00-05:00"),
                    ["Microsoft.VSTS.Common.ValueArea"] = JsonSerializer.SerializeToElement("Architectural"),
                    ["Custom.TipoHU"] = JsonSerializer.SerializeToElement("Tecnica")
                }
            }
        };

        var patch = BuildWorkItemPatch(payload, CreateConfig(), out var missingRequiredFields);

        Assert.Empty(missingRequiredFields);
        Assert.Contains(patch, op => HasPathAndValue(op, "/fields/System.AssignedTo", "practiofc@example.com"));
        Assert.Contains(patch, op => HasPathAndValue(op, "/fields/Microsoft.VSTS.Scheduling.StartDate", "2026-07-10T21:15:00-05:00"));
        Assert.Contains(patch, op => HasPathAndValue(op, "/fields/Microsoft.VSTS.Scheduling.FinishDate", "2026-07-11T12:00:00-05:00"));
        Assert.Contains(patch, op => HasPathAndValue(op, "/fields/Microsoft.VSTS.Common.ValueArea", "Architectural"));
        Assert.Contains(patch, op => HasPathAndValue(op, "/fields/Custom.TipoHU", "Tecnica"));
        Assert.DoesNotContain(patch, op => HasPath(op, "/fields/assignedTo"));
        Assert.DoesNotContain(patch, op => HasPath(op, "/fields/startDate"));
        Assert.DoesNotContain(patch, op => HasPath(op, "/fields/finishDate"));
    }

    [Theory]
    [InlineData("2026-07-10")]
    [InlineData("2026-07-10T21:15")]
    public void BuildWorkItemPatch_RejectsAmbiguousDates(string value)
    {
        var payload = new CreateWorkItemPayload
        {
            AreaPath = "Gestion Necesidades TI/Mesa de Ayuda",
            IterationPath = "Gestion Necesidades TI/Sprint 13",
            Hu = new WorkItemFields
            {
                Title = "Titulo",
                Description = "<p>Descripcion</p>",
                AcceptanceCriteria = "<p>Criterios</p>",
                AdditionalFields =
                {
                    ["Microsoft.VSTS.Scheduling.StartDate"] = JsonSerializer.SerializeToElement(value)
                }
            }
        };

        var exception = Assert.Throws<TargetInvocationException>(() =>
            BuildWorkItemPatch(payload, CreateConfig(), out _));

        Assert.IsType<ArgumentException>(exception.InnerException);
    }

    [Fact]
    public void JsonPatchFieldPath_EscapesPointerControlCharacters()
    {
        var method = typeof(AzDoService).GetMethod(
            "ToJsonPatchFieldPath",
            BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        var path = Assert.IsType<string>(method.Invoke(null, ["Custom.Safe/../../relations~value"]));

        Assert.Equal("/fields/Custom.Safe~1..~1..~1relations~0value", path);
    }

    [Fact]
    public void NormalizeSearchTop_ClampsPositiveValueToConfiguredMaximum()
    {
        var service = new AzDoService(
            "my org",
            "my project",
            new HttpClient(new RecordingHttpMessageHandler("{}")),
            "7.1",
            logger: null,
            defaultWorkItemSearchTop: 100,
            maxWorkItemSearchTop: 200,
            projectsTop: 100,
            classificationDepth: 100,
            commentsTop: 200,
            testPlansTop: 50,
            maxExternalErrorDetailLength: 500,
            jsonOptions: TestOptionsFactory.JsonSerializer.Options);
        var method = typeof(AzDoService).GetMethod(
            "NormalizeSearchTop",
            BindingFlags.NonPublic | BindingFlags.Instance);

        Assert.NotNull(method);
        var normalized = Assert.IsType<int>(method.Invoke(service, [10_000]));

        Assert.Equal(200, normalized);
    }

    [Fact]
    public async Task LinkTestedByAsync_PatchesHuWithForwardRelationToTestCaseApiUrl()
    {
        var handler = new RecordingHttpMessageHandler("{\"id\":101}");
        var service = CreateService(handler);

        await service.LinkTestedByAsync(101, 202);

        Assert.Equal(HttpMethod.Patch, handler.Method);
        Assert.Equal(
            "https://dev.azure.com/my%20org/my%20project/_apis/wit/workitems/101?api-version=7.1",
            handler.RequestUri);
        Assert.Equal("application/json-patch+json", handler.MediaType);
        using var document = JsonDocument.Parse(handler.Body);
        var operation = Assert.Single(document.RootElement.EnumerateArray());
        Assert.Equal("add", operation.GetProperty("op").GetString());
        Assert.Equal("/relations/-", operation.GetProperty("path").GetString());
        var value = operation.GetProperty("value");
        Assert.Equal(AzureDevOpsProtocol.TestedByForwardRelation, value.GetProperty("rel").GetString());
        Assert.Equal(
            "https://dev.azure.com/my%20org/my%20project/_apis/wit/workitems/202",
            value.GetProperty("url").GetString());
        Assert.Equal("Vinculado autom\u00e1ticamente", value.GetProperty("attributes").GetProperty("comment").GetString());
    }

    [Fact]
    public async Task CreateRequirementSuiteAsync_SendsOnlyRequirementBodyWithoutCustomName()
    {
        var handler = new RecordingHttpMessageHandler(
            "{\"id\":900,\"name\":\"HU 101\",\"suiteType\":\"requirementTestSuite\",\"requirementId\":101}");
        var service = CreateService(handler);

        var suite = await service.CreateRequirementSuiteAsync(7, 70, 101);

        Assert.Equal(HttpMethod.Post, handler.Method);
        using var document = JsonDocument.Parse(handler.Body);
        var body = document.RootElement;
        Assert.Equal(3, body.EnumerateObject().Count());
        Assert.Equal(AzureDevOpsProtocol.RequirementTestSuiteType, body.GetProperty("suiteType").GetString());
        Assert.Equal(70, body.GetProperty("parentSuite").GetProperty("id").GetInt32());
        Assert.Equal(101, body.GetProperty("requirementId").GetInt32());
        Assert.False(body.TryGetProperty("name", out _));
        Assert.Equal("HU 101", suite.Name);
    }

    [Fact]
    public async Task CreateHuWithTestCases_LinksEachCaseBeforeCreatingRequirementSuite()
    {
        var session = new RecordingCreationSession();
        var useCase = CreateHuUseCase(session);

        var response = await useCase.ExecuteAsync(CreateHuCommand(2), CancellationToken.None);

        Assert.Equal("completed", response.OperationStatus);
        Assert.Equal(2, response.CreatedTestCases.Count);
        Assert.NotNull(response.Suite);
        Assert.Equal(string.Empty, response.Suite.RequestedBaseName);
        Assert.Equal(new[] { (101, 201), (101, 202) }, session.TestedByLinks);
        Assert.Single(session.RequirementSuiteCalls);
        Assert.Equal((7, 70, 101), session.RequirementSuiteCalls[0]);
        Assert.Equal(0, session.AddMembershipCalls);
        Assert.True(IndexOf(session.Operations, "hu:101") < IndexOf(session.Operations, "test-case:201"));
        Assert.True(IndexOf(session.Operations, "test-case:202") < IndexOf(session.Operations, "requirement-suite:101"));
        Assert.True(IndexOf(session.Operations, "link:101:202") < IndexOf(session.Operations, "requirement-suite:101"));
    }

    [Fact]
    public async Task CreateHuWithTestCases_StateFailureKeepsLinkAndCreatesRequirementSuite()
    {
        var session = new RecordingCreationSession();
        session.StateFailureIds.Add(201);
        var useCase = CreateHuUseCase(session);

        var response = await useCase.ExecuteAsync(CreateHuCommand(1), CancellationToken.None);

        Assert.Equal("partial", response.OperationStatus);
        var created = Assert.Single(response.CreatedTestCases);
        Assert.Equal("Design", created.InitialState);
        Assert.Equal("Ready", created.RequestedState);
        Assert.Equal("Design", created.FinalState);
        Assert.Contains(response.FailedTestCases, failure => failure.Phase == "state-update");
        Assert.Equal(new[] { (101, 201) }, session.TestedByLinks);
        Assert.Single(session.RequirementSuiteCalls);
        Assert.True(IndexOf(session.Operations, "link:101:201") < IndexOf(session.Operations, "state:201:Ready"));
    }

    [Fact]
    public async Task CreateHuWithTestCases_AllRelationFailuresKeepCasesAndSkipRequirementSuite()
    {
        var session = new RecordingCreationSession();
        session.RelationFailureIds.UnionWith([201, 202]);
        var useCase = CreateHuUseCase(session);

        var response = await useCase.ExecuteAsync(CreateHuCommand(2), CancellationToken.None);

        Assert.Equal("partial", response.OperationStatus);
        Assert.Equal(2, response.CreatedTestCases.Count);
        Assert.Equal(2, response.FailedTestCases.Count(failure => failure.Phase == "relation"));
        Assert.Empty(session.RequirementSuiteCalls);
        Assert.Contains(response.Warnings, warning => warning.Contains("cobertura de pruebas", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("state:201:Ready", session.Operations);
        Assert.Contains("state:202:Ready", session.Operations);
    }

    [Fact]
    public async Task CreateHuWithTestCases_OneSuccessfulRelationCreatesRequirementSuite()
    {
        var session = new RecordingCreationSession();
        session.RelationFailureIds.Add(201);
        var useCase = CreateHuUseCase(session);

        var response = await useCase.ExecuteAsync(CreateHuCommand(2), CancellationToken.None);

        Assert.Equal("partial", response.OperationStatus);
        Assert.Single(session.RequirementSuiteCalls);
        Assert.Equal(new[] { (101, 201), (101, 202) }, session.TestedByLinks);
        Assert.Contains(response.FailedTestCases, failure => failure.Index == 0 && failure.Phase == "relation");
    }

    [Fact]
    public async Task CreateHuWithTestCases_RequirementSuiteFailureKeepsLinksAndReturnsWarning()
    {
        var session = new RecordingCreationSession { FailRequirementSuite = true };
        var useCase = CreateHuUseCase(session);

        var response = await useCase.ExecuteAsync(CreateHuCommand(1), CancellationToken.None);

        Assert.Equal("partial", response.OperationStatus);
        Assert.Single(response.CreatedTestCases);
        Assert.Null(response.Suite);
        Assert.Single(session.RequirementSuiteCalls);
        Assert.Contains(response.Warnings, warning => warning.Contains("vinculados a la HU", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task CreateTestCases_UsesDatedStaticSuiteMembershipWithoutTestedBy()
    {
        var session = new RecordingCreationSession
        {
            DirectChildSuites =
            [
                new TestSuiteSummary(80, "2026-07-16 - suite alpha", 70, AzureDevOpsProtocol.StaticTestSuiteType)
            ]
        };
        var gateway = new RecordingCreationGateway(session);
        var coordinator = new TestSuiteCreationCoordinator(
            new FixedTimeProvider(new DateTimeOffset(2026, 7, 16, 12, 0, 0, TimeSpan.Zero)),
            NullLogger<TestSuiteCreationCoordinator>.Instance,
            AzureDevOpsCreationOptions.DefaultStaticSuiteNameAttempts);
        var useCase = new CreateTestCasesUseCase(
            gateway,
            coordinator,
            NullLogger<CreateTestCasesUseCase>.Instance);

        var response = await useCase.ExecuteAsync(CreateTestCasesCommand(), CancellationToken.None);

        Assert.Equal("completed", response.OperationStatus);
        Assert.Equal("2026-07-16 - Suite Alpha (2)", Assert.Single(session.StaticSuiteNames));
        Assert.Equal(1, session.AddMembershipCalls);
        Assert.Empty(session.TestedByLinks);
        Assert.Empty(session.RequirementSuiteCalls);
        Assert.True(IndexOf(session.Operations, "static-suite:2026-07-16 - Suite Alpha (2)") < IndexOf(session.Operations, "test-case:201"));
        Assert.True(IndexOf(session.Operations, "membership:900:201") < IndexOf(session.Operations, "state:201:Ready"));
    }

    private static WorkItemConfigResponse CreateConfig()
    {
        return new WorkItemConfigResponse
        {
            Project = "Gestion Necesidades TI",
            WorkItemType = "User Story",
            Fields =
            [
                Field("System.Title"),
                Field("System.Description"),
                Field("Microsoft.VSTS.Common.AcceptanceCriteria"),
                Field("System.AreaPath"),
                Field("System.IterationPath"),
                Field("System.AssignedTo"),
                Field("Microsoft.VSTS.Scheduling.StartDate", "datetime"),
                Field("Microsoft.VSTS.Scheduling.FinishDate", "datetime"),
                Field("Microsoft.VSTS.Common.ValueArea"),
                Field("Custom.TipoHU")
            ]
        };
    }

    private static WorkItemFieldConfig Field(string referenceName, string type = "string") =>
        new()
        {
            Name = referenceName,
            ReferenceName = referenceName,
            Label = referenceName,
            Type = type
        };

    private static List<Dictionary<string, object>> BuildWorkItemPatch(
        CreateWorkItemPayload payload,
        WorkItemConfigResponse config,
        out List<string> missingRequiredFields)
    {
        var method = typeof(AzDoService).GetMethod(
            "BuildWorkItemPatch",
            BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);

        object?[] args = [payload, config, null];
        var result = method.Invoke(null, args);
        missingRequiredFields = Assert.IsType<List<string>>(args[2]);
        return Assert.IsType<List<Dictionary<string, object>>>(result);
    }

    private static bool HasPathAndValue(Dictionary<string, object> operation, string path, string value)
    {
        return HasPath(operation, path)
            && operation.TryGetValue("value", out var actual)
            && string.Equals(Convert.ToString(actual), value, StringComparison.Ordinal);
    }

    private static bool HasPath(Dictionary<string, object> operation, string path)
    {
        return operation.TryGetValue("path", out var actual)
            && string.Equals(Convert.ToString(actual), path, StringComparison.Ordinal);
    }

    private static AzDoService CreateService(HttpMessageHandler handler) =>
        new(
            "my org",
            "my project",
            new HttpClient(handler),
            "7.1",
            logger: null,
            defaultWorkItemSearchTop: 100,
            maxWorkItemSearchTop: 200,
            projectsTop: 100,
            classificationDepth: 100,
            commentsTop: 200,
            testPlansTop: 50,
            maxExternalErrorDetailLength: 500,
            jsonOptions: TestOptionsFactory.JsonSerializer.Options);

    private static CreateAzureDevOpsItemsUseCase CreateHuUseCase(RecordingCreationSession session) =>
        new(
            new RecordingCreationGateway(session),
            TestOptionsFactory.CreateWorkItemFieldPolicy(),
            NullLogger<CreateAzureDevOpsItemsUseCase>.Instance);

    private static CreateAzureDevOpsItemsCommand CreateHuCommand(int testCaseCount) =>
        new(
            "my org",
            "my project",
            "pat",
            new CreateWorkItemPayload
            {
                AreaPath = "my project\\Area",
                IterationPath = "my project\\Iteration",
                WorkItemType = "User Story",
                Hu = new WorkItemFields
                {
                    Title = "HU de cobertura",
                    Description = "Descripcion",
                    AcceptanceCriteria = "Criterios"
                },
                TestSuite = new TestSuitePayload { PlanId = 7 },
                TestCases = Enumerable.Range(1, testCaseCount)
                    .Select(index => new TestCaseFields
                    {
                        Title = $"Caso {index}",
                        State = "Ready",
                        Steps = [new TestCaseStep { Action = "Accion", Expected = "Resultado" }]
                    })
                    .ToList()
            },
            "correlation",
            "tests");

    private static CreateTestCasesCommand CreateTestCasesCommand() =>
        new(
            "my org",
            "my project",
            "pat",
            new CreateTestCasesPayload
            {
                AreaPath = "my project\\Area",
                IterationPath = "my project\\Iteration",
                SuiteTitle = "Suite Alpha",
                TestSuite = new TestSuitePayload { PlanId = 7 },
                TestCases =
                [
                    new TestCaseFields
                    {
                        Title = "Caso static",
                        State = "Ready",
                        Steps = [new TestCaseStep { Action = "Accion", Expected = "Resultado" }]
                    }
                ]
            },
            "correlation",
            "tests");

    private static int IndexOf(IReadOnlyList<string> operations, string operation) =>
        operations.ToList().IndexOf(operation);

    private sealed class RecordingHttpMessageHandler(string responseBody) : HttpMessageHandler
    {
        public HttpMethod? Method { get; private set; }
        public string RequestUri { get; private set; } = string.Empty;
        public string MediaType { get; private set; } = string.Empty;
        public string Body { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Method = request.Method;
            RequestUri = request.RequestUri?.AbsoluteUri ?? string.Empty;
            MediaType = request.Content?.Headers.ContentType?.MediaType ?? string.Empty;
            Body = request.Content is null
                ? string.Empty
                : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json")
            };
        }
    }

    private sealed class RecordingCreationGateway(RecordingCreationSession session) : IAzureDevOpsWorkItemCreationGateway
    {
        public IAzureDevOpsWorkItemCreationSession CreateSession(CreateAzureDevOpsItemsCommand command) => session;
        public IAzureDevOpsWorkItemCreationSession CreateSession(CreateTestCasesCommand command) => session;
    }

    private sealed class RecordingCreationSession : IAzureDevOpsWorkItemCreationSession
    {
        private int _nextTestCaseId = 201;

        public List<string> Operations { get; } = [];
        public List<(int WorkItemId, int TestCaseId)> TestedByLinks { get; } = [];
        public List<(int PlanId, int ParentSuiteId, int RequirementId)> RequirementSuiteCalls { get; } = [];
        public List<string> StaticSuiteNames { get; } = [];
        public HashSet<int> RelationFailureIds { get; } = [];
        public HashSet<int> StateFailureIds { get; } = [];
        public int AddMembershipCalls { get; private set; }
        public bool FailRequirementSuite { get; init; }
        public IReadOnlyList<TestSuiteSummary> DirectChildSuites { get; init; } = [];

        public Task<WorkItemConfigResponse> GetWorkItemConfigAsync(string requestedWorkItemType)
        {
            Operations.Add($"config:{requestedWorkItemType}");
            var fields = requestedWorkItemType.Equals(AzureDevOpsProtocol.TestCaseWorkItemType, StringComparison.OrdinalIgnoreCase)
                ? new[]
                {
                    new WorkItemFieldConfig
                    {
                        Name = "State",
                        ReferenceName = AzureDevOpsProtocol.StateReferenceName,
                        Options = ["Design", "Ready"]
                    }
                }
                : Array.Empty<WorkItemFieldConfig>();
            return Task.FromResult(new WorkItemConfigResponse
            {
                Project = "my project",
                WorkItemType = requestedWorkItemType,
                Fields = fields
            });
        }

        public Task<int> CreateWorkItemAsync(CreateWorkItemPayload payload, WorkItemConfigResponse workItemConfig)
        {
            Operations.Add("hu:101");
            return Task.FromResult(101);
        }

        public Task<CreatedTestCase> CreateTestCaseAsync(string iterationPath, string areaPath, TestCaseFields testCase)
        {
            var id = _nextTestCaseId++;
            Operations.Add($"test-case:{id}");
            return Task.FromResult(new CreatedTestCase(id, "Design"));
        }

        public Task UpdateTestCaseStateAsync(int testCaseId, string state)
        {
            Operations.Add($"state:{testCaseId}:{state}");
            if (StateFailureIds.Contains(testCaseId))
                throw new AzureDevOpsMutationException("UpdateTestCaseState", 400, "Estado rechazado.");
            return Task.CompletedTask;
        }

        public Task<TestPlanContext> GetTestPlanContextAsync(int planId)
        {
            Operations.Add($"plan:{planId}");
            return Task.FromResult(new TestPlanContext(planId, "Plan controlado", 70));
        }

        public Task<IReadOnlyList<TestSuiteSummary>> GetDirectChildSuitesAsync(int planId, int rootSuiteId)
        {
            Operations.Add($"suite-children:{rootSuiteId}");
            return Task.FromResult(DirectChildSuites);
        }

        public Task<CreatedTestSuite> CreateRequirementSuiteAsync(int planId, int parentSuiteId, int requirementId)
        {
            Operations.Add($"requirement-suite:{requirementId}");
            RequirementSuiteCalls.Add((planId, parentSuiteId, requirementId));
            if (FailRequirementSuite)
                throw new AzureDevOpsMutationException("CreateTestSuite", 400, "Suite rechazada.");
            return Task.FromResult(new CreatedTestSuite(900, $"HU {requirementId}", AzureDevOpsProtocol.RequirementTestSuiteType));
        }

        public Task<CreatedTestSuite> CreateStaticSuiteAsync(int planId, int parentSuiteId, string name)
        {
            Operations.Add($"static-suite:{name}");
            StaticSuiteNames.Add(name);
            return Task.FromResult(new CreatedTestSuite(900, name, AzureDevOpsProtocol.StaticTestSuiteType));
        }

        public Task LinkTestedByAsync(int workItemId, int testCaseId)
        {
            Operations.Add($"link:{workItemId}:{testCaseId}");
            TestedByLinks.Add((workItemId, testCaseId));
            if (RelationFailureIds.Contains(testCaseId))
                throw new AzureDevOpsMutationException("LinkTestedBy", 400, "Relacion rechazada.");
            return Task.CompletedTask;
        }

        public Task AddTestCaseToSuiteAsync(int planId, int suiteId, int testCaseId)
        {
            Operations.Add($"membership:{suiteId}:{testCaseId}");
            AddMembershipCalls++;
            return Task.CompletedTask;
        }

        public string WorkItemUrl(int workItemId) => $"https://example.test/workitems/{workItemId}";
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
