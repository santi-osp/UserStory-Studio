using System.Text.Json.Serialization;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;

/// <summary>
/// Respuesta compatible con el contrato HTTP existente del endpoint de generacion.
/// </summary>
public sealed class GenerateWorkItemUseCaseResponse
{
    [JsonPropertyName("json")]
    public string Json { get; init; } = string.Empty;

    [JsonPropertyName("raw")]
    public string Raw { get; init; } = string.Empty;

    [JsonPropertyName("warning")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Warning { get; init; }
}
