using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;

public sealed class CreateTestCasesUseCase : ICreateTestCasesUseCase
{
    private readonly IAzureDevOpsWorkItemCreationGateway _gateway;
    private readonly ITestSuiteCreationCoordinator _suiteCoordinator;
    private readonly ILogger<CreateTestCasesUseCase> _logger;

    public CreateTestCasesUseCase(
        IAzureDevOpsWorkItemCreationGateway gateway,
        ITestSuiteCreationCoordinator suiteCoordinator,
        ILogger<CreateTestCasesUseCase> logger)
    {
        _gateway = gateway;
        _suiteCoordinator = suiteCoordinator;
        _logger = logger;
    }

    public async Task<CreateAzureDevOpsItemsUseCaseResponse> ExecuteAsync(
        CreateTestCasesCommand command,
        CancellationToken cancellationToken)
    {
        var payload = command.Payload;
        var session = _gateway.CreateSession(command);
        var config = await session.GetWorkItemConfigAsync(AzureDevOpsProtocol.TestCaseWorkItemType);
        CreateAzureDevOpsItemsUseCase.ValidateStates(payload.TestCases, config);

        var planId = payload.TestSuite!.PlanId;
        var plan = await session.GetTestPlanContextAsync(planId);
        var suite = await _suiteCoordinator.CreateAvailableStaticSuiteAsync(
            session,
            plan,
            payload.SuiteTitle);
        var created = new List<CreatedWorkItem>();
        var failed = new List<FailedTestCaseResult>();

        for (var index = 0; index < payload.TestCases.Count; index++)
        {
            var testCase = payload.TestCases[index];
            try
            {
                var createdTestCase = await session.CreateTestCaseAsync(payload.IterationPath, payload.AreaPath, testCase);
                var id = createdTestCase.Id;
                created.Add(new CreatedWorkItem(
                    id,
                    testCase.Title,
                    session.WorkItemUrl(id),
                    createdTestCase.InitialState,
                    testCase.State,
                    createdTestCase.InitialState,
                    index));
                try
                {
                    await session.AddTestCaseToSuiteAsync(planId, suite.Suite.Id, id);
                }
                catch (AzureDevOpsMutationException ex)
                {
                    failed.Add(new FailedTestCaseResult(
                        index,
                        testCase.Title,
                        ex.SafeDetail,
                        "suite-membership"));
                    if (CreateAzureDevOpsItemsUseCase.ShouldStop(ex.StatusCode))
                        break;
                }
                catch (TaskCanceledException)
                {
                    failed.Add(new FailedTestCaseResult(
                        index,
                        testCase.Title,
                        "No se pudo confirmar la pertenencia a la suite por timeout; verifique Azure DevOps antes de repetir.",
                        "suite-membership"));
                    break;
                }
                catch (Exception)
                {
                    failed.Add(new FailedTestCaseResult(
                        index,
                        testCase.Title,
                        "El Test Case fue creado pero no pudo agregarse a la suite.",
                        "suite-membership"));
                }

                if (!createdTestCase.InitialState.Equals(testCase.State, StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        await session.UpdateTestCaseStateAsync(id, testCase.State);
                        created[^1] = created[^1] with { FinalState = testCase.State };
                    }
                    catch (AzureDevOpsMutationException ex)
                    {
                        failed.Add(new FailedTestCaseResult(index, testCase.Title, ex.SafeDetail, "state-update"));
                        if (CreateAzureDevOpsItemsUseCase.ShouldStop(ex.StatusCode))
                            break;
                    }
                    catch (TaskCanceledException)
                    {
                        failed.Add(new FailedTestCaseResult(
                            index,
                            testCase.Title,
                            "El Test Case fue creado, pero no se pudo confirmar la actualizacion de estado por timeout.",
                            "state-update"));
                        break;
                    }
                    catch (Exception)
                    {
                        failed.Add(new FailedTestCaseResult(
                            index,
                            testCase.Title,
                            "El Test Case fue creado, pero no fue posible actualizar su estado.",
                            "state-update"));
                    }
                }
            }
            catch (AzureDevOpsMutationException ex)
            {
                failed.Add(new FailedTestCaseResult(
                    index,
                    testCase.Title,
                    ex.SafeDetail,
                    "creation"));
                if (CreateAzureDevOpsItemsUseCase.ShouldStop(ex.StatusCode))
                    break;
            }
            catch (TaskCanceledException)
            {
                failed.Add(new FailedTestCaseResult(
                    index,
                    testCase.Title,
                    "La creacion no pudo confirmarse por timeout; verifique Azure DevOps antes de repetir.",
                    "creation"));
                break;
            }
            catch (Exception)
            {
                failed.Add(new FailedTestCaseResult(
                    index,
                    testCase.Title,
                    "No fue posible crear el Test Case.",
                    "creation"));
            }
        }

        var partial = failed.Count > 0;
        _logger.LogInformation(
            "Fin creacion exclusiva de Test Cases. CorrelationId: {CorrelationId}. PlanId: {PlanId}. SuiteId: {SuiteId}. CreatedTestCases: {CreatedTestCases}. FailedPhases: {FailedPhases}. Partial: {Partial}",
            command.CorrelationId,
            plan.PlanId,
            suite.Suite.Id,
            created.Count,
            failed.Count,
            partial);
        return new CreateAzureDevOpsItemsUseCaseResponse
        {
            Message = partial
                ? "La operacion quedo parcial. Verifique Azure DevOps antes de repetir."
                : "La suite estatica y sus Test Cases fueron creados correctamente.",
            OperationStatus = partial ? "partial" : "completed",
            Suite = new SuiteCreationResult(
                suite.Suite.Id,
                suite.Suite.SuiteType,
                suite.BaseName,
                suite.Suite.Name,
                suite.Renamed),
            CreatedTestCases = created,
            FailedTestCases = failed,
            Plan = new SelectedTestPlanResult(plan.PlanId, plan.PlanName),
            Warnings = partial ? ["No se realizo rollback automatico."] : []
        };
    }

}
