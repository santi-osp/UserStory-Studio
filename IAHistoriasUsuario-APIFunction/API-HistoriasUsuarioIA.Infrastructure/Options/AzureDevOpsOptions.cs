using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion;

/// <summary>Opciones de Azure DevOps enlazadas desde la seccion <c>AzureDevOps</c>.</summary>
public sealed class AzureDevOpsOptions
{
    public const string SectionName = "AzureDevOps";

    public AzureDevOpsSearchOptions Search { get; set; } = new();
    public AzureDevOpsHttpOptions Http { get; set; } = new();
    public AzureDevOpsDefaultsOptions Defaults { get; set; } = new();
    public AzureDevOpsLimitsOptions Limits { get; set; } = new();
    public AzureDevOpsQueryOptions Queries { get; set; } = new();
    public AzureDevOpsCreationOptions Creation { get; set; } = new();
}

public sealed class AzureDevOpsSearchOptions
{
    public const int MinTop = 1;
    public const int DefaultTopFallback = 100;
    public const int MaxTopFallback = 200;
    public const int AbsoluteMaxTop = 200;
    public const int DefaultMaxSearchTextLength = 256;
    public const int AbsoluteMaxSearchTextLength = DefaultMaxSearchTextLength;

    public int DefaultTop { get; set; } = DefaultTopFallback;
    public int MaxTop { get; set; } = MaxTopFallback;
    public int MaxSearchTextLength { get; set; } = DefaultMaxSearchTextLength;
}

public sealed class AzureDevOpsHttpOptions
{
    public const int MaxTimeoutSeconds = 300;
    public const int MaxRetryCount = 5;
    public const int MaxRetryDelayMilliseconds = 60_000;
    public const long AbsoluteMaxTotalRequestDurationMilliseconds = 10 * 60 * 1_000L;

    public int TimeoutSeconds { get; set; } = 100;
    public int RetryCount { get; set; } = 2;
    public int RetryDelayMilliseconds { get; set; } = 500;
}

public sealed class AzureDevOpsDefaultsOptions
{
    public string Organization { get; set; } = string.Empty;
    public string Project { get; set; } = string.Empty;
    public string AreaPath { get; set; } = string.Empty;
    public string IterationPath { get; set; } = string.Empty;
}

public sealed class AzureDevOpsLimitsOptions
{
    public const int DefaultMaxOrganizationLength = 256;
    public const int DefaultMaxProjectLength = 256;
    public const int DefaultMaxPathLength = 4_000;
    public const int DefaultMaxWorkItemIds = 200;
    public const int DefaultMaxReferenceNameLength = 256;
    public const int DefaultReferenceNameRegexTimeoutMilliseconds = 100;
    public const int AbsoluteMaxOrganizationLength = DefaultMaxOrganizationLength;
    public const int AbsoluteMaxProjectLength = DefaultMaxProjectLength;
    public const int AbsoluteMaxPathLength = DefaultMaxPathLength;
    public const int AbsoluteMaxWorkItemIds = DefaultMaxWorkItemIds;
    public const int AbsoluteMaxReferenceNameLength = DefaultMaxReferenceNameLength;
    public const int AbsoluteMaxReferenceNameRegexTimeoutMilliseconds = DefaultReferenceNameRegexTimeoutMilliseconds;

    public int MaxOrganizationLength { get; set; } = DefaultMaxOrganizationLength;
    public int MaxProjectLength { get; set; } = DefaultMaxProjectLength;
    public int MaxPathLength { get; set; } = DefaultMaxPathLength;
    public int MaxWorkItemIds { get; set; } = DefaultMaxWorkItemIds;
    public int MaxReferenceNameLength { get; set; } = DefaultMaxReferenceNameLength;
    public int ReferenceNameRegexTimeoutMilliseconds { get; set; } = DefaultReferenceNameRegexTimeoutMilliseconds;
}

public sealed class AzureDevOpsQueryOptions
{
    public const int DefaultProjectsTop = 100;
    public const int DefaultClassificationDepth = 100;
    public const int DefaultCommentsTop = 200;
    public const int DefaultTestPlansTop = 50;
    public const int AbsoluteMaxProjectsTop = DefaultProjectsTop;
    public const int AbsoluteMaxClassificationDepth = DefaultClassificationDepth;
    public const int AbsoluteMaxCommentsTop = DefaultCommentsTop;
    public const int AbsoluteMaxTestPlansTop = DefaultTestPlansTop;

