using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Application.Options;

/// <summary>Limites transversales aplicados al transporte HTTP y al JSON.</summary>
public sealed class RequestValidationOptions
{
    public const string SectionName = "RequestValidation";
    public const int DefaultMaxJsonDepth = 32;
    public const int DefaultMaxSecretHeaderLength = 1_024;
    public const int DefaultMaxCorrelationIdLength = 128;
    public const int AbsoluteMaxJsonDepth = 64;
    public const int AbsoluteMaxSecretHeaderLength = 1_024;
    public const int AbsoluteMaxCorrelationIdLength = 128;

    public int MaxJsonDepth { get; set; } = DefaultMaxJsonDepth;
    public int MaxSecretHeaderLength { get; set; } = DefaultMaxSecretHeaderLength;
    public int MaxCorrelationIdLength { get; set; } = DefaultMaxCorrelationIdLength;
}

/// <summary>Configuracion compartida por lectores de streams acotados.</summary>
public sealed class TransportOptions
{
    public const string SectionName = "Transport";
    public const int DefaultReadBufferBytes = 16 * 1_024;
    public const int MinReadBufferBytes = 1_024;
    public const int AbsoluteMaxReadBufferBytes = 64 * 1_024;

    public int ReadBufferBytes { get; set; } = DefaultReadBufferBytes;
}

public sealed class RequestValidationOptionsValidator : IValidateOptions<RequestValidationOptions>
{
    public ValidateOptionsResult Validate(string? name, RequestValidationOptions options)
    {
        var failures = new List<string>();
        ValidateRange(failures, "RequestValidation:MaxJsonDepth", options.MaxJsonDepth, 1, RequestValidationOptions.AbsoluteMaxJsonDepth);
        ValidateRange(failures, "RequestValidation:MaxSecretHeaderLength", options.MaxSecretHeaderLength, 1, RequestValidationOptions.AbsoluteMaxSecretHeaderLength);
        ValidateRange(failures, "RequestValidation:MaxCorrelationIdLength", options.MaxCorrelationIdLength, 1, RequestValidationOptions.AbsoluteMaxCorrelationIdLength);
        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateRange(ICollection<string> failures, string key, int value, int minimum, int maximum)
    {
        if (value < minimum || value > maximum)
            failures.Add($"{key} debe estar entre {minimum} y {maximum}.");
    }
}

public sealed class TransportOptionsValidator : IValidateOptions<TransportOptions>
{
    public ValidateOptionsResult Validate(string? name, TransportOptions options) =>
        options.ReadBufferBytes is >= TransportOptions.MinReadBufferBytes and <= TransportOptions.AbsoluteMaxReadBufferBytes
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(
                $"Transport:ReadBufferBytes debe estar entre {TransportOptions.MinReadBufferBytes} y {TransportOptions.AbsoluteMaxReadBufferBytes}.");
}
