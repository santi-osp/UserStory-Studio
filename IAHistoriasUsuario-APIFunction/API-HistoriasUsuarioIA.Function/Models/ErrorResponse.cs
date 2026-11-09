using System.Text.Json.Serialization;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Error contract exposed to clients. Technical details stay in internal logs.
    /// </summary>
    public sealed record ErrorResponse(
        [property: JsonPropertyName("code")] string Code,
        [property: JsonPropertyName("message")] string Message,
        [property: JsonPropertyName("correlationId")] string CorrelationId,
        [property: JsonPropertyName("detail")] string? Detail = null);
}
