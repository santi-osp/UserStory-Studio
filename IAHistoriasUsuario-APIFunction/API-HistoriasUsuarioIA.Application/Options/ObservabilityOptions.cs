using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Application.Options;

public sealed class ObservabilityOptions
{
    public const string SectionName = "Observability";
    public const int DefaultMaxScalarLogLength = 300;
    public const int DefaultMaxContextArrayItems = 20;
    public const int DefaultMaxGenericTextLength = 1_000;
    public const int DefaultMaxExternalErrorDetailLength = 500;
    public const int AbsoluteMaxScalarLogLength = DefaultMaxScalarLogLength;
    public const int AbsoluteMaxContextArrayItems = DefaultMaxContextArrayItems;
    public const int AbsoluteMaxGenericTextLength = DefaultMaxGenericTextLength;
    public const int AbsoluteMaxExternalErrorDetailLength = DefaultMaxExternalErrorDetailLength;

    public int MaxScalarLogLength { get; set; } = DefaultMaxScalarLogLength;
    public int MaxContextArrayItems { get; set; } = DefaultMaxContextArrayItems;
    public int MaxGenericTextLength { get; set; } = DefaultMaxGenericTextLength;
    public int MaxExternalErrorDetailLength { get; set; } = DefaultMaxExternalErrorDetailLength;
}

public sealed class ObservabilityOptionsValidator : IValidateOptions<ObservabilityOptions>
{
    public ValidateOptionsResult Validate(string? name, ObservabilityOptions options)
    {
        var failures = new List<string>();
        ValidateRange(failures, "Observability:MaxScalarLogLength", options.MaxScalarLogLength, ObservabilityOptions.AbsoluteMaxScalarLogLength);
        ValidateRange(failures, "Observability:MaxContextArrayItems", options.MaxContextArrayItems, ObservabilityOptions.AbsoluteMaxContextArrayItems);
        ValidateRange(failures, "Observability:MaxGenericTextLength", options.MaxGenericTextLength, ObservabilityOptions.AbsoluteMaxGenericTextLength);
        ValidateRange(failures, "Observability:MaxExternalErrorDetailLength", options.MaxExternalErrorDetailLength, ObservabilityOptions.AbsoluteMaxExternalErrorDetailLength);
        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateRange(ICollection<string> failures, string key, int value, int maximum)
    {
        if (value is < 1 || value > maximum)
            failures.Add($"{key} debe estar entre 1 y {maximum}.");
    }
}
