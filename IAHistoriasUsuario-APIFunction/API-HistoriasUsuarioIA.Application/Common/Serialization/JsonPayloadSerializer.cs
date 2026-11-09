using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Opciones compartidas para serializar/deserializar payloads HTTP del backend.
    /// </summary>
    public sealed class JsonPayloadSerializer
    {
        public JsonPayloadSerializer(IOptions<RequestValidationOptions> options)
        {
            ArgumentNullException.ThrowIfNull(options);
            Options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                MaxDepth = options.Value.MaxJsonDepth
            };
        }

        /// <summary>Unica configuracion efectiva de System.Text.Json usada por el backend.</summary>
        public JsonSerializerOptions Options { get; }
    }
}
