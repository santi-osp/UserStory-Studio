using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

public static class AiProviderNames
{
    public const string OpenAI = "OpenAI";
    public const string N8n = "N8n";

    public static string NormalizeKnown(string? provider)
    {
        if (string.Equals(provider?.Trim(), OpenAI, StringComparison.OrdinalIgnoreCase))
            return OpenAI;
        if (string.Equals(provider?.Trim(), N8n, StringComparison.OrdinalIgnoreCase))
            return N8n;
        return provider?.Trim() ?? string.Empty;
    }
}

public sealed class AiConnectionOptions
{
    public const string SectionName = "AiConnection";
    public const int MaxTimeoutSeconds = 300;
    public const int MaxRetryCount = 5;
    public const int MaxRetryDelayMilliseconds = 60_000;
    public const long AbsoluteMaxTotalRequestDurationMilliseconds = 10 * 60 * 1_000L;
    public const int AbsoluteMaxResponseBodyBytes = 8 * 1024 * 1024;
    public const int DefaultMaxPromptLength = 500_000;
    public const int AbsoluteMaxPromptLength = DefaultMaxPromptLength;
    public const int DefaultMaxModelLength = 128;
    public const int AbsoluteMaxModelLength = DefaultMaxModelLength;

    /// <summary>Proveedor permitido: <c>OpenAI</c> o <c>N8n</c>.</summary>
    public string Provider { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 100;
    public int RetryCount { get; set; }
    public int RetryDelayMilliseconds { get; set; } = 250;
    public int MaxResponseBodyBytes { get; set; } = 4 * 1024 * 1024;
    public int MaxPromptLength { get; set; } = DefaultMaxPromptLength;
    public int MaxModelLength { get; set; } = DefaultMaxModelLength;
    public OpenAiProviderOptions OpenAI { get; set; } = new();
    public N8nProviderOptions N8n { get; set; } = new();
}

public sealed class OpenAiProviderOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = string.Empty;
    public string DefaultModel { get; set; } = string.Empty;
}

public sealed class N8nProviderOptions
{
    public string Url { get; set; } = string.Empty;
    public string DefaultModel { get; set; } = string.Empty;
}

public sealed class AiConnectionOptionsValidator : IValidateOptions<AiConnectionOptions>
{
    public ValidateOptionsResult Validate(string? name, AiConnectionOptions options)
    {
        var failures = new List<string>();
        var provider = AiProviderNames.NormalizeKnown(options.Provider);

        if (provider is not (AiProviderNames.OpenAI or AiProviderNames.N8n))
            failures.Add("AiConnection:Provider debe ser OpenAI o N8n.");
        if (options.TimeoutSeconds is <= 0 or > AiConnectionOptions.MaxTimeoutSeconds)
            failures.Add($"AiConnection:TimeoutSeconds debe estar entre 1 y {AiConnectionOptions.MaxTimeoutSeconds}.");
        if (options.RetryCount is < 0 or > AiConnectionOptions.MaxRetryCount)
            failures.Add($"AiConnection:RetryCount debe estar entre 0 y {AiConnectionOptions.MaxRetryCount}.");
        if (options.RetryDelayMilliseconds is < 0 or > AiConnectionOptions.MaxRetryDelayMilliseconds)
            failures.Add($"AiConnection:RetryDelayMilliseconds debe estar entre 0 y {AiConnectionOptions.MaxRetryDelayMilliseconds}.");
        if (IsRetryBudgetValid(options)
            && CalculateMaximumRequestDurationMilliseconds(options) > AiConnectionOptions.AbsoluteMaxTotalRequestDurationMilliseconds)
        {
            failures.Add(
                "La combinacion de AiConnection:TimeoutSeconds, RetryCount y RetryDelayMilliseconds "
                + $"no puede superar {AiConnectionOptions.AbsoluteMaxTotalRequestDurationMilliseconds} ms en total.");
        }
        if (options.MaxResponseBodyBytes is <= 0 or > AiConnectionOptions.AbsoluteMaxResponseBodyBytes)
            failures.Add($"AiConnection:MaxResponseBodyBytes debe estar entre 1 y {AiConnectionOptions.AbsoluteMaxResponseBodyBytes}.");
        if (options.MaxPromptLength is <= 0 or > AiConnectionOptions.AbsoluteMaxPromptLength)
            failures.Add($"AiConnection:MaxPromptLength debe estar entre 1 y {AiConnectionOptions.AbsoluteMaxPromptLength}.");
        if (options.MaxModelLength is <= 0 or > AiConnectionOptions.AbsoluteMaxModelLength)
            failures.Add($"AiConnection:MaxModelLength debe estar entre 1 y {AiConnectionOptions.AbsoluteMaxModelLength}.");

        if (provider == AiProviderNames.OpenAI)
        {
            if (IsMissingOrPlaceholder(options.OpenAI.ApiKey))
                failures.Add("AiConnection:OpenAI:ApiKey es requerida para OpenAI y no puede ser un placeholder.");
            if (!IsAllowedProviderUrl(options.OpenAI.BaseUrl))
                failures.Add("AiConnection:OpenAI:BaseUrl debe usar HTTPS.");
            if (IsMissingOrPlaceholder(options.OpenAI.DefaultModel))
                failures.Add("AiConnection:OpenAI:DefaultModel es requerido para OpenAI y no puede ser un placeholder.");
            else if (options.OpenAI.DefaultModel.Trim().Length > options.MaxModelLength)
                failures.Add("AiConnection:OpenAI:DefaultModel supera AiConnection:MaxModelLength.");
        }
        else if (provider == AiProviderNames.N8n)
        {
            if (!IsAllowedProviderUrl(options.N8n.Url))
                failures.Add("AiConnection:N8n:Url debe usar HTTPS.");
            if (IsMissingOrPlaceholder(options.N8n.DefaultModel))
                failures.Add("AiConnection:N8n:DefaultModel es requerido para N8n y no puede ser un placeholder.");
            else if (options.N8n.DefaultModel.Trim().Length > options.MaxModelLength)
                failures.Add("AiConnection:N8n:DefaultModel supera AiConnection:MaxModelLength.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }

    internal static bool IsAllowedProviderUrl(string? value)
    {
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri)
            || string.IsNullOrWhiteSpace(uri.Host)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Fragment))
        {
            return false;
        }

        return string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsMissingOrPlaceholder(string? value)
    {
        var normalized = value?.Trim() ?? string.Empty;
        return normalized.Length == 0
            || normalized.StartsWith('<')
            || normalized.EndsWith('>')
            || normalized.Contains("YOUR_", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("REPLACE_ME", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("PLACEHOLDER", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("PENDIENTE", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsRetryBudgetValid(AiConnectionOptions options) =>
        options.TimeoutSeconds is > 0 and <= AiConnectionOptions.MaxTimeoutSeconds
        && options.RetryCount is >= 0 and <= AiConnectionOptions.MaxRetryCount
        && options.RetryDelayMilliseconds is >= 0 and <= AiConnectionOptions.MaxRetryDelayMilliseconds;

    internal static long CalculateMaximumRequestDurationMilliseconds(AiConnectionOptions options) =>
        checked(
            (long)options.TimeoutSeconds * 1_000L * (options.RetryCount + 1L)
            + (long)options.RetryDelayMilliseconds * options.RetryCount);
}
