namespace API_HistoriasUsuarioIA_funcion.Application.Common;

using API_HistoriasUsuarioIA_funcion.Application.Options;
using Microsoft.Extensions.Options;

/// <summary>Reglas puras compartidas por las salidas de IA que contienen Test Cases.</summary>
public sealed class TestCaseContentValidator
{
    private readonly WorkItemLimitsOptions _limits;

    public TestCaseContentValidator(IOptions<WorkItemLimitsOptions> limits)
    {
        _limits = limits.Value;
    }

    public bool AreValid(IReadOnlyCollection<TestCaseFields>? testCases, bool requireAny)
    {
        if (testCases is null || requireAny && testCases.Count == 0 || testCases.Count > _limits.MaxTestCases)
            return false;

        return testCases.All(testCase =>
            testCase is not null
            && !string.IsNullOrWhiteSpace(testCase.Title)
            && !string.IsNullOrWhiteSpace(testCase.State)
            && testCase.Steps is { Count: > 0 }
            && testCase.Steps.All(step => step is not null
                && !string.IsNullOrWhiteSpace(step.Action)
                && !string.IsNullOrWhiteSpace(step.Expected)));
    }
}
