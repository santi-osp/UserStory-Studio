using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

public sealed class TestSuiteCreationCoordinator : ITestSuiteCreationCoordinator
{
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<TestSuiteCreationCoordinator> _logger;
    private readonly int _maximumNameAttempts;

    public TestSuiteCreationCoordinator(
        TimeProvider timeProvider,
        ILogger<TestSuiteCreationCoordinator> logger,
        int maximumNameAttempts)
    {
        _timeProvider = timeProvider;
        _logger = logger;
        _maximumNameAttempts = maximumNameAttempts > 0
            ? maximumNameAttempts
            : throw new ArgumentOutOfRangeException(nameof(maximumNameAttempts));
    }

    public async Task<SuiteCreationResolution> CreateAvailableStaticSuiteAsync(
        IAzureDevOpsWorkItemCreationSession session,
        TestPlanContext plan,
        string title)
    {
        for (var attempt = 0; attempt < _maximumNameAttempts; attempt++)
        {
            var siblings = await session.GetDirectChildSuitesAsync(plan.PlanId, plan.RootSuiteId);
            var resolution = TestSuiteNameResolver.Resolve(
                DateOnly.FromDateTime(_timeProvider.GetUtcNow().UtcDateTime),
                title,
                siblings.Select(suite => suite.Name));
            try
            {
                var suite = await session.CreateStaticSuiteAsync(
                    plan.PlanId,
                    plan.RootSuiteId,
                    resolution.FinalName);
                return new SuiteCreationResolution(suite, resolution.BaseName, resolution.Renamed);
            }
            catch (TestSuiteNameConflictException) when (attempt < _maximumNameAttempts - 1)
            {
                _logger.LogWarning(
                    "Colision al crear static suite; se recalculara el siguiente nombre. Attempt: {Attempt}",
                    attempt + 1);
            }
        }

        throw new InvalidOperationException("No fue posible crear la suite con un nombre disponible.");
    }
}
