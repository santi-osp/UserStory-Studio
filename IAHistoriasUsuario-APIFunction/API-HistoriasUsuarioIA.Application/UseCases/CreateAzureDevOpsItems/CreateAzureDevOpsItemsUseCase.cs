using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Domain.Policies;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

/// <summary>Orquesta la creacion de una HU y sus Test Cases opcionales.</summary>
public sealed class CreateAzureDevOpsItemsUseCase : ICreateAzureDevOpsItemsUseCase
{
    private readonly IAzureDevOpsWorkItemCreationGateway _creationGateway;
    private readonly IWorkItemFieldPolicy _workItemFieldPolicy;
    private readonly ILogger<CreateAzureDevOpsItemsUseCase> _logger;

    public CreateAzureDevOpsItemsUseCase(
        IAzureDevOpsWorkItemCreationGateway creationGateway,
        IWorkItemFieldPolicy workItemFieldPolicy,
        ILogger<CreateAzureDevOpsItemsUseCase> logger)
    {
        _creationGateway = creationGateway;
        _workItemFieldPolicy = workItemFieldPolicy;
        _logger = logger;
    }

    public async Task<CreateAzureDevOpsItemsUseCaseResponse> ExecuteAsync(
        CreateAzureDevOpsItemsCommand command,
        CancellationToken cancellationToken)
    {
        var hu = command.Payload.Hu ?? throw new ArgumentException("El JSON debe contener hu.");
        var fieldPolicyResult = _workItemFieldPolicy.ValidateHuFieldNames(
            new[] { "title", "description", "acceptanceCriteria" }.Concat(hu.AdditionalFields.Keys));
        if (!fieldPolicyResult.IsValid)
            throw new WorkItemFieldNotAllowedException(fieldPolicyResult.Message, fieldPolicyResult.InvalidFields);

        var testCases = command.Payload.TestCases ?? [];
        if (testCases.Count > 0 && !IsSupportedRequirementType(command.Payload.WorkItemType))
            throw new ArgumentException("workItemType no soporta creacion de Test Cases asociados.");
        if (testCases.Count > 0 && command.Payload.TestSuite?.PlanId is not > 0)
            throw new ArgumentException("testSuite.planId es requerido cuando testCases contiene elementos.");

        var session = _creationGateway.CreateSession(command);
        var workItemConfig = await session.GetWorkItemConfigAsync(command.Payload.WorkItemType);
        if (testCases.Count > 0)
        {
            var testCaseConfig = await session.GetWorkItemConfigAsync(AzureDevOpsProtocol.TestCaseWorkItemType);
            ValidateStates(testCases, testCaseConfig);
        }

        _logger.LogInformation(
            "Inicio creacion Azure DevOps. CorrelationId: {CorrelationId}. Project: {Project}. RequestedTestCases: {RequestedTestCases}. HasPlanId: {HasPlanId}",
            command.CorrelationId,
            command.Project,
            testCases.Count,
            command.Payload.TestSuite?.PlanId > 0);

        TestPlanContext? plan = null;
        if (testCases.Count > 0)
            plan = await session.GetTestPlanContextAsync(command.Payload.TestSuite!.PlanId);

        var workItemId = await session.CreateWorkItemAsync(command.Payload, workItemConfig);
        if (testCases.Count == 0)
            return CompletedHuOnly(session, workItemId, command.Payload.WorkItemType);

        var created = new List<CreatedWorkItem>();
        var failed = new List<FailedTestCaseResult>();
        var warnings = new List<string>();
        var linkedTestCaseIds = new List<int>();
        var stopProcessing = false;
        for (var index = 0; index < testCases.Count; index++)
        {
            var testCase = testCases[index];
            CreatedTestCase createdTestCase;
            try
            {
                createdTestCase = await session.CreateTestCaseAsync(
                    command.Payload.IterationPath,
                    command.Payload.AreaPath,
                    testCase);
            }
            catch (AzureDevOpsMutationException ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "creation"));
                if (ShouldStop(ex.StatusCode))
                {
                    stopProcessing = true;
                    break;
                }
                continue;
            }
            catch (TaskCanceledException ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "creation"));
                stopProcessing = true;
                break;
            }
            catch (Exception ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "creation"));
                continue;
            }

            var testCaseId = createdTestCase.Id;
            created.Add(new CreatedWorkItem(
                testCaseId,
                testCase.Title,
                session.WorkItemUrl(testCaseId),
                createdTestCase.InitialState,
                testCase.State,
                createdTestCase.InitialState,
                index));

            try
            {
                await session.LinkTestedByAsync(workItemId, testCaseId);
                linkedTestCaseIds.Add(testCaseId);
            }
            catch (AzureDevOpsMutationException ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "relation"));
                if (ShouldStop(ex.StatusCode))
                {
                    stopProcessing = true;
                    break;
                }
            }
            catch (TaskCanceledException ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "relation"));
                stopProcessing = true;
                break;
            }
            catch (Exception ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "relation"));
            }

            if (createdTestCase.InitialState.Equals(testCase.State, StringComparison.OrdinalIgnoreCase))
                continue;
            try
            {
                await session.UpdateTestCaseStateAsync(testCaseId, testCase.State);
                created[^1] = created[^1] with { FinalState = testCase.State };
            }
            catch (AzureDevOpsMutationException ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "state-update"));
                if (ShouldStop(ex.StatusCode))
                {
                    stopProcessing = true;
                    break;
                }
            }
            catch (TaskCanceledException ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "state-update"));
                stopProcessing = true;
                break;
            }
            catch (Exception ex)
            {
                failed.Add(Failure(index, testCase.Title, ex, "state-update"));
            }
        }

        CreatedTestSuite? requirementSuite = null;
        if (linkedTestCaseIds.Count == 0)
        {
            warnings.Add("No fue posible establecer cobertura de pruebas para la HU; no se creo una requirement suite vacia.");
        }
        else if (stopProcessing)
        {
            warnings.Add("No se creo la requirement suite porque el procesamiento se detuvo ante un error global. Los Test Cases vinculados permanecen asociados a la HU.");
        }
        else
        {
            try
            {
                requirementSuite = await session.CreateRequirementSuiteAsync(
                    plan!.PlanId,
                    plan.RootSuiteId,
                    workItemId);
            }
            catch (AzureDevOpsMutationException ex)
            {
                warnings.Add(SuiteFailureWarning(ex));
            }
            catch (TaskCanceledException ex)
            {
                warnings.Add(SuiteFailureWarning(ex));
            }
            catch (Exception ex)
            {
                warnings.Add(SuiteFailureWarning(ex));
            }
        }

        var partial = failed.Count > 0 || warnings.Count > 0;
        _logger.LogInformation(
            "Fin creacion HU/Test Cases. CorrelationId: {CorrelationId}. WorkItemId: {WorkItemId}. SuiteId: {SuiteId}. CreatedTestCases: {CreatedTestCases}. LinkedTestCases: {LinkedTestCases}. FailedPhases: {FailedPhases}. Partial: {Partial}",
            command.CorrelationId,
            workItemId,
            requirementSuite?.Id,
            created.Count,
            linkedTestCaseIds.Count,
            failed.Count,
            partial);
        return new CreateAzureDevOpsItemsUseCaseResponse
        {
            HuId = workItemId,
            HuUrl = session.WorkItemUrl(workItemId),
            Message = partial
                ? "La operacion quedo parcial. Verifique los artefactos creados en Azure DevOps antes de repetir."
                : $"{ResolveWorkItemLabel(command.Payload.WorkItemType)} #{workItemId} y sus Test Cases fueron creados correctamente.",
            OperationStatus = partial ? "partial" : "completed",
            Suite = requirementSuite is null
                ? null
                : new SuiteCreationResult(
                    requirementSuite.Id,
                    requirementSuite.SuiteType,
                    string.Empty,
                    requirementSuite.Name,
                    false),
            CreatedTestCases = created,
            FailedTestCases = failed,
            Plan = new SelectedTestPlanResult(plan!.PlanId, plan.PlanName),
            Warnings = partial
                ? warnings.Append("No se realizo rollback automatico.").ToArray()
                : []
        };
    }

    internal static void ValidateStates(
        IReadOnlyList<TestCaseFields> testCases,
        WorkItemConfigResponse testCaseConfig)
    {
        var stateField = testCaseConfig.Fields.FirstOrDefault(field =>
            field.ReferenceName.Equals(AzureDevOpsProtocol.StateReferenceName, StringComparison.OrdinalIgnoreCase));
        var allowed = stateField?.Options ?? [];
        if (allowed.Length == 0)
            throw new ArgumentException("No fue posible obtener los estados permitidos para Test Case.");

        foreach (var testCase in testCases)
        {
            var match = allowed.FirstOrDefault(option =>
                option.Equals(testCase.State.Trim(), StringComparison.OrdinalIgnoreCase));
            if (match is null)
                throw new ArgumentException($"El estado del Test Case no esta disponible en el proyecto.");
            testCase.State = match;
        }
    }

    private static CreateAzureDevOpsItemsUseCaseResponse CompletedHuOnly(
        IAzureDevOpsWorkItemCreationSession session,
        int workItemId,
        string? workItemType) =>
        new()
        {
            HuId = workItemId,
            HuUrl = session.WorkItemUrl(workItemId),
            Message = $"{ResolveWorkItemLabel(workItemType)} #{workItemId} creado correctamente.",
            OperationStatus = "completed"
        };

    private static FailedTestCaseResult Failure(int index, string title, Exception exception, string phase) =>
        new(index, title, SanitizeFailure(exception), phase);

    private static string SanitizeFailure(Exception exception) => exception switch
    {
        ArgumentException => "El Test Case no pudo procesarse por datos invalidos.",
        TaskCanceledException => "La operacion no pudo confirmarse por timeout; verifique Azure DevOps antes de repetir.",
        AzureDevOpsMutationException mutation => mutation.SafeDetail,
        _ => "No fue posible completar esta fase del Test Case."
    };

    private static string SuiteFailureWarning(Exception exception) => exception switch
    {
        TaskCanceledException => "Los Test Cases quedaron vinculados a la HU, pero no se pudo confirmar la requirement suite por timeout. Verifique Azure DevOps antes de repetir.",
        AzureDevOpsMutationException mutation => $"Los Test Cases quedaron vinculados a la HU, pero no fue posible crear la requirement suite. {mutation.SafeDetail}",
        _ => "Los Test Cases quedaron vinculados a la HU, pero no fue posible organizarlos en el Test Plan mediante una requirement suite."
    };

    internal static bool ShouldStop(int statusCode) =>
        statusCode is 401 or 403 or 408 or 429 || statusCode >= 500;

    private static bool IsSupportedRequirementType(string? workItemType)
    {
        var normalized = new string((workItemType ?? string.Empty)
            .Where(char.IsLetterOrDigit)
            .Select(char.ToLowerInvariant)
            .ToArray());
        return normalized is "userstory" or "productbacklogitem";
    }

    private static string ResolveWorkItemLabel(string? workItemType) =>
        string.IsNullOrWhiteSpace(workItemType) ? "Work Item" : workItemType.Trim();
}
