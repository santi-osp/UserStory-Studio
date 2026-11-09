using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion;

/// <summary>
/// Limites operativos para cuerpos HTTP. Los techos absolutos permanecen en codigo
/// para impedir que una App Setting desactive la proteccion de memoria.
/// </summary>
public sealed class RequestLimitsOptions
{
    public const string SectionName = "RequestLimits";

    public const int AbsoluteMaxSmallBodyBytes = 256 * 1024;
    public const int AbsoluteMaxAiBodyBytes = 4 * 1024 * 1024;
    public const int AbsoluteMaxWorkItemBodyBytes = 4 * 1024 * 1024;
    public const int AbsoluteMaxArchitectureBodyBytes = 4 * 1024 * 1024;
    public const int AbsoluteMaxCvBodyBytes = 2 * 1024 * 1024;

    public int SmallBodyBytes { get; set; } = 64 * 1024;
    public int AiBodyBytes { get; set; } = 2 * 1024 * 1024;
    public int WorkItemBodyBytes { get; set; } = 2 * 1024 * 1024;
    public int ArchitectureBodyBytes { get; set; } = 2 * 1024 * 1024;
    public int CvBodyBytes { get; set; } = 1024 * 1024;
}

public sealed class RequestLimitsOptionsValidator : IValidateOptions<RequestLimitsOptions>
{
    public ValidateOptionsResult Validate(string? name, RequestLimitsOptions options)
    {
        var failures = new List<string>();
        ValidateRange(
            failures,
            "RequestLimits:SmallBodyBytes",
            options.SmallBodyBytes,
            RequestLimitsOptions.AbsoluteMaxSmallBodyBytes);
        ValidateRange(
            failures,
            "RequestLimits:AiBodyBytes",
            options.AiBodyBytes,
            RequestLimitsOptions.AbsoluteMaxAiBodyBytes);
        ValidateRange(
            failures,
            "RequestLimits:WorkItemBodyBytes",
            options.WorkItemBodyBytes,
            RequestLimitsOptions.AbsoluteMaxWorkItemBodyBytes);
        ValidateRange(
            failures,
            "RequestLimits:ArchitectureBodyBytes",
            options.ArchitectureBodyBytes,
            RequestLimitsOptions.AbsoluteMaxArchitectureBodyBytes);
        ValidateRange(
            failures,
            "RequestLimits:CvBodyBytes",
            options.CvBodyBytes,
            RequestLimitsOptions.AbsoluteMaxCvBodyBytes);

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateRange(
        ICollection<string> failures,
        string key,
        int value,
        int absoluteMaximum)
    {
        if (value <= 0 || value > absoluteMaximum)
        {
            failures.Add($"{key} debe estar entre 1 y {absoluteMaximum} bytes.");
        }
    }
}
