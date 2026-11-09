using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Application.Options;

public sealed class CvAnalysisOptions
{
    public const string SectionName = "CvAnalysis";
    public const int DefaultMaxTextLength = 200_000;
    public const int DefaultMaxPromptTextLength = 18_000;
    public const int DefaultMaxPageCount = 1_000;
    public const int AbsoluteMaxTextLength = DefaultMaxTextLength;
    public const int AbsoluteMaxPromptTextLength = DefaultMaxPromptTextLength;
    public const int AbsoluteMaxPageCount = DefaultMaxPageCount;

    public int MaxTextLength { get; set; } = DefaultMaxTextLength;
    public int MaxPromptTextLength { get; set; } = DefaultMaxPromptTextLength;
    public int MaxPageCount { get; set; } = DefaultMaxPageCount;
}

public sealed class CvAnalysisOptionsValidator : IValidateOptions<CvAnalysisOptions>
{
    public ValidateOptionsResult Validate(string? name, CvAnalysisOptions options)
    {
        var failures = new List<string>();
        ValidateRange(failures, "CvAnalysis:MaxTextLength", options.MaxTextLength, CvAnalysisOptions.AbsoluteMaxTextLength);
        ValidateRange(failures, "CvAnalysis:MaxPromptTextLength", options.MaxPromptTextLength, CvAnalysisOptions.AbsoluteMaxPromptTextLength);
        ValidateRange(failures, "CvAnalysis:MaxPageCount", options.MaxPageCount, CvAnalysisOptions.AbsoluteMaxPageCount);
        if (options.MaxPromptTextLength > options.MaxTextLength)
            failures.Add("CvAnalysis:MaxPromptTextLength no puede superar CvAnalysis:MaxTextLength.");
        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateRange(ICollection<string> failures, string key, int value, int maximum)
    {
        if (value is < 1 || value > maximum)
            failures.Add($"{key} debe estar entre 1 y {maximum}.");
    }
}
