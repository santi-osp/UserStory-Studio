using System.Text.Json.Serialization;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Solicitud para evaluar un Work Item existente en Azure DevOps.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class EvaluateWorkItemRequest
    {
        [JsonPropertyName("workItemId")]
        public int WorkItemId { get; set; }

        [JsonPropertyName("azdoProject")]
        public string AzdoProject { get; set; } = "";

        [JsonPropertyName("requestedModel")]
        public string? RequestedModel { get; set; }

        [JsonPropertyName("prompt")]
        public string? Prompt { get; set; }

        [JsonPropertyName("systemPrompt")]
        public string? SystemPrompt { get; set; }

        [JsonPropertyName("azdoContext")]
        public AzdoContextPayload? AzdoContext { get; set; }
    }

    /// <summary>
    /// Respuesta de evaluación de Work Item sin prompt ni salida cruda del modelo.
    /// </summary>
    public class EvaluateWorkItemResponse
    {
        [JsonPropertyName("workItemId")]
        public int WorkItemId { get; set; }

        [JsonPropertyName("workItemUrl")]
        public string WorkItemUrl { get; set; } = "";

        [JsonPropertyName("title")]
        public string Title { get; set; } = "";

        [JsonPropertyName("workItemType")]
        public string WorkItemType { get; set; } = "";

        [JsonPropertyName("state")]
        public string State { get; set; } = "";

        [JsonPropertyName("model")]
        public string Model { get; set; } = "";

        [JsonPropertyName("evaluation")]
        public WorkItemEvaluationResult Evaluation { get; set; } = new();
    }

    /// <summary>
    /// Resultado estructurado que la IA debe devolver para la evaluación funcional de Work Item.
    /// </summary>
    public class WorkItemEvaluationResult
    {
        [JsonPropertyName("summary")]
        public string Summary { get; set; } = "";

        [JsonPropertyName("qualityScore")]
        public int QualityScore { get; set; }

        [JsonPropertyName("qualityLevel")]
        public string QualityLevel { get; set; } = "";

        [JsonPropertyName("readiness")]
        public string Readiness { get; set; } = "";

        [JsonPropertyName("mainFindings")]
        public List<string> MainFindings { get; set; } = [];

        [JsonPropertyName("risks")]
        public List<string> Risks { get; set; } = [];

        [JsonPropertyName("ambiguities")]
        public List<string> Ambiguities { get; set; } = [];

        [JsonPropertyName("missingInformation")]
        public List<string> MissingInformation { get; set; } = [];

        [JsonPropertyName("acceptanceCriteriaFindings")]
        public List<string> AcceptanceCriteriaFindings { get; set; } = [];

        [JsonPropertyName("edgeCases")]
        public List<string> EdgeCases { get; set; } = [];

        [JsonPropertyName("dependencies")]
        public List<string> Dependencies { get; set; } = [];

        [JsonPropertyName("dataValidations")]
        public List<string> DataValidations { get; set; } = [];

        [JsonPropertyName("securityConsiderations")]
        public List<string> SecurityConsiderations { get; set; } = [];

        [JsonPropertyName("observabilityConsiderations")]
        public List<string> ObservabilityConsiderations { get; set; } = [];

        [JsonPropertyName("recommendations")]
        public List<string> Recommendations { get; set; } = [];

        [JsonPropertyName("refinementQuestions")]
        public List<string> RefinementQuestions { get; set; } = [];

        [JsonPropertyName("suggestedAcceptanceCriteria")]
        public List<string> SuggestedAcceptanceCriteria { get; set; } = [];

        [JsonPropertyName("improvedVersion")]
        public WorkItemImprovedVersion ImprovedVersion { get; set; } = new();

        [JsonPropertyName("refinementPriority")]
        public string RefinementPriority { get; set; } = "";

        [JsonPropertyName("conclusion")]
        public string Conclusion { get; set; } = "";
    }

    public class WorkItemImprovedVersion
    {
        [JsonPropertyName("suggestedTitle")]
        public string SuggestedTitle { get; set; } = "";

        [JsonPropertyName("suggestedDescription")]
        public string SuggestedDescription { get; set; } = "";

        [JsonPropertyName("suggestedAcceptanceCriteria")]
        public List<string> SuggestedAcceptanceCriteria { get; set; } = [];
    }

    /// <summary>
    /// Campos mínimos de Azure DevOps enviados al proveedor de IA para evaluar un Work Item.
    /// </summary>
    public class AzdoWorkItemDetails
    {
        public int Id { get; set; }
        public string Title { get; set; } = "";
        public string Description { get; set; } = "";
        public string AcceptanceCriteria { get; set; } = "";
        public string WorkItemType { get; set; } = "";
        public string State { get; set; } = "";
        public string AreaPath { get; set; } = "";
        public string IterationPath { get; set; } = "";
        public int? Priority { get; set; }
        public double? StoryPoints { get; set; }
        public Dictionary<string, object?> FunctionalFields { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Solicitud para buscar Work Items existentes sin traer contenido funcional completo.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class SearchWorkItemsRequest
    {
        [JsonPropertyName("azdoProject")]
        public string AzdoProject { get; set; } = "";

        [JsonPropertyName("areaPath")]
        public string? AreaPath { get; set; }

        [JsonPropertyName("iterationPath")]
        public string? IterationPath { get; set; }

        [JsonPropertyName("searchText")]
        public string? SearchText { get; set; }

        [JsonPropertyName("top")]
        public int Top { get; set; }

        [JsonPropertyName("azdoContext")]
        public AzdoContextPayload? AzdoContext { get; set; }
    }

    /// <summary>
    /// Respuesta del selector de Work Items.
    /// </summary>
    public class SearchWorkItemsResponse
    {
        [JsonPropertyName("project")]
        public string Project { get; set; } = "";

        [JsonPropertyName("count")]
        public int Count { get; set; }

        [JsonPropertyName("items")]
        public IReadOnlyList<WorkItemLookupItem> Items { get; set; } = [];
    }

    /// <summary>
    /// Item liviano para poblar el selector dinámico de Work Items.
    /// </summary>
    public class WorkItemLookupItem
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("title")]
        public string Title { get; set; } = "";

        [JsonPropertyName("state")]
        public string State { get; set; } = "";

        [JsonPropertyName("areaPath")]
        public string AreaPath { get; set; } = "";

        [JsonPropertyName("iterationPath")]
        public string IterationPath { get; set; } = "";

        [JsonPropertyName("workItemType")]
        public string WorkItemType { get; set; } = "";

        [JsonPropertyName("displayName")]
        public string DisplayName => $"{Id} - {Title}";
    }
}
