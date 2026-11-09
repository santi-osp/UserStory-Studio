using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Application.Options;

public sealed class ArchitectureIntegrationOptions
{
    public const string SectionName = "ArchitectureIntegration";
    public const int DefaultMaxMarkdownLength = 1_000_000;
    public const int AbsoluteMaxMarkdownLength = DefaultMaxMarkdownLength;

    public int MaxMarkdownLength { get; set; } = DefaultMaxMarkdownLength;
}

public sealed class ArchitectureIntegrationOptionsValidator : IValidateOptions<ArchitectureIntegrationOptions>
{
    public ValidateOptionsResult Validate(string? name, ArchitectureIntegrationOptions options) =>
        options.MaxMarkdownLength is >= 1 and <= ArchitectureIntegrationOptions.AbsoluteMaxMarkdownLength
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(
                $"ArchitectureIntegration:MaxMarkdownLength debe estar entre 1 y {ArchitectureIntegrationOptions.AbsoluteMaxMarkdownLength}.");
}