    public int ProjectsTop { get; set; } = DefaultProjectsTop;
    public int ClassificationDepth { get; set; } = DefaultClassificationDepth;
    public int CommentsTop { get; set; } = DefaultCommentsTop;
    public int TestPlansTop { get; set; } = DefaultTestPlansTop;
}

public sealed class AzureDevOpsCreationOptions
{
    public const int DefaultStaticSuiteNameAttempts = 3;
    public const int AbsoluteMaxStaticSuiteNameAttempts = DefaultStaticSuiteNameAttempts;

    public int StaticSuiteNameAttempts { get; set; } = DefaultStaticSuiteNameAttempts;
}

public sealed class AzureDevOpsOptionsValidator : IValidateOptions<AzureDevOpsOptions>
{
    public ValidateOptionsResult Validate(string? name, AzureDevOpsOptions options)
    {
        var failures = new List<string>();

        if (options.Search is null)
            failures.Add("AzureDevOps:Search es requerida.");
        else
        {
            ValidateRange(failures, "AzureDevOps:Search:DefaultTop", options.Search.DefaultTop, AzureDevOpsSearchOptions.MinTop, AzureDevOpsSearchOptions.AbsoluteMaxTop);
            ValidateRange(failures, "AzureDevOps:Search:MaxTop", options.Search.MaxTop, AzureDevOpsSearchOptions.MinTop, AzureDevOpsSearchOptions.AbsoluteMaxTop);
            ValidateRange(failures, "AzureDevOps:Search:MaxSearchTextLength", options.Search.MaxSearchTextLength, 1, AzureDevOpsSearchOptions.AbsoluteMaxSearchTextLength);
            if (options.Search.MaxTop < options.Search.DefaultTop)
                failures.Add("AzureDevOps:Search:MaxTop debe ser mayor o igual que DefaultTop.");
        }

        if (options.Http is null)
            failures.Add("AzureDevOps:Http es requerida.");
        else
        {
            ValidateRange(failures, "AzureDevOps:Http:TimeoutSeconds", options.Http.TimeoutSeconds, 1, AzureDevOpsHttpOptions.MaxTimeoutSeconds);
            ValidateRange(failures, "AzureDevOps:Http:RetryCount", options.Http.RetryCount, 0, AzureDevOpsHttpOptions.MaxRetryCount);
            ValidateRange(failures, "AzureDevOps:Http:RetryDelayMilliseconds", options.Http.RetryDelayMilliseconds, 0, AzureDevOpsHttpOptions.MaxRetryDelayMilliseconds);
            if (IsRetryBudgetValid(options.Http)
                && CalculateMaximumRequestDurationMilliseconds(options.Http) > AzureDevOpsHttpOptions.AbsoluteMaxTotalRequestDurationMilliseconds)
            {
                failures.Add(
                    "La combinacion de AzureDevOps:Http:TimeoutSeconds, RetryCount y RetryDelayMilliseconds "
                    + $"no puede superar {AzureDevOpsHttpOptions.AbsoluteMaxTotalRequestDurationMilliseconds} ms en total.");
            }
        }

        if (options.Limits is null)
            failures.Add("AzureDevOps:Limits es requerida.");
        else
        {
            ValidateRange(failures, "AzureDevOps:Limits:MaxOrganizationLength", options.Limits.MaxOrganizationLength, 1, AzureDevOpsLimitsOptions.AbsoluteMaxOrganizationLength);
            ValidateRange(failures, "AzureDevOps:Limits:MaxProjectLength", options.Limits.MaxProjectLength, 1, AzureDevOpsLimitsOptions.AbsoluteMaxProjectLength);
            ValidateRange(failures, "AzureDevOps:Limits:MaxPathLength", options.Limits.MaxPathLength, 1, AzureDevOpsLimitsOptions.AbsoluteMaxPathLength);
            ValidateRange(failures, "AzureDevOps:Limits:MaxWorkItemIds", options.Limits.MaxWorkItemIds, 1, AzureDevOpsLimitsOptions.AbsoluteMaxWorkItemIds);
            ValidateRange(failures, "AzureDevOps:Limits:MaxReferenceNameLength", options.Limits.MaxReferenceNameLength, 1, AzureDevOpsLimitsOptions.AbsoluteMaxReferenceNameLength);
            ValidateRange(failures, "AzureDevOps:Limits:ReferenceNameRegexTimeoutMilliseconds", options.Limits.ReferenceNameRegexTimeoutMilliseconds, 1, AzureDevOpsLimitsOptions.AbsoluteMaxReferenceNameRegexTimeoutMilliseconds);
        }

        if (options.Queries is null)
            failures.Add("AzureDevOps:Queries es requerida.");
        else
        {
            ValidateRange(failures, "AzureDevOps:Queries:ProjectsTop", options.Queries.ProjectsTop, 1, AzureDevOpsQueryOptions.AbsoluteMaxProjectsTop);
            ValidateRange(failures, "AzureDevOps:Queries:ClassificationDepth", options.Queries.ClassificationDepth, 1, AzureDevOpsQueryOptions.AbsoluteMaxClassificationDepth);
            ValidateRange(failures, "AzureDevOps:Queries:CommentsTop", options.Queries.CommentsTop, 1, AzureDevOpsQueryOptions.AbsoluteMaxCommentsTop);
            ValidateRange(failures, "AzureDevOps:Queries:TestPlansTop", options.Queries.TestPlansTop, 1, AzureDevOpsQueryOptions.AbsoluteMaxTestPlansTop);
        }

        if (options.Creation is null)
            failures.Add("AzureDevOps:Creation es requerida.");
        else
            ValidateRange(failures, "AzureDevOps:Creation:StaticSuiteNameAttempts", options.Creation.StaticSuiteNameAttempts, 1, AzureDevOpsCreationOptions.AbsoluteMaxStaticSuiteNameAttempts);

        if (options.Defaults is null)
            failures.Add("AzureDevOps:Defaults es requerida.");
        else if (options.Limits is not null)
        {
            ValidateOptionalOrganization(failures, options.Defaults.Organization, options.Limits.MaxOrganizationLength);
            ValidateOptionalResourceName(failures, "AzureDevOps:Defaults:Project", options.Defaults.Project, options.Limits.MaxProjectLength);
            ValidateOptionalResourceName(failures, "AzureDevOps:Defaults:AreaPath", options.Defaults.AreaPath, options.Limits.MaxPathLength);
            ValidateOptionalResourceName(failures, "AzureDevOps:Defaults:IterationPath", options.Defaults.IterationPath, options.Limits.MaxPathLength);
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateRange(ICollection<string> failures, string key, int value, int minimum, int maximum)
    {
        if (value < minimum || value > maximum)
            failures.Add($"{key} debe estar entre {minimum} y {maximum}.");
    }

    private static void ValidateOptionalOrganization(ICollection<string> failures, string? value, int maximumLength)
    {
        if (string.IsNullOrEmpty(value))
            return;

        var normalized = value.Trim();
        if (normalized.Length == 0
            || normalized.Length > maximumLength
            || normalized.Any(character => char.IsWhiteSpace(character) || char.IsControl(character) || character is '/' or '\\' or ':' or '?' or '#' or '@'))
        {
            failures.Add($"AzureDevOps:Defaults:Organization debe ser un nombre de organizacion valido de hasta {maximumLength} caracteres, no una URL.");
        }
    }

    private static void ValidateOptionalResourceName(ICollection<string> failures, string key, string? value, int maximumLength)
    {
        if (string.IsNullOrEmpty(value))
            return;

        var normalized = value.Trim();
        if (normalized.Length == 0 || normalized.Length > maximumLength || normalized.Any(char.IsControl))
            failures.Add($"{key} debe ser un nombre valido de hasta {maximumLength} caracteres.");
    }

    private static bool IsRetryBudgetValid(AzureDevOpsHttpOptions options) =>
        options.TimeoutSeconds is > 0 and <= AzureDevOpsHttpOptions.MaxTimeoutSeconds
        && options.RetryCount is >= 0 and <= AzureDevOpsHttpOptions.MaxRetryCount
        && options.RetryDelayMilliseconds is >= 0 and <= AzureDevOpsHttpOptions.MaxRetryDelayMilliseconds;

    internal static long CalculateMaximumRequestDurationMilliseconds(AzureDevOpsHttpOptions options)
    {
        var totalDelayMilliseconds = 0L;
        var currentDelayMilliseconds = (long)options.RetryDelayMilliseconds;

        for (var retry = 0; retry < options.RetryCount; retry++)
        {
            totalDelayMilliseconds = checked(totalDelayMilliseconds + currentDelayMilliseconds);
            currentDelayMilliseconds = Math.Min(
                checked(currentDelayMilliseconds * 2L),
                AzureDevOpsHttpOptions.MaxRetryDelayMilliseconds);
        }

        return checked(
            (long)options.TimeoutSeconds * 1_000L * (options.RetryCount + 1L)
            + totalDelayMilliseconds);
    }
}
