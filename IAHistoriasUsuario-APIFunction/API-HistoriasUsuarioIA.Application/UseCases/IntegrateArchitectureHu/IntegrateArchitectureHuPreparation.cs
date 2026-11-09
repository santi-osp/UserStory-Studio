using System.Text.Json.Serialization;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;

/// <summary>
/// Resultado de parsing reutilizado por validacion y creacion sin procesar dos veces el markdown.
/// </summary>
public sealed record IntegrateArchitectureHuPreparation(
    ParsedIntegracionArquitecturaHUDocument ParsedDocument,
    ArchitectureHuValidationResponse? ValidationResponse)
{
    public bool HasEpics => ParsedDocument.Epics.Count > 0;
}

/// <summary>
/// Contrato exitoso existente para los modos validateOnly y parseOnly.
/// </summary>
public sealed class ArchitectureHuValidationResponse
{
    [JsonPropertyName("validateOnly")]
    public bool ValidateOnly { get; init; } = true;

    [JsonPropertyName("parsed")]
    public ArchitectureHuParsedSummary Parsed { get; init; } = new();

    [JsonPropertyName("warnings")]
    public IReadOnlyList<string> Warnings { get; init; } = [];

    [JsonPropertyName("markdownPreview")]
    public IReadOnlyList<string> MarkdownPreview { get; init; } = [];

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;
}

public sealed class ArchitectureHuParsedSummary
{
    [JsonPropertyName("epics")]
    public int Epics { get; init; }

    [JsonPropertyName("features")]
    public int Features { get; init; }

    [JsonPropertyName("stories")]
    public int Stories { get; init; }

    [JsonPropertyName("functionalStories")]
    public int FunctionalStories { get; init; }

    [JsonPropertyName("nonFunctionalStories")]
    public int NonFunctionalStories { get; init; }

    [JsonPropertyName("unknownStories")]
    public int UnknownStories { get; init; }
}
