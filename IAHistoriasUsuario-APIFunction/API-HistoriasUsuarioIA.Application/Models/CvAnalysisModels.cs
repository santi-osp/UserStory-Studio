using System.Text.Json.Serialization;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Solicitud de analisis de hoja de vida enviada por el frontend.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class CvAnalysisRequest
    {
        [JsonPropertyName("fileName")]
        public string FileName { get; set; } = string.Empty;

        [JsonPropertyName("text")]
        public string Text { get; set; } = string.Empty;

        [JsonPropertyName("pageCount")]
        public int? PageCount { get; set; }

        [JsonPropertyName("source")]
        public string Source { get; set; } = string.Empty;

        [JsonPropertyName("model")]
        public string? Model { get; set; }
    }

    /// <summary>
    /// Esquema JSON esperado desde el proveedor de IA antes de normalizarlo para la respuesta publica.
    /// </summary>
    public class CvAnalysisAiResult
    {
        [JsonPropertyName("puntuacionGeneral")]
        public int PuntuacionGeneral { get; set; }

        [JsonPropertyName("veredicto")]
        public string Veredicto { get; set; } = string.Empty;

        [JsonPropertyName("resumenEvaluacion")]
        public string ResumenEvaluacion { get; set; } = string.Empty;

        [JsonPropertyName("fortalezas")]
        public List<string> Fortalezas { get; set; } = [];

        [JsonPropertyName("oportunidadesMejora")]
        public List<string> OportunidadesMejora { get; set; } = [];

        [JsonPropertyName("consejosPracticos")]
        public List<string> ConsejosPracticos { get; set; } = [];

        [JsonPropertyName("camposFaltantesODebiles")]
        public List<string> CamposFaltantesODebiles { get; set; } = [];

        [JsonPropertyName("erroresOrtograficos")]
        public List<CvErrorOrtografico> ErroresOrtograficos { get; set; } = [];

        [JsonPropertyName("evaluacionPorCriterio")]
        public List<CvCriterioEvaluacion> EvaluacionPorCriterio { get; set; } = [];
    }

    /// <summary>
    /// Error ortografico detectado por el analisis de IA.
    /// </summary>
    public class CvErrorOrtografico
    {
        [JsonPropertyName("textoOriginal")]
        public string TextoOriginal { get; set; } = string.Empty;

        [JsonPropertyName("sugerencia")]
        public string Sugerencia { get; set; } = string.Empty;

        [JsonPropertyName("contexto")]
        public string Contexto { get; set; } = string.Empty;
    }

    /// <summary>
    /// Evaluacion de uno de los criterios definidos en el system prompt del analisis CV.
    /// </summary>
    public class CvCriterioEvaluacion
    {
        [JsonPropertyName("criterio")]
        public string Criterio { get; set; } = string.Empty;

        [JsonPropertyName("estado")]
        public string Estado { get; set; } = string.Empty;

        [JsonPropertyName("puntaje")]
        public int Puntaje { get; set; }

        [JsonPropertyName("observacion")]
        public string Observacion { get; set; } = string.Empty;
    }

    /// <summary>
    /// Respuesta normalizada del analisis CV devuelta al cliente.
    /// </summary>
    public class CvAnalysisResponse
    {
        [JsonPropertyName("fileName")]
        public string FileName { get; set; } = string.Empty;

        [JsonPropertyName("source")]
        public string Source { get; set; } = string.Empty;

        [JsonPropertyName("pageCount")]
        public int? PageCount { get; set; }

        [JsonPropertyName("puntuacionGeneral")]
        public int PuntuacionGeneral { get; set; }

        [JsonPropertyName("veredicto")]
        public string Veredicto { get; set; } = string.Empty;

        [JsonPropertyName("resumenEvaluacion")]
        public string ResumenEvaluacion { get; set; } = string.Empty;

        [JsonPropertyName("fortalezas")]
        public IReadOnlyList<string> Fortalezas { get; set; } = [];

        [JsonPropertyName("oportunidadesMejora")]
        public IReadOnlyList<string> OportunidadesMejora { get; set; } = [];

        [JsonPropertyName("consejosPracticos")]
        public IReadOnlyList<string> ConsejosPracticos { get; set; } = [];

        [JsonPropertyName("camposFaltantesODebiles")]
        public IReadOnlyList<string> CamposFaltantesODebiles { get; set; } = [];

        [JsonPropertyName("erroresOrtograficos")]
        public IReadOnlyList<CvErrorOrtografico> ErroresOrtograficos { get; set; } = [];

        [JsonPropertyName("evaluacionPorCriterio")]
        public IReadOnlyList<CvCriterioEvaluacion> EvaluacionPorCriterio { get; set; } = [];

        [JsonPropertyName("modeloUsado")]
        public string ModeloUsado { get; set; } = string.Empty;

        [JsonPropertyName("analizadoEnUtc")]
        public string AnalizadoEnUtc { get; set; } = string.Empty;
    }
}
