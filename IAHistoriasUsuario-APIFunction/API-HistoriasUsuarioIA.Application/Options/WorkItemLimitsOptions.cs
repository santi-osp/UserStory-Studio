using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Application.Options;

/// <summary>Limites configurables para Work Items y Test Cases.</summary>
public sealed class WorkItemLimitsOptions
{
    public const string SectionName = "WorkItemLimits";
    public const int DefaultMaxTitleLength = 255;
    public const int DefaultMaxDescriptionLength = 256 * 1_024;
    public const int DefaultMaxTestStepTextLength = 16 * 1_024;
    public const int DefaultMaxTestCases = 50;
    public const int DefaultMaxTestCaseSteps = 100;
    public const int DefaultMaxAdditionalFields = 100;

    // Los techos coinciden con los maximos efectivos previos; App Settings solo puede restringirlos.
    public const int AbsoluteMaxTitleLength = DefaultMaxTitleLength;
    public const int AbsoluteMaxDescriptionLength = DefaultMaxDescriptionLength;
    public const int AbsoluteMaxTestStepTextLength = DefaultMaxTestStepTextLength;
    public const int AbsoluteMaxTestCases = DefaultMaxTestCases;
    public const int AbsoluteMaxTestCaseSteps = DefaultMaxTestCaseSteps;
    public const int AbsoluteMaxAdditionalFields = DefaultMaxAdditionalFields;

    public int MaxTitleLength { get; set; } = DefaultMaxTitleLength;
    public int MaxDescriptionLength { get; set; } = DefaultMaxDescriptionLength;
    public int MaxTestStepTextLength { get; set; } = DefaultMaxTestStepTextLength;
    public int MaxTestCases { get; set; } = DefaultMaxTestCases;
    public int MaxTestCaseSteps { get; set; } = DefaultMaxTestCaseSteps;
    public int MaxAdditionalFields { get; set; } = DefaultMaxAdditionalFields;
}

public sealed class WorkItemLimitsOptionsValidator : IValidateOptions<WorkItemLimitsOptions>
{
    public ValidateOptionsResult Validate(string? name, WorkItemLimitsOptions options)
    {
        var failures = new List<string>();
        ValidateRange(failures, "WorkItemLimits:MaxTitleLength", options.MaxTitleLength, WorkItemLimitsOptions.AbsoluteMaxTitleLength);
        ValidateRange(failures, "WorkItemLimits:MaxDescriptionLength", options.MaxDescriptionLength, WorkItemLimitsOptions.AbsoluteMaxDescriptionLength);
        ValidateRange(failures, "WorkItemLimits:MaxTestStepTextLength", options.MaxTestStepTextLength, WorkItemLimitsOptions.AbsoluteMaxTestStepTextLength);
        ValidateRange(failures, "WorkItemLimits:MaxTestCases", options.MaxTestCases, WorkItemLimitsOptions.AbsoluteMaxTestCases);
        ValidateRange(failures, "WorkItemLimits:MaxTestCaseSteps", options.MaxTestCaseSteps, WorkItemLimitsOptions.AbsoluteMaxTestCaseSteps);
        ValidateRange(failures, "WorkItemLimits:MaxAdditionalFields", options.MaxAdditionalFields, WorkItemLimitsOptions.AbsoluteMaxAdditionalFields);
        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateRange(ICollection<string> failures, string key, int value, int maximum)
    {
        if (value is < 1 || value > maximum)
            failures.Add($"{key} debe estar entre 1 y {maximum}.");
    }
}
