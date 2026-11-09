using System.Text.Json.Serialization;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoMetadata;

/// <summary>
/// Metadata Azure DevOps expuesta al frontend para parametrizacion.
/// </summary>
public sealed class GetAzdoMetadataResponse
{
    [JsonPropertyName("projects")]
    public IReadOnlyList<string> Projects { get; init; } = [];

    [JsonPropertyName("areaPaths")]
    public IReadOnlyList<string> AreaPaths { get; init; } = [];

    [JsonPropertyName("iterationPaths")]
    public IReadOnlyList<string> IterationPaths { get; init; } = [];

    [JsonPropertyName("projectMetadata")]
    public IReadOnlyList<GetAzdoProjectMetadata> ProjectMetadata { get; init; } = [];
}

public sealed class GetAzdoProjectMetadata
{
    [JsonPropertyName("project")]
    public string Project { get; init; } = string.Empty;

    [JsonPropertyName("areaPaths")]
    public IReadOnlyList<string> AreaPaths { get; init; } = [];

    [JsonPropertyName("iterationPaths")]
    public IReadOnlyList<string> IterationPaths { get; init; } = [];
}
