using System.Text.Json.Serialization;
using System.Text.Json;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Solicitud para generar una historia de usuario con el proveedor de IA configurado.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class GenerateWorkItemRequest
    {
        [JsonPropertyName("prompt")]
        public string Prompt { get; set; } = "";

        [JsonPropertyName("systemPrompt")]
        public string? SystemPrompt { get; set; }

        [JsonPropertyName("model")]
        public string? Model { get; set; }

        [JsonPropertyName("azdoContext")]
        public AzdoContextPayload? AzdoContext { get; set; }
    }

    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public sealed class GenerateTestCasesRequest
    {
        [JsonPropertyName("prompt")]
        public string Prompt { get; set; } = "";

        [JsonPropertyName("systemPrompt")]
        public string SystemPrompt { get; set; } = "";

        [JsonPropertyName("model")]
        public string? Model { get; set; }
    }

    /// <summary>
    /// Solicitud para consultar metadata Azure DevOps con contexto opcional.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class AzdoMetadataRequest
    {
        [JsonPropertyName("azdoContext")]
        public AzdoContextPayload? AzdoContext { get; set; }
    }

    /// <summary>
    /// Contexto de Azure DevOps enviado por el frontend para resolver organizacion y ruta/proyecto.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class AzdoContextPayload
    {
        [JsonPropertyName("organization")]
        public string Organization { get; set; } = "";

        [JsonPropertyName("azurePath")]
        public string AzurePath { get; set; } = "";
    }

    /// <summary>
    /// Resumen minimo de un work item creado y su URL navegable.
    /// </summary>
    public record CreatedWorkItem(
        int Id,
        string Title,
        string Url,
        string InitialState = "",
        string RequestedState = "",
        string FinalState = "",
        int Index = -1);

    /// <summary>
    /// Payload de creación de Work Items y Test Cases enviado al endpoint <c>v1.0.0/create</c>.
    /// </summary>
    /// <remarks>
    /// Combina contexto Azure DevOps, campos del Work Item, casos de prueba opcionales y Test Plan opcional.
    /// </remarks>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class WorkItemPayload
    {
        [JsonPropertyName("azdoOrg")]
        public string AzdoOrg { get; set; } = "";

        [JsonPropertyName("azdoProject")]
        public string AzdoProject { get; set; } = "";

        [JsonPropertyName("iterationPath")]
        public string IterationPath { get; set; } = "";

        [JsonPropertyName("areaPath")]
        public string AreaPath { get; set; } = "";

        [JsonPropertyName("workItemType")]
        public string WorkItemType { get; set; } = "";

        [JsonPropertyName("workItem")]
        public WorkItemFields? WorkItem { get; set; }

        [JsonPropertyName("testCases")]
        public List<TestCaseFields> TestCases { get; set; } = [];

        [JsonPropertyName("testSuite")]
        public TestSuitePayload? TestSuite { get; set; }
    }

    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class CreateWorkItemPayload
    {
        [JsonPropertyName("azdoOrg")] public string AzdoOrg { get; set; } = "";
        [JsonPropertyName("azdoProject")] public string AzdoProject { get; set; } = "";
        [JsonPropertyName("iterationPath")] public string IterationPath { get; set; } = "";
        [JsonPropertyName("areaPath")] public string AreaPath { get; set; } = "";
        [JsonPropertyName("workItemType")] public string WorkItemType { get; set; } = "";
        [JsonPropertyName("hu")] public WorkItemFields? Hu { get; set; }
        [JsonPropertyName("testCases")] public List<TestCaseFields> TestCases { get; set; } = [];
        [JsonPropertyName("testSuite")] public TestSuitePayload? TestSuite { get; set; }
    }

    /// <summary>
    /// Datos de Test Plan usados para crear una requirement suite cuando hay Test Cases asociados.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class TestSuitePayload
    {
        [JsonPropertyName("planId")]
        public int PlanId { get; set; } = 0;
    }

    /// <summary>
    /// Campos de negocio del Work Item generada o editada por el frontend.
    /// </summary>
    /// <remarks>
    /// <see cref="AdditionalFields"/> permite recibir campos dinámicos de Azure DevOps sin cambiar el contrato.
    /// </remarks>
    public class WorkItemFields
    {
        [JsonPropertyName("title")]
        public string Title { get; set; } = "";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("acceptanceCriteria")]
        public string AcceptanceCriteria { get; set; } = "";

        [JsonExtensionData]
        public Dictionary<string, JsonElement> AdditionalFields { get; set; } = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Convierte campos conocidos y dinámicos a un mapa usado para resolver campos Azure DevOps por alias,
        /// nombre visible o reference name.
        /// </summary>
        public Dictionary<string, object?> ToValueMap()
        {
            var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["System.Title"] = Title,
                ["System.Description"] = Description,
                ["Microsoft.VSTS.Common.AcceptanceCriteria"] = AcceptanceCriteria
            };

            foreach (var pair in AdditionalFields)
            {
                values[pair.Key] = pair.Value.ValueKind switch
                {
                    JsonValueKind.Null => null,
                    JsonValueKind.Undefined => null,
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Number when pair.Value.TryGetInt64(out var intValue) => intValue,
                    JsonValueKind.Number when pair.Value.TryGetDouble(out var doubleValue) => doubleValue,
                    JsonValueKind.String => pair.Value.GetString(),
                    _ => pair.Value.GetRawText()
                };
            }

            return values;
        }
    }

    /// <summary>
    /// Campos basicos de un Test Case Azure DevOps y sus pasos TCM.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class TestCaseFields
    {
        [JsonPropertyName("title")]
        public string Title { get; set; } = "";

        [JsonPropertyName("state")]
        public string State { get; set; } = "";

        [JsonPropertyName("steps")]
        public List<TestCaseStep> Steps { get; set; } = [];
    }

    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class TestCaseStep
    {
        [JsonPropertyName("action")]
        public string Action { get; set; } = "";

        [JsonPropertyName("expected")]
        public string Expected { get; set; } = "";
    }

    /// <summary>Contrato exclusivo de <c>v1.0.0/create-test-cases</c>.</summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class CreateTestCasesPayload
    {
        [JsonPropertyName("azdoOrg")]
        public string AzdoOrg { get; set; } = "";

        [JsonPropertyName("azdoProject")]
        public string AzdoProject { get; set; } = "";

        [JsonPropertyName("iterationPath")]
        public string IterationPath { get; set; } = "";

        [JsonPropertyName("areaPath")]
        public string AreaPath { get; set; } = "";

        [JsonPropertyName("suiteTitle")]
        public string SuiteTitle { get; set; } = "";

        [JsonPropertyName("testCases")]
        public List<TestCaseFields> TestCases { get; set; } = [];

        [JsonPropertyName("testSuite")]
        public TestSuitePayload? TestSuite { get; set; }
    }

    /// <summary>Salida estructurada esperada del flujo de generacion exclusiva de Test Cases.</summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class GeneratedTestCasesPayload
    {
        [JsonPropertyName("suiteTitle")]
        public string SuiteTitle { get; set; } = "";

        [JsonPropertyName("testCases")]
        public List<TestCaseFields> TestCases { get; set; } = [];
    }

    public sealed record TestPlanContext(int PlanId, string PlanName, int RootSuiteId);
    public sealed record TestSuiteSummary(int Id, string Name, int ParentSuiteId, string SuiteType);
    public sealed record CreatedTestSuite(int Id, string Name, string SuiteType);
    public sealed record CreatedTestCase(int Id, string InitialState);

    public sealed class TestSuiteNameConflictException : Exception
    {
        public TestSuiteNameConflictException() : base("El nombre de la suite ya no esta disponible.") { }
    }

    public sealed class AzureDevOpsMutationException : Exception
    {
        public AzureDevOpsMutationException(string operation, int statusCode, string safeDetail)
            : base("Azure DevOps rechazo una fase de mutacion.")
        {
            Operation = operation;
            StatusCode = statusCode;
            SafeDetail = safeDetail;
        }

        public string Operation { get; }
        public int StatusCode { get; }
        public string SafeDetail { get; }
    }

    /// <summary>
    /// Solicitud para obtener configuracion dinamica de campos de un tipo de work item.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class WorkItemConfigRequest
    {
        [JsonPropertyName("azdoProject")]
        public string AzdoProject { get; set; } = "";

        [JsonPropertyName("workItemType")]
        public string WorkItemType { get; set; } = "";

        [JsonPropertyName("azdoContext")]
        public AzdoContextPayload? AzdoContext { get; set; }
    }

    /// <summary>
    /// Solicitud que identifica un proyecto Azure DevOps para consultas de metadata especifica.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class AzdoProjectRequest
    {
        [JsonPropertyName("azdoProject")]
        public string AzdoProject { get; set; } = "";

        [JsonPropertyName("azdoContext")]
        public AzdoContextPayload? AzdoContext { get; set; }
    }

    /// <summary>
    /// Contexto Azure DevOps recibido en el body del endpoint de integración arquitectura-HU.
    /// </summary>
    /// <remarks>
    /// Permite enviar organizacion, proyecto, iteracion y area por body como alternativa a los headers o variables de
    /// configuracion. El contenido del backlog markdown se resuelve aparte por su propio campo textual.
    /// </remarks>
    public class IntegracionArquitecturaHURequest
    {
        [JsonPropertyName("azdoOrg")]
        public string AzdoOrg { get; set; } = "";

        [JsonPropertyName("azdoProject")]
        public string AzdoProject { get; set; } = "";

        [JsonPropertyName("iterationPath")]
        public string IterationPath { get; set; } = "";

        [JsonPropertyName("areaPath")]
        public string AreaPath { get; set; } = "";
    }

    /// <summary>
    /// Respuesta del endpoint de Test Plans.
    /// </summary>
    public class TestPlansResponse
    {
        [JsonPropertyName("project")]
        public string Project { get; set; } = "";

        [JsonPropertyName("testPlans")]
        public IReadOnlyList<TestPlanSummary> TestPlans { get; set; } = [];
    }

    /// <summary>
    /// Identificador y nombre de un Test Plan Azure DevOps.
    /// </summary>
    public class TestPlanSummary
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";
    }

    /// <summary>
    /// Solicitud para consultar comentarios de discusion de uno o varios work items.
    /// </summary>
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    public class WorkItemDiscussionCommentsRequest
    {
        [JsonPropertyName("azdoProject")]
        public string AzdoProject { get; set; } = "";

        [JsonPropertyName("workItemIds")]
        public List<int> WorkItemIds { get; set; } = [];

        [JsonPropertyName("workItemId")]
        public int? WorkItemId { get; set; }

        [JsonPropertyName("azdoContext")]
        public AzdoContextPayload? AzdoContext { get; set; }
    }

    /// <summary>
    /// Respuesta agregada de comentarios para varios work items.
    /// </summary>
    public class WorkItemsDiscussionCommentsResponse
    {
        [JsonPropertyName("project")]
        public string Project { get; set; } = "";

        [JsonPropertyName("requestedCount")]
        public int RequestedCount { get; set; }

        [JsonPropertyName("items")]
        public IReadOnlyList<WorkItemDiscussionCommentsResponse> Items { get; set; } = [];
    }

    /// <summary>
    /// Comentarios de discusion normalizados para un work item.
    /// </summary>
    public class WorkItemDiscussionCommentsResponse
    {
        [JsonPropertyName("project")]
        public string Project { get; set; } = "";

        [JsonPropertyName("workItemId")]
        public int WorkItemId { get; set; }

        [JsonPropertyName("count")]
        public int Count { get; set; }

        [JsonPropertyName("comments")]
        public IReadOnlyList<WorkItemDiscussionComment> Comments { get; set; } = [];
    }

    /// <summary>
    /// Comentario individual de Azure DevOps con texto, autor, fechas y estado de eliminacion.
    /// </summary>
    public class WorkItemDiscussionComment
    {
        [JsonPropertyName("commentId")]
        public int CommentId { get; set; }

        [JsonPropertyName("text")]
        public string Text { get; set; } = "";

        [JsonPropertyName("renderedText")]
        public string RenderedText { get; set; } = "";

        [JsonPropertyName("createdBy")]
        public string CreatedBy { get; set; } = "";

        [JsonPropertyName("createdDate")]
        public string CreatedDate { get; set; } = "";

        [JsonPropertyName("modifiedBy")]
        public string ModifiedBy { get; set; } = "";

        [JsonPropertyName("modifiedDate")]
        public string ModifiedDate { get; set; } = "";

        [JsonPropertyName("isDeleted")]
        public bool IsDeleted { get; set; }

        [JsonPropertyName("url")]
        public string Url { get; set; } = "";
    }

    /// <summary>
    /// Configuracion dinamica de campos para un tipo de work item en un proyecto.
    /// </summary>
    public class WorkItemConfigResponse
    {
        [JsonPropertyName("project")]
        public string Project { get; set; } = "";

        [JsonPropertyName("workItemType")]
        public string WorkItemType { get; set; } = "";

        [JsonPropertyName("fields")]
        public IReadOnlyList<WorkItemFieldConfig> Fields { get; set; } = [];
    }

    /// <summary>
    /// Campo de work item preparado para captura en UI y creación por JSON Patch.
    /// </summary>
    public class WorkItemFieldConfig
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("referenceName")]
        public string ReferenceName { get; set; } = "";

        [JsonPropertyName("label")]
        public string Label { get; set; } = "";

        [JsonPropertyName("type")]
        public string Type { get; set; } = "string";

        [JsonPropertyName("required")]
        public bool Required { get; set; }

        [JsonPropertyName("control")]
        public string Control { get; set; } = "input";

        [JsonPropertyName("options")]
        public string[] Options { get; set; } = [];

        [JsonIgnore]
        public bool HasDefaultValue { get; set; }

        [JsonIgnore]
        public bool IsReadOnly { get; set; }
    }

}
