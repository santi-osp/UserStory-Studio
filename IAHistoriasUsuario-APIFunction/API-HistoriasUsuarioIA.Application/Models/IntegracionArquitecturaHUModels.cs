using System.Text.Json.Serialization;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Solicitud de integración arquitectura-HU con contenido markdown en campos alternativos soportados.
    /// </summary>
    public class IntegracionArquitecturaHUCreateRequest
    {
        [JsonPropertyName("markdown")]
        public string Markdown { get; set; } = string.Empty;

        [JsonPropertyName("markdownContent")]
        public string MarkdownContent { get; set; } = string.Empty;
    }

    /// <summary>
    /// Documento parseado desde markdown antes de crear work items en Azure DevOps.
    /// </summary>
    public sealed class ParsedIntegracionArquitecturaHUDocument
    {
        public List<MarkdownEpicNode> Epics { get; } = [];
        public List<string> Warnings { get; } = [];
    }

    /// <summary>
    /// Nodo de epica parseado con features hijas.
    /// </summary>
    public sealed class MarkdownEpicNode
    {
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public List<MarkdownFeatureNode> Features { get; } = [];
    }

    /// <summary>
    /// Nodo de feature parseado con historias hijas.
    /// </summary>
    public sealed class MarkdownFeatureNode
    {
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public List<MarkdownStoryNode> Stories { get; } = [];
    }

    /// <summary>
    /// Nodo de historia parseado con descripción, criterios y tipo semantico inferido.
    /// </summary>
    public sealed class MarkdownStoryNode
    {
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string AcceptanceCriteria { get; set; } = string.Empty;
        public string StoryType { get; set; } = string.Empty;
    }

    /// <summary>
    /// Resultado de importar markdown a Azure DevOps, incluyendo conteos, IDs, errores y advertencias.
    /// </summary>
    public sealed class IntegracionArquitecturaHUCreateResponse
    {
        [JsonPropertyName("epicsCreated")]
        public int EpicsCreated { get; set; }

        [JsonPropertyName("featuresCreated")]
        public int FeaturesCreated { get; set; }

        [JsonPropertyName("storiesCreated")]
        public int StoriesCreated { get; set; }

        [JsonPropertyName("epicWorkItemType")]
        public string EpicWorkItemType { get; set; } = string.Empty;

        [JsonPropertyName("featureWorkItemType")]
        public string FeatureWorkItemType { get; set; } = string.Empty;

        [JsonPropertyName("storyWorkItemType")]
        public string StoryWorkItemType { get; set; } = string.Empty;

        [JsonPropertyName("ids")]
        public IntegracionArquitecturaHUCreatedIds Ids { get; set; } = new();

        [JsonPropertyName("errors")]
        public List<IntegracionArquitecturaHUCreationError> Errors { get; } = [];

        [JsonPropertyName("warnings")]
        public List<string> Warnings { get; } = [];
    }

    /// <summary>
    /// Agrupa los work items creados por nivel de jerarquía.
    /// </summary>
    public sealed class IntegracionArquitecturaHUCreatedIds
    {
        [JsonPropertyName("epics")]
        public List<CreatedHierarchyWorkItem> Epics { get; } = [];

        [JsonPropertyName("features")]
        public List<CreatedHierarchyWorkItem> Features { get; } = [];

        [JsonPropertyName("stories")]
        public List<CreatedHierarchyWorkItem> Stories { get; } = [];
    }

    /// <summary>
    /// Work item creado dentro de la jerarquía markdown y su relacion padre, si aplica.
    /// </summary>
    public sealed class CreatedHierarchyWorkItem
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("workItemType")]
        public string WorkItemType { get; set; } = string.Empty;

        [JsonPropertyName("url")]
        public string Url { get; set; } = string.Empty;

        [JsonPropertyName("parentId")]
        public int? ParentId { get; set; }
    }

    /// <summary>
    /// Error no bloqueante de una operacion puntual durante la importacion jerarquica.
    /// </summary>
    public sealed class IntegracionArquitecturaHUCreationError
    {
        [JsonPropertyName("level")]
        public string Level { get; set; } = string.Empty;

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("operation")]
        public string Operation { get; set; } = string.Empty;

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("statusCode")]
        public int? StatusCode { get; set; }

        [JsonPropertyName("parentId")]
        public int? ParentId { get; set; }
    }
}
