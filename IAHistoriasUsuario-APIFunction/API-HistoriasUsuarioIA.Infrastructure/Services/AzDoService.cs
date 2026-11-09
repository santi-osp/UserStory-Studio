using System.Text;
using System.Text.Json;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Excepcion para respuestas no exitosas de Azure DevOps.
    /// </summary>
    /// <remarks>
    /// Conserva operacion, estado, URL y body externo para que las Azure Functions puedan mapear estado y registrar
    /// trazas sin perder el detalle tecnico de la integracion.
    /// </remarks>
    public sealed class AzDoRequestException : Exception
    {
        public string Operation { get; }
        public int StatusCode { get; }
        public string Url { get; }
        public string ResponseBody { get; }

        public AzDoRequestException(string operation, int statusCode, string url, string responseBody)
            : base($"Azure DevOps API error in '{operation}'. Status={statusCode}.")
        {
            Operation = operation;
            StatusCode = statusCode;
            Url = url;
            ResponseBody = responseBody;
        }
    }

    /// <summary>
    /// Excepcion de validacion local para campos requeridos antes de crear un work item.
    /// </summary>
    public sealed class WorkItemValidationException : Exception
    {
        public IReadOnlyList<string> MissingFields { get; }

        public WorkItemValidationException(IReadOnlyList<string> missingFields)
            : base($"Faltan campos requeridos para crear el work item: {string.Join(", ", missingFields)}.")
        {
            MissingFields = missingFields;
        }
    }

    /// <summary>
    /// Servicio de integracion directa con Azure DevOps REST API.
    /// </summary>
    /// <remarks>
    /// Encapsula llamadas HTTP para proyectos, clasificaciones, work items, comentarios y Test Plans. Los metodos
    /// que crean o vinculan elementos producen efectos secundarios en Azure DevOps mediante JSON Patch.
    /// </remarks>
    public class AzDoService : IAzDoService
    {
        readonly string _org;
        readonly string _project;
        readonly string _escapedOrg;
        readonly string _escapedProject;
        readonly HttpClient _client;
        readonly string _api;
        readonly ILogger? _logger;
        readonly int _defaultWorkItemSearchTop;
        readonly int _maxWorkItemSearchTop;
        readonly int _projectsTop;
        readonly int _classificationDepth;
        readonly int _commentsTop;
        readonly int _testPlansTop;
        readonly int _maxExternalErrorDetailLength;
        readonly JsonSerializerOptions _jsonOptions;
        readonly JsonDocumentOptions _jsonDocumentOptions;

        /// <summary>
        /// Inicializa un servicio con contexto de organizacion/proyecto y un cliente ya autenticado.
        /// </summary>
        public AzDoService(
            string org,
            string project,
            HttpClient client,
            string apiVersion,
            ILogger? logger,
            int defaultWorkItemSearchTop,
            int maxWorkItemSearchTop,
            int projectsTop,
            int classificationDepth,
            int commentsTop,
            int testPlansTop,
            int maxExternalErrorDetailLength,
            JsonSerializerOptions jsonOptions)
        {
            ArgumentNullException.ThrowIfNull(client);
            ArgumentNullException.ThrowIfNull(jsonOptions);
            ValidateRange(nameof(defaultWorkItemSearchTop), defaultWorkItemSearchTop,
                AzureDevOpsSearchOptions.MinTop, AzureDevOpsSearchOptions.AbsoluteMaxTop);
            ValidateRange(nameof(maxWorkItemSearchTop), maxWorkItemSearchTop,
                defaultWorkItemSearchTop, AzureDevOpsSearchOptions.AbsoluteMaxTop);
            ValidateRange(nameof(projectsTop), projectsTop, 1, AzureDevOpsQueryOptions.AbsoluteMaxProjectsTop);
            ValidateRange(nameof(classificationDepth), classificationDepth, 1, AzureDevOpsQueryOptions.AbsoluteMaxClassificationDepth);
            ValidateRange(nameof(commentsTop), commentsTop, 1, AzureDevOpsQueryOptions.AbsoluteMaxCommentsTop);
            ValidateRange(nameof(testPlansTop), testPlansTop, 1, AzureDevOpsQueryOptions.AbsoluteMaxTestPlansTop);
            ValidateRange(nameof(maxExternalErrorDetailLength), maxExternalErrorDetailLength,
                1, ObservabilityOptions.AbsoluteMaxExternalErrorDetailLength);

            _org = org?.Trim() ?? string.Empty;
            _project = project?.Trim() ?? string.Empty;
            _escapedOrg = EncodeUrlPathSegment(_org);
            _escapedProject = EncodeUrlPathSegment(_project);
            _client = client;
            _api = apiVersion;
            _logger = logger;
            _defaultWorkItemSearchTop = defaultWorkItemSearchTop;
            _maxWorkItemSearchTop = maxWorkItemSearchTop;
            _projectsTop = projectsTop;
            _classificationDepth = classificationDepth;
            _commentsTop = commentsTop;
            _testPlansTop = testPlansTop;
            _maxExternalErrorDetailLength = maxExternalErrorDetailLength;
            _jsonOptions = jsonOptions;
            _jsonDocumentOptions = new JsonDocumentOptions { MaxDepth = _jsonOptions.MaxDepth };
        }

        private static void ValidateRange(string parameterName, int value, int minimum, int maximum)
        {
            if (value < minimum || value > maximum)
                throw new ArgumentOutOfRangeException(parameterName, value, $"Debe estar entre {minimum} y {maximum}.");
        }

        /// <inheritdoc />
        public async Task<IReadOnlyList<string>> GetProjectsAsync()
        {
            var projects = new List<string>();
            string? continuationToken = null;

            do
            {
                var tokenParam = continuationToken != null
                    ? $"&continuationToken={Uri.EscapeDataString(continuationToken)}"
                    : "";
                var url = $"https://dev.azure.com/{_escapedOrg}/_apis/projects?$top={_projectsTop}{tokenParam}&api-version={_api}";
                using var resp = await _client.GetAsync(url);
                var body = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                    throw new AzDoRequestException("GetProjects", (int)resp.StatusCode, url, body);

                using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
                if (doc.RootElement.TryGetProperty("value", out var value) && value.ValueKind == JsonValueKind.Array)
                {
                    foreach (var project in value.EnumerateArray())
                    {
                        var projectName = project.TryGetProperty("name", out var nameProperty)
                            ? nameProperty.GetString()
                            : null;

                        if (!string.IsNullOrWhiteSpace(projectName))
                            projects.Add(projectName.Trim());
                    }
                }

                resp.Headers.TryGetValues("x-ms-continuationtoken", out var tokens);
                continuationToken = tokens?.FirstOrDefault();
            } while (continuationToken != null);

            return projects;
        }

        /// <inheritdoc />
        public async Task<IReadOnlyList<string>> GetClassificationPathsAsync(string project, string structureGroup)
        {
            var escapedStructureGroup = Uri.EscapeDataString(structureGroup);
            var escapedProject = EncodeUrlPathSegment(project);
            var url = $"https://dev.azure.com/{_escapedOrg}/{escapedProject}/_apis/wit/classificationnodes/{escapedStructureGroup}?$depth={_classificationDepth}&api-version={_api}";
            using var resp = await _client.GetAsync(url);
            var body = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode)
                throw new AzDoRequestException("GetClassificationPaths", (int)resp.StatusCode, url, body);

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            var paths = new List<string>();
            FlattenClassificationNodePaths(doc.RootElement, paths);
            return paths;
        }

        /// <inheritdoc />
        public string WorkItemUrl(int id) =>
            $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_workitems/edit/{id}";

        /// <inheritdoc />
        public async Task<string> ResolveWorkItemTypeByCategoryAsync(
            string project,
            string categoryReferenceName,
            string fallbackWorkItemType)
        {
            var normalizedProject = project?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(normalizedProject))
                throw new ArgumentException("project es requerido.", nameof(project));

            var normalizedCategory = categoryReferenceName?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(normalizedCategory))
                throw new ArgumentException("categoryReferenceName es requerido.", nameof(categoryReferenceName));

            if (!normalizedCategory.StartsWith("$", StringComparison.Ordinal))
                normalizedCategory = $"${normalizedCategory}";

            var escapedCategory = Uri.EscapeDataString(normalizedCategory);
            var escapedProject = EncodeUrlPathSegment(normalizedProject);
            var url = $"https://dev.azure.com/{_escapedOrg}/{escapedProject}/_apis/wit/workitemtypecategories/{escapedCategory}?api-version={_api}";
            using var resp = await _client.GetAsync(url);
            var body = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                if ((int)resp.StatusCode == 404 && !string.IsNullOrWhiteSpace(fallbackWorkItemType))
                    return fallbackWorkItemType.Trim();

                throw new AzDoRequestException("ResolveWorkItemTypeByCategory", (int)resp.StatusCode, url, body);
            }

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            if (doc.RootElement.TryGetProperty("defaultWorkItemType", out var defaultWorkItemType))
            {
                var defaultName = ExtractName(defaultWorkItemType);
                if (!string.IsNullOrWhiteSpace(defaultName))
                    return defaultName;
            }

            if (doc.RootElement.TryGetProperty("workItemTypes", out var workItemTypes)
                && workItemTypes.ValueKind == JsonValueKind.Array)
            {
                foreach (var typeElement in workItemTypes.EnumerateArray())
                {
                    var typeName = ExtractName(typeElement);
                    if (!string.IsNullOrWhiteSpace(typeName))
                        return typeName;
                }
            }

            if (!string.IsNullOrWhiteSpace(fallbackWorkItemType))
                return fallbackWorkItemType.Trim();

            throw new ArgumentException($"No fue posible resolver un tipo de work item para la categoria {normalizedCategory}.");
        }

        /// <inheritdoc />
        public async Task<int> CreateWorkItemAsync(string workItemType, IReadOnlyDictionary<string, object?> fields)
        {
            var normalizedWorkItemType = workItemType?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(normalizedWorkItemType))
                throw new ArgumentException("workItemType es requerido.", nameof(workItemType));

            if (fields is null || fields.Count == 0)
                throw new ArgumentException("fields es requerido.", nameof(fields));

            if (!fields.TryGetValue("System.Title", out var rawTitle)
                || string.IsNullOrWhiteSpace(Convert.ToString(rawTitle, CultureInfo.InvariantCulture)))
            {
                throw new ArgumentException("System.Title es requerido para crear work items.", nameof(fields));
            }

            var patch = new List<Dictionary<string, object>>();
            foreach (var pair in fields)
            {
                var fieldReferenceName = pair.Key?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(fieldReferenceName))
                    continue;

                var value = pair.Value;
                if (value is null)
                    continue;

                if (value is string stringValue)
                {
                    if (fieldReferenceName.Equals("System.IterationPath", StringComparison.OrdinalIgnoreCase))
                        stringValue = NormalizeHierarchyPath(stringValue, "iteration");
                    else if (fieldReferenceName.Equals("System.AreaPath", StringComparison.OrdinalIgnoreCase))
                        stringValue = NormalizeHierarchyPath(stringValue, "area");

                    if (string.IsNullOrWhiteSpace(stringValue))
                        continue;

                    value = stringValue.Trim();
                }

                var path = ToJsonPatchFieldPath(fieldReferenceName);

                patch.Add(Op(path, value));
            }

            if (patch.Count == 0)
                throw new ArgumentException("No se encontraron campos validos para crear el work item.", nameof(fields));

            var escapedWorkItemType = Uri.EscapeDataString(normalizedWorkItemType);
            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/${escapedWorkItemType}?api-version={_api}";
            var response = await PatchWiAsync(url, patch, "CreateWorkItem");
            return response.GetProperty("id").GetInt32();
        }

        /// <inheritdoc />
        public async Task LinkParentAsync(int childId, int parentId)
        {
            if (childId <= 0)
                throw new ArgumentException("childId debe ser mayor a 0.", nameof(childId));

            if (parentId <= 0)
                throw new ArgumentException("parentId debe ser mayor a 0.", nameof(parentId));

            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/{childId}?api-version={_api}";
            var parentWorkItemUrl = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/{parentId}";
            var patch = new List<Dictionary<string, object>>
            {
                Op("/relations/-", new Dictionary<string, object>
                {
                    { "rel", "System.LinkTypes.Hierarchy-Reverse" },
                    { "url", parentWorkItemUrl },
                    { "attributes", new Dictionary<string, object> { { "comment", "Relacion padre-hijo creada automaticamente" } } }
                })
            };

            await PatchWiAsync(url, patch, "LinkParent");
        }

        static Dictionary<string, object> Op(string path, object value) =>
            new() { { "op", "add" }, { "path", path }, { "value", value } };

        private static string EncodeUrlPathSegment(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            var normalized = value.Trim();
            try
            {
                normalized = Uri.UnescapeDataString(normalized);
            }
            catch (UriFormatException)
            {
                // Keep original value when it contains invalid escape sequences.
            }

            return Uri.EscapeDataString(normalized);
        }

        /// <inheritdoc />
        public async Task<WorkItemConfigResponse> GetWorkItemConfigAsync(string project, string requestedWorkItemType = "")
        {
            var normalizedProject = project?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(normalizedProject))
                throw new ArgumentException("azdoProject es requerido.", nameof(project));

            var workItemType = string.IsNullOrWhiteSpace(requestedWorkItemType)
                ? await DetectRequirementWorkItemTypeAsync(normalizedProject)
                : requestedWorkItemType.Trim();

            var fields = await GetWorkItemTypeFieldsAsync(normalizedProject, workItemType);

            return new WorkItemConfigResponse
            {
                Project = normalizedProject,
                WorkItemType = workItemType,
                Fields = fields
            };
        }

        /// <summary>
        /// Reduce la lista de campos de Azure DevOps a los que son utiles para planeacion, clasificacion y captura UI.
        /// </summary>
        public static IReadOnlyList<WorkItemFieldConfig> FilterFieldsForPlanningAndClassificationUi(
            IReadOnlyList<WorkItemFieldConfig> fields)
        {
            if (fields is null || fields.Count == 0)
                return [];

            return fields
                .Where(IsPlanningOrClassificationUiField)
                .OrderByDescending(field => field.Required)
                .ThenBy(field => field.Label, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        /// <summary>
        /// Selecciona exclusivamente los campos funcionales de contenido que Azure DevOps
        /// declara para el tipo, conservando el orden canónico usado por el frontend.
        /// </summary>
        public static IReadOnlyList<WorkItemFieldConfig> FilterContentFieldsForUi(
            IReadOnlyList<WorkItemFieldConfig> fields)
        {
            if (fields is null || fields.Count == 0)
                return [];

            string[] contentReferences =
            [
                "System.Title",
                "System.Description",
                "Microsoft.VSTS.Common.AcceptanceCriteria"
            ];
            var fieldsByReference = new Dictionary<string, WorkItemFieldConfig>(StringComparer.OrdinalIgnoreCase);

            foreach (var field in fields)
            {
                var referenceName = field.ReferenceName?.Trim() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(referenceName) && !fieldsByReference.ContainsKey(referenceName))
                    fieldsByReference[referenceName] = field;
            }

            return contentReferences
                .Where(fieldsByReference.ContainsKey)
                .Select(referenceName => fieldsByReference[referenceName])
                .ToArray();
        }

        /// <summary>
        /// Une contenido y campos dinámicos ya hidratados sin duplicar referencias.
        /// La primera aparición prevalece para conservar metadata y orden estables.
        /// </summary>
        public static IReadOnlyList<WorkItemFieldConfig> MergeContentAndDynamicUiFields(
            IReadOnlyList<WorkItemFieldConfig> contentFields,
            IReadOnlyList<WorkItemFieldConfig> dynamicFields)
        {
            var merged = new List<WorkItemFieldConfig>();
            var seenReferences = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var field in (contentFields ?? []).Concat(dynamicFields ?? []))
            {
                var referenceName = field.ReferenceName?.Trim() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(referenceName) && seenReferences.Add(referenceName))
                    merged.Add(field);
            }

            return merged;
        }

        /// <inheritdoc />
        public async Task<IReadOnlyList<WorkItemFieldConfig>> PopulateUiFieldOptionsAsync(
            string project,
            string workItemType,
            IReadOnlyList<WorkItemFieldConfig> fields,
            CancellationToken cancellationToken = default)
        {
            if (fields is null || fields.Count == 0)
                return [];

            var fieldOptionCache = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
            var picklistCache = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
            var enriched = new List<WorkItemFieldConfig>(fields.Count);

            foreach (var field in fields)
            {
                var options = field.Options ?? [];
                if (options.Length == 0)
                {
                    options = await GetFieldAllowedValuesAsync(
                        project,
                        workItemType,
                        field.ReferenceName,
                        fieldOptionCache,
                        picklistCache,
                        cancellationToken);
                }

                enriched.Add(new WorkItemFieldConfig
                {
                    Name = field.Name,
                    ReferenceName = field.ReferenceName,
                    Label = field.Label,
                    Type = field.Type,
                    Required = field.Required,
                    Control = ResolveControl(field.Type, options.Length > 0, field.ReferenceName, field.Name, field.Label),
                    Options = options,
                    HasDefaultValue = field.HasDefaultValue,
                    IsReadOnly = field.IsReadOnly
                });
            }

            return enriched;
        }

        /// <inheritdoc />
        public async Task<int> CreateWorkItemAsync(CreateWorkItemPayload payload, WorkItemConfigResponse workItemConfig)
        {
            var patch = BuildWorkItemPatch(payload, workItemConfig, out var missingRequiredFields);
            if (missingRequiredFields.Count > 0)
                throw new WorkItemValidationException(missingRequiredFields);

            if (patch.Count == 0)
                throw new ArgumentException("No se encontraron campos validos para crear el Work Item.");

            var escapedWorkItemType = Uri.EscapeDataString(workItemConfig.WorkItemType);
            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/${escapedWorkItemType}?api-version={_api}";
            var res = await PatchWiAsync(url, patch, "CreateWorkItem");
            return res.GetProperty("id").GetInt32();
        }

        /// <inheritdoc />
        public async Task<AzdoWorkItemDetails> GetWorkItemDetailsAsync(
            int workItemId,
            CancellationToken cancellationToken = default)
        {
            if (workItemId <= 0)
                throw new ArgumentException("workItemId debe ser mayor a 0.", nameof(workItemId));

            if (string.IsNullOrWhiteSpace(_project))
                throw new ArgumentException("azdoProject es requerido para consultar el work item.");

            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/{workItemId}?$expand=Fields&api-version={_api}";
            using var resp = await _client.GetAsync(url, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
                throw new AzDoRequestException("GetWorkItemDetails", (int)resp.StatusCode, url, body);

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            var root = doc.RootElement;
            var fields = root.TryGetProperty("fields", out var fieldsElement) && fieldsElement.ValueKind == JsonValueKind.Object
                ? fieldsElement
                : default;

            var details = new AzdoWorkItemDetails
            {
                Id = root.TryGetProperty("id", out var idProperty) && idProperty.TryGetInt32(out var id) ? id : workItemId,
                Title = GetNormalizedFieldText(fields, "System.Title"),
                Description = GetNormalizedFieldText(fields, "System.Description"),
                AcceptanceCriteria = GetNormalizedFieldText(fields, "Microsoft.VSTS.Common.AcceptanceCriteria"),
                WorkItemType = GetNormalizedFieldText(fields, "System.WorkItemType"),
                State = GetNormalizedFieldText(fields, AzureDevOpsProtocol.StateReferenceName),
                AreaPath = GetNormalizedFieldText(fields, "System.AreaPath"),
                IterationPath = GetNormalizedFieldText(fields, "System.IterationPath"),
                Priority = GetNullableIntField(fields, "Microsoft.VSTS.Common.Priority"),
                StoryPoints = GetNullableDoubleField(fields, "Microsoft.VSTS.Scheduling.StoryPoints")
                    ?? GetNullableDoubleField(fields, "Microsoft.VSTS.Scheduling.Effort")
            };

            details.FunctionalFields = ExtractFunctionalFields(fields);
            return details;
        }

        /// <inheritdoc />
        public async Task<IReadOnlyList<WorkItemLookupItem>> SearchWorkItemsAsync(
            string project,
            string? areaPath,
            string? iterationPath,
            string? searchText,
            int top,
            CancellationToken cancellationToken = default)
        {
            var normalizedProject = project?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(normalizedProject))
                throw new ArgumentException("project es requerido.", nameof(project));

            var normalizedTop = NormalizeSearchTop(top);
            var requirementWorkItemType = await DetectRequirementWorkItemTypeAsync(normalizedProject);
            var wiql = BuildUserStoriesSearchWiql(
                normalizedProject,
                requirementWorkItemType,
                areaPath,
                iterationPath,
                searchText);
            var ids = await ExecuteWiqlAsync(wiql, normalizedTop, cancellationToken);
            if (ids.Count == 0)
                return [];

            var items = await GetWorkItemLookupItemsBatchAsync(ids, cancellationToken);
            var byId = items.ToDictionary(item => item.Id);
            return ids
                .Where(byId.ContainsKey)
                .Select(id => byId[id])
                .ToArray();
        }

        /// <inheritdoc />
        public async Task<CreatedTestCase> CreateTestCaseAsync(string iterationPath, string areaPath, TestCaseFields testCase)
        {
            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/$Test%20Case?api-version={_api}";
            if (testCase.Steps is not { Count: > 0 })
                throw new ArgumentException("El Test Case debe contener al menos un paso.");

            var stepsElement = new XElement(
                "steps",
                new XAttribute("id", "0"),
                new XAttribute("last", testCase.Steps.Count),
                testCase.Steps.Select((step, index) =>
                    new XElement(
                        "step",
                        new XAttribute("id", index + 1),
                        new XAttribute("type", "ActionStep"),
                        new XElement(
                            "parameterizedString",
                            new XAttribute("isformatted", "true"),
                            step.Action.Trim()),
                        new XElement(
                            "parameterizedString",
                            new XAttribute("isformatted", "true"),
                            step.Expected.Trim()),
                        new XElement("description"))));
            var steps = stepsElement.ToString(SaveOptions.DisableFormatting);

            var normalizedIterationPath = NormalizeHierarchyPath(iterationPath, "iteration");
            var normalizedAreaPath = NormalizeHierarchyPath(areaPath, "area");

            var patch = new List<Dictionary<string, object>>
            {
                Op("/fields/System.Title",             testCase.Title),
                Op("/fields/Microsoft.VSTS.TCM.Steps", steps),
                Op("/fields/System.IterationPath",     normalizedIterationPath),
            };
            if (!string.IsNullOrWhiteSpace(normalizedAreaPath))
                patch.Add(Op("/fields/System.AreaPath", normalizedAreaPath));
            var res = await PatchWiAsync(url, patch, "CreateTestCase");
            var initialState = res.TryGetProperty("fields", out var fields)
                && fields.TryGetProperty(AzureDevOpsProtocol.StateReferenceName, out var state)
                ? state.GetString()?.Trim() ?? string.Empty
                : string.Empty;
            return new CreatedTestCase(res.GetProperty("id").GetInt32(), initialState);
        }

        public async Task UpdateTestCaseStateAsync(int testCaseId, string state)
        {
            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/{testCaseId}?api-version={_api}";
            var patch = new List<Dictionary<string, object>>
            {
                Op($"/fields/{AzureDevOpsProtocol.StateReferenceName}", state.Trim())
            };
            await PatchWiAsync(url, patch, "UpdateTestCaseState");
        }

        /// <inheritdoc />
        public async Task<WorkItemDiscussionCommentsResponse> GetWorkItemDiscussionCommentsAsync(
            int workItemId,
            CancellationToken cancellationToken = default)
        {
            if (workItemId <= 0)
                throw new ArgumentException("workItemId debe ser mayor a 0.", nameof(workItemId));

            if (string.IsNullOrWhiteSpace(_project))
                throw new ArgumentException("azdoProject es requerido para consultar comentarios de discusión.");

            const string commentsApiVersion = "7.1-preview.4";
            var comments = new List<WorkItemDiscussionComment>();
            string? continuationToken = null;

            do
            {
                var tokenParam = !string.IsNullOrWhiteSpace(continuationToken)
                    ? $"&continuationToken={Uri.EscapeDataString(continuationToken)}"
                    : string.Empty;

                var url =
                    $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workItems/{workItemId}/comments?$top={_commentsTop}&includeDeleted=true{tokenParam}&api-version={commentsApiVersion}";

                using var resp = await _client.GetAsync(url, cancellationToken);
                var body = await resp.Content.ReadAsStringAsync(cancellationToken);
                if (!resp.IsSuccessStatusCode)
                    throw new AzDoRequestException("GetWorkItemDiscussionComments", (int)resp.StatusCode, url, body);

                using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
                if (doc.RootElement.TryGetProperty("comments", out var commentArray) &&
                    commentArray.ValueKind == JsonValueKind.Array)
                {
                    foreach (var commentElement in commentArray.EnumerateArray())
                    {
                        var commentId = GetIntProperty(commentElement, "commentId");
                        if (commentId == 0)
                            commentId = GetIntProperty(commentElement, "id");

                        comments.Add(new WorkItemDiscussionComment
                        {
                            CommentId = commentId,
                            Text = GetStringProperty(commentElement, "text"),
                            RenderedText = GetStringProperty(commentElement, "renderedText"),
                            CreatedBy = GetIdentityDisplayName(commentElement, "createdBy"),
                            CreatedDate = GetStringProperty(commentElement, "createdDate"),
                            ModifiedBy = GetIdentityDisplayName(commentElement, "modifiedBy"),
                            ModifiedDate = GetStringProperty(commentElement, "modifiedDate"),
                            IsDeleted = GetBooleanProperty(commentElement, "isDeleted"),
                            Url = GetStringProperty(commentElement, "url")
                        });
                    }
                }

                resp.Headers.TryGetValues("x-ms-continuationtoken", out var tokens);
                continuationToken = tokens?.FirstOrDefault();
            } while (!string.IsNullOrWhiteSpace(continuationToken));

            return new WorkItemDiscussionCommentsResponse
            {
                Project = _project,
                WorkItemId = workItemId,
                Count = comments.Count,
                Comments = comments
                    .OrderBy(comment => comment.CommentId)
                    .ToArray()
            };
        }

        /// <inheritdoc />
        public async Task<WorkItemsDiscussionCommentsResponse> GetWorkItemsDiscussionCommentsAsync(
            IEnumerable<int> workItemIds,
            CancellationToken cancellationToken = default)
        {
            if (workItemIds is null)
                throw new ArgumentException("workItemIds es requerido.", nameof(workItemIds));

            var normalizedIds = workItemIds
                .Where(id => id > 0)
                .Distinct()
                .ToArray();

            if (normalizedIds.Length == 0)
                throw new ArgumentException("Debe enviar al menos un workItemId mayor a 0.", nameof(workItemIds));

            var items = new List<WorkItemDiscussionCommentsResponse>(normalizedIds.Length);
            foreach (var workItemId in normalizedIds)
            {
                var comments = await GetWorkItemDiscussionCommentsAsync(workItemId, cancellationToken);
                items.Add(comments);
            }

            return new WorkItemsDiscussionCommentsResponse
            {
                Project = _project,
                RequestedCount = normalizedIds.Length,
                Items = items
            };
        }

        /// <inheritdoc />
        public async Task<IReadOnlyList<TestPlanSummary>> GetTestPlansAsync(CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(_project))
                throw new ArgumentException("azdoProject es requerido para consultar Test Plans.");

            var plans = new List<TestPlanSummary>();
            string? continuationToken = null;
            do
            {
                var tokenParam = continuationToken != null ? $"&continuationToken={Uri.EscapeDataString(continuationToken)}" : "";
                var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/testplan/plans?$top={_testPlansTop}{tokenParam}&api-version={_api}";
                using var resp = await _client.GetAsync(url, cancellationToken);
                var body = await resp.Content.ReadAsStringAsync(cancellationToken);
                if (!resp.IsSuccessStatusCode)
                    throw new AzDoRequestException("GetTestPlans", (int)resp.StatusCode, url, body);

                using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
                if (doc.RootElement.TryGetProperty("value", out var value) && value.ValueKind == JsonValueKind.Array)
                {
                    foreach (var plan in value.EnumerateArray())
                    {
                        var id = GetIntProperty(plan, "id");
                        var name = GetStringProperty(plan, "name").Trim();
                        if (id > 0 && !string.IsNullOrWhiteSpace(name))
                        {
                            plans.Add(new TestPlanSummary
                            {
                                Id = id,
                                Name = name
                            });
                        }
                    }
                }

                resp.Headers.TryGetValues("x-ms-continuationtoken", out var tokens);
                continuationToken = tokens?.FirstOrDefault();
            } while (continuationToken != null);

            return plans
                .GroupBy(plan => plan.Id)
                .Select(group => group.First())
                .OrderBy(plan => plan.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(plan => plan.Id)
                .ToArray();
        }

        /// <inheritdoc />
        public async Task<TestPlanContext> GetTestPlanContextAsync(int planId)
        {
            if (planId <= 0)
                throw new ArgumentException("testSuite.planId debe ser mayor a 0.");

            var planUrl = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/testplan/plans/{planId}?api-version={_api}";
            using var planResp = await _client.GetAsync(planUrl);
            var planBody = await planResp.Content.ReadAsStringAsync();
            if (!planResp.IsSuccessStatusCode)
                throw new AzDoRequestException("GetTestPlan", (int)planResp.StatusCode, planUrl, planBody);
            using var planDoc = JsonDocument.Parse(planBody, _jsonDocumentOptions);
            var root = planDoc.RootElement;
            var rootSuiteId = root.GetProperty("rootSuite").GetProperty("id").GetInt32();
            var planName = GetStringProperty(root, "name").Trim();
            return new TestPlanContext(planId, planName, rootSuiteId);
        }

        public async Task<IReadOnlyList<TestSuiteSummary>> GetDirectChildSuitesAsync(int planId, int rootSuiteId)
        {
            var suites = new List<TestSuiteSummary>();
            string? continuationToken = null;
            do
            {
                var token = string.IsNullOrWhiteSpace(continuationToken)
                    ? string.Empty
                    : $"&continuationToken={Uri.EscapeDataString(continuationToken)}";
                var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/testplan/plans/{planId}/suites?asTreeView=false{token}&api-version={_api}";
                using var response = await _client.GetAsync(url);
                var body = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode)
                    throw new AzDoRequestException("GetTestSuites", (int)response.StatusCode, url, body);

                using var document = JsonDocument.Parse(body, _jsonDocumentOptions);
                var values = document.RootElement.ValueKind == JsonValueKind.Array
                    ? document.RootElement
                    : document.RootElement.GetProperty("value");
                foreach (var suite in values.EnumerateArray())
                {
                    var parentId = suite.TryGetProperty("parentSuite", out var parent)
                        ? GetIntProperty(parent, "id")
                        : 0;
                    if (parentId == rootSuiteId)
                    {
                        suites.Add(new TestSuiteSummary(
                            GetIntProperty(suite, "id"),
                            GetStringProperty(suite, "name"),
                            parentId,
                            GetStringProperty(suite, "suiteType")));
                    }
                }

                response.Headers.TryGetValues("x-ms-continuationtoken", out var tokens);
                continuationToken = tokens?.FirstOrDefault();
            } while (!string.IsNullOrWhiteSpace(continuationToken));

            return suites;
        }

        public Task<CreatedTestSuite> CreateRequirementSuiteAsync(
            int planId,
            int parentSuiteId,
            int requirementId)
        {
            if (requirementId <= 0)
                throw new ArgumentException("requirementId debe ser mayor a 0.", nameof(requirementId));

            var request = new Dictionary<string, object>
            {
                ["suiteType"] = AzureDevOpsProtocol.RequirementTestSuiteType,
                ["parentSuite"] = new { id = parentSuiteId },
                ["requirementId"] = requirementId
            };

            return CreateTestSuiteAsync(
                planId,
                request,
                fallbackName: string.Empty,
                fallbackSuiteType: AzureDevOpsProtocol.RequirementTestSuiteType,
                detectNameConflict: false);
        }

        public Task<CreatedTestSuite> CreateStaticSuiteAsync(
            int planId,
            int parentSuiteId,
            string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentException("El nombre de la static suite es requerido.", nameof(name));

            var normalizedName = name.Trim();
            var request = new Dictionary<string, object>
            {
                ["suiteType"] = AzureDevOpsProtocol.StaticTestSuiteType,
                ["name"] = normalizedName,
                ["parentSuite"] = new { id = parentSuiteId }
            };

            return CreateTestSuiteAsync(
                planId,
                request,
                normalizedName,
                AzureDevOpsProtocol.StaticTestSuiteType,
                detectNameConflict: true);
        }

        private async Task<CreatedTestSuite> CreateTestSuiteAsync(
            int planId,
            IReadOnlyDictionary<string, object> request,
            string fallbackName,
            string fallbackSuiteType,
            bool detectNameConflict)
        {

            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/testplan/plans/{planId}/suites?api-version={_api}";
            var body = JsonSerializer.Serialize(request, _jsonOptions);
            using var content = new StringContent(body, Encoding.UTF8, "application/json");
            using var resp = await _client.PostAsync(url, content);
            var responseBody = await resp.Content.ReadAsStringAsync();
            if (detectNameConflict
                && ((int)resp.StatusCode == 409
                    || ((int)resp.StatusCode == 400
                        && AzureDevOpsErrorMessageSanitizer.IndicatesNameConflict(
                            responseBody,
                            _maxExternalErrorDetailLength,
                            _jsonOptions.MaxDepth))))
                throw new TestSuiteNameConflictException();
            if (!resp.IsSuccessStatusCode)
                throw new AzDoRequestException("CreateTestSuite", (int)resp.StatusCode, url, responseBody);
            using var doc = JsonDocument.Parse(responseBody, _jsonDocumentOptions);
            var root = doc.RootElement.ValueKind == JsonValueKind.Array ? doc.RootElement[0] : doc.RootElement;
            return new CreatedTestSuite(
                root.GetProperty("id").GetInt32(),
                string.IsNullOrWhiteSpace(GetStringProperty(root, "name"))
                    ? fallbackName
                    : GetStringProperty(root, "name"),
                string.IsNullOrWhiteSpace(GetStringProperty(root, "suiteType"))
                    ? fallbackSuiteType
                    : GetStringProperty(root, "suiteType"));
        }

        public async Task LinkTestedByAsync(int workItemId, int testCaseId)
        {
            if (workItemId <= 0)
                throw new ArgumentException("workItemId debe ser mayor a 0.", nameof(workItemId));
            if (testCaseId <= 0)
                throw new ArgumentException("testCaseId debe ser mayor a 0.", nameof(testCaseId));

            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/{workItemId}?api-version={_api}";
            var testCaseUrl = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitems/{testCaseId}";
            var patch = new List<Dictionary<string, object>>
            {
                Op("/relations/-", new Dictionary<string, object>
                {
                    ["rel"] = AzureDevOpsProtocol.TestedByForwardRelation,
                    ["url"] = testCaseUrl,
                    ["attributes"] = new Dictionary<string, object>
                    {
                        ["comment"] = "Vinculado autom\u00e1ticamente"
                    }
                })
            };

            await PatchWiAsync(url, patch, "LinkTestedBy");
        }

        public async Task AddTestCaseToSuiteAsync(int planId, int suiteId, int testCaseId)
        {
            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/testplan/plans/{planId}/suites/{suiteId}/testcase?api-version={_api}";
            var body = JsonSerializer.Serialize(new[] { new { workItem = new { id = testCaseId } } }, _jsonOptions);
            using var content = new StringContent(body, Encoding.UTF8, "application/json");
            using var response = await _client.PostAsync(url, content);
            var responseBody = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
                throw new AzDoRequestException("AddTestCaseToSuite", (int)response.StatusCode, url, responseBody);
        }

        private async Task<string> DetectRequirementWorkItemTypeAsync(string project)
        {
            var typeFromProcessConfiguration = await TryGetTypeFromProcessConfigurationAsync(project);
            if (!string.IsNullOrWhiteSpace(typeFromProcessConfiguration))
                return typeFromProcessConfiguration;

            var typeFromCategory = await TryGetTypeFromRequirementCategoryAsync(project);
            if (!string.IsNullOrWhiteSpace(typeFromCategory))
                return typeFromCategory;

            return await GetFallbackRequirementTypeAsync(project);
        }

        private async Task<string> TryGetTypeFromProcessConfigurationAsync(string project)
        {
            var escapedProject = EncodeUrlPathSegment(project);
            var url = $"https://dev.azure.com/{_escapedOrg}/{escapedProject}/_apis/work/processconfiguration?api-version={_api}";
            using var resp = await _client.GetAsync(url);
            var body = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                var statusCode = (int)resp.StatusCode;
                if (statusCode == 404)
                    return string.Empty;

                throw new AzDoRequestException("GetProcessConfiguration", statusCode, url, body);
            }

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            if (!doc.RootElement.TryGetProperty("requirementBacklog", out var requirementBacklog) ||
                requirementBacklog.ValueKind != JsonValueKind.Object)
            {
                return string.Empty;
            }

            if (requirementBacklog.TryGetProperty("workItemTypes", out var workItemTypes) &&
                workItemTypes.ValueKind == JsonValueKind.Array)
            {
                foreach (var workItemType in workItemTypes.EnumerateArray())
                {
                    var name = ExtractName(workItemType);
                    if (!string.IsNullOrWhiteSpace(name))
                        return name;
                }
            }

            return string.Empty;
        }

        private async Task<string> TryGetTypeFromRequirementCategoryAsync(string project)
        {
            var escapedProject = EncodeUrlPathSegment(project);
            var url = $"https://dev.azure.com/{_escapedOrg}/{escapedProject}/_apis/wit/workitemtypecategories/$RequirementCategory?api-version={_api}";
            using var resp = await _client.GetAsync(url);
            var body = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                var statusCode = (int)resp.StatusCode;
                if (statusCode == 404)
                    return string.Empty;

                throw new AzDoRequestException("GetRequirementCategory", statusCode, url, body);
            }

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            if (doc.RootElement.TryGetProperty("defaultWorkItemType", out var defaultWorkItemType))
            {
                var name = ExtractName(defaultWorkItemType);
                if (!string.IsNullOrWhiteSpace(name))
                    return name;
            }

            if (doc.RootElement.TryGetProperty("workItemTypes", out var workItemTypes) &&
                workItemTypes.ValueKind == JsonValueKind.Array)
            {
                foreach (var workItemType in workItemTypes.EnumerateArray())
                {
                    var name = ExtractName(workItemType);
                    if (!string.IsNullOrWhiteSpace(name))
                        return name;
                }
            }

            return string.Empty;
        }

        private async Task<string> GetFallbackRequirementTypeAsync(string project)
        {
            var escapedProject = EncodeUrlPathSegment(project);
            var url = $"https://dev.azure.com/{_escapedOrg}/{escapedProject}/_apis/wit/workitemtypes?api-version={_api}";
            using var resp = await _client.GetAsync(url);
            var body = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode)
                throw new AzDoRequestException("GetWorkItemTypes", (int)resp.StatusCode, url, body);

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            if (!doc.RootElement.TryGetProperty("value", out var value) || value.ValueKind != JsonValueKind.Array)
                throw new AzDoRequestException("GetWorkItemTypes", (int)resp.StatusCode, url, body);

            var typeNames = value
                .EnumerateArray()
                .Select(ExtractName)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .ToList();

            string[] preferredTypeNames = ["User Story", "Product Backlog Item", "Requirement"];
            foreach (var preferredTypeName in preferredTypeNames)
            {
                var match = typeNames.FirstOrDefault(name =>
                    string.Equals(name, preferredTypeName, StringComparison.OrdinalIgnoreCase));

                if (!string.IsNullOrWhiteSpace(match))
                    return match;
            }

            var first = typeNames.FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(first))
                return first;

            throw new AzDoRequestException("GetWorkItemTypes", (int)resp.StatusCode, url, body);
        }

        private async Task<IReadOnlyList<WorkItemFieldConfig>> GetWorkItemTypeFieldsAsync(string project, string workItemType)
        {
            var escapedWorkItemType = Uri.EscapeDataString(workItemType);
            var escapedProject = EncodeUrlPathSegment(project);
            var url = $"https://dev.azure.com/{_escapedOrg}/{escapedProject}/_apis/wit/workitemtypes/{escapedWorkItemType}/fields?api-version={_api}";
            using var resp = await _client.GetAsync(url);
            var body = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode)
                throw new AzDoRequestException("GetWorkItemTypeFields", (int)resp.StatusCode, url, body);

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            var fieldElements = GetFieldArray(doc.RootElement);
            var fields = new List<WorkItemFieldConfig>();
            var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var fieldElement in fieldElements)
            {
                var referenceName = GetStringProperty(fieldElement, "referenceName");
                if (string.IsNullOrWhiteSpace(referenceName))
                    continue;

                var label = GetStringProperty(fieldElement, "name");
                if (string.IsNullOrWhiteSpace(label))
                    label = referenceName;

                var isReadOnly = GetBooleanProperty(fieldElement, "readOnly")
                    || GetBooleanProperty(fieldElement, "isReadOnly")
                    || GetBooleanProperty(fieldElement, "isComputed");

                var options = GetAllowedValues(fieldElement).ToArray();
                var isPicklist = GetBooleanProperty(fieldElement, "isPicklist")
                    || GetBooleanProperty(fieldElement, "isPicklistSuggested")
                    || options.Length > 0;

                var rawType = GetStringProperty(fieldElement, "type");
                var normalizedType = NormalizeFieldType(rawType, isPicklist);
                var alias = EnsureUniqueFieldName(
                    BuildFieldAlias(referenceName, label),
                    usedNames);

                fields.Add(new WorkItemFieldConfig
                {
                    Name = alias,
                    ReferenceName = referenceName,
                    Label = label,
                    Type = normalizedType,
                    Required = GetBooleanProperty(fieldElement, "alwaysRequired")
                        || GetBooleanProperty(fieldElement, "isRequired")
                        || GetBooleanProperty(fieldElement, "required"),
                    Control = ResolveControl(normalizedType, options.Length > 0, referenceName, alias, label),
                    Options = options,
                    HasDefaultValue = HasDefaultValue(fieldElement),
                    IsReadOnly = isReadOnly
                });
            }

            return fields
                .Where(field => IsFieldRelevantForCreate(field.ReferenceName))
                .OrderByDescending(field => field.Required)
                .ThenBy(field => field.Label, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        private static List<Dictionary<string, object>> BuildWorkItemPatch(
            CreateWorkItemPayload payload,
            WorkItemConfigResponse workItemConfig,
            out List<string> missingRequiredFields)
        {
            var valuesByField = payload.Hu?.ToValueMap() ??
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            valuesByField["System.IterationPath"] = NormalizeHierarchyPath(payload.IterationPath, "iteration");
            valuesByField["System.AreaPath"] = NormalizeHierarchyPath(payload.AreaPath, "area");

            var patch = new List<Dictionary<string, object>>();
            var providedFieldReferences = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var pair in valuesByField)
            {
                var hasConfiguredField = TryResolveWorkItemField(pair.Key, workItemConfig.Fields, out var field);
                if (hasConfiguredField && field.IsReadOnly)
                    continue;

                var referenceName = hasConfiguredField ? field.ReferenceName : pair.Key.Trim();
                if (!TryConvertFieldValue(pair.Value, referenceName, hasConfiguredField ? field : null, out var convertedValue))
                    continue;

                patch.Add(Op(ToJsonPatchFieldPath(referenceName), convertedValue));
                providedFieldReferences.Add(referenceName);
            }

            missingRequiredFields = workItemConfig.Fields
                .Where(field => field.Required)
                .Where(field => !field.IsReadOnly)
                .Where(field => !field.HasDefaultValue)
                .Where(field => ShouldValidateRequiredField(field.ReferenceName))
                .Where(field => !providedFieldReferences.Contains(field.ReferenceName))
                .Select(field => string.IsNullOrWhiteSpace(field.Name) ? field.ReferenceName : field.Name)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            return patch;
        }

        private static bool TryResolveWorkItemField(
            string incomingName,
            IReadOnlyList<WorkItemFieldConfig> fields,
            out WorkItemFieldConfig field)
        {
            field = new WorkItemFieldConfig();
            if (string.IsNullOrWhiteSpace(incomingName))
                return false;

            var normalizedIncomingName = NormalizeLookupKey(incomingName);
            foreach (var candidate in fields)
            {
                if (incomingName.Equals(candidate.ReferenceName, StringComparison.OrdinalIgnoreCase)
                    || normalizedIncomingName == NormalizeLookupKey(candidate.ReferenceName))
                {
                    field = candidate;
                    return true;
                }
            }

            return false;
        }

        private static bool TryConvertFieldValue(
            object? rawValue,
            string referenceName,
            WorkItemFieldConfig? field,
            out object convertedValue)
        {
            convertedValue = string.Empty;
            if (rawValue is null)
                return false;

            if (rawValue is string stringValue)
            {
                if (referenceName.Equals("System.IterationPath", StringComparison.OrdinalIgnoreCase))
                    stringValue = NormalizeHierarchyPath(stringValue, "iteration");
                else if (referenceName.Equals("System.AreaPath", StringComparison.OrdinalIgnoreCase))
                    stringValue = NormalizeHierarchyPath(stringValue, "area");

                if (string.IsNullOrWhiteSpace(stringValue))
                    return false;

                rawValue = stringValue.Trim();
            }

            if (field?.Options.Length > 0)
            {
                var selectedOption = Convert.ToString(rawValue, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(selectedOption))
                    return false;

                var matchingOption = field.Options.FirstOrDefault(option =>
                    option.Equals(selectedOption, StringComparison.OrdinalIgnoreCase));
                convertedValue = matchingOption ?? selectedOption;
                return true;
            }

            var normalizedType = field?.Type.Trim().ToLowerInvariant() ?? InferFieldType(referenceName);
            switch (normalizedType)
            {
                case "integer":
                    {
                        if (TryConvertToLong(rawValue, out var intValue))
                        {
                            if (RequiresNonNegativeValue(referenceName) && intValue < 0)
                                return false;

                            convertedValue = intValue;
                            return true;
                        }

                        return false;
                    }
                case "number":
                    {
                        if (TryConvertToDouble(rawValue, out var doubleValue))
                        {
                            if (RequiresNonNegativeValue(referenceName) && doubleValue < 0)
                                return false;

                            convertedValue = doubleValue;
                            return true;
                        }

                        return false;
                    }
                case "boolean":
                    {
                        if (TryConvertToBool(rawValue, out var boolValue))
                        {
                            convertedValue = boolValue;
                            return true;
                        }

                        return false;
                    }
                case "datetime":
                    {
                        if (TryNormalizeDateTimeValue(rawValue, referenceName, out var dateTimeValue))
                        {
                            convertedValue = dateTimeValue;
                            return true;
                        }

                        return false;
                    }
                case "date":
                    {
                        if (TryNormalizeDateTimeValue(rawValue, referenceName, out var dateValue))
                        {
                            convertedValue = dateValue;
                            return true;
                        }

                        return false;
                    }
                default:
                    {
                        var valueAsText = Convert.ToString(rawValue, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
                        if (string.IsNullOrWhiteSpace(valueAsText))
                            return false;

                        convertedValue = valueAsText;
                        return true;
                    }
            }
        }

        private static bool TryConvertToLong(object rawValue, out long converted)
        {
            if (rawValue is long longValue)
            {
                converted = longValue;
                return true;
            }

            if (rawValue is int intValue)
            {
                converted = intValue;
                return true;
            }

            return long.TryParse(Convert.ToString(rawValue, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out converted);
        }

        private static bool TryConvertToDouble(object rawValue, out double converted)
        {
            if (rawValue is double doubleValue)
            {
                converted = doubleValue;
                return true;
            }

            if (rawValue is float floatValue)
            {
                converted = floatValue;
                return true;
            }

            if (rawValue is decimal decimalValue)
            {
                converted = (double)decimalValue;
                return true;
            }

            return double.TryParse(Convert.ToString(rawValue, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out converted);
        }

        private static bool TryConvertToBool(object rawValue, out bool converted)
        {
            if (rawValue is bool boolValue)
            {
                converted = boolValue;
                return true;
            }

            return bool.TryParse(Convert.ToString(rawValue, CultureInfo.InvariantCulture), out converted);
        }

        private static string InferFieldType(string referenceName)
        {
            return IsDateTimeField(referenceName) ? "datetime" : "string";
        }

        private static bool TryNormalizeDateTimeValue(object rawValue, string referenceName, out string converted)
        {
            converted = string.Empty;

            if (rawValue is DateTimeOffset dateTimeOffset)
            {
                converted = dateTimeOffset.ToString("O", CultureInfo.InvariantCulture);
                return true;
            }

            if (rawValue is DateTime dateTime)
            {
                if (dateTime.Kind == DateTimeKind.Unspecified)
                    throw new ArgumentException($"El campo {referenceName} requiere offset explicito o UTC.");

                converted = new DateTimeOffset(dateTime).ToString("O", CultureInfo.InvariantCulture);
                return true;
            }

            var value = Convert.ToString(rawValue, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(value))
                return false;

            if (Regex.IsMatch(value, @"^\d{4}-\d{2}-\d{2}$", RegexOptions.CultureInvariant))
            {
                throw new ArgumentException(
                    $"El campo {referenceName} recibio una fecha sin hora ni zona horaria. Envia ISO 8601 con offset explicito o UTC.");
            }

            if (!HasExplicitOffsetOrUtc(value))
            {
                throw new ArgumentException(
                    $"El campo {referenceName} requiere offset explicito o UTC para evitar desplazamientos horarios.");
            }

            if (!DateTimeOffset.TryParse(
                    value,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out _))
            {
                throw new ArgumentException($"El campo {referenceName} no tiene una fecha ISO 8601 valida.");
            }

            converted = value;
            return true;
        }

        private static bool TryConvertToDateTime(object rawValue, out DateTimeOffset converted)
        {
            if (rawValue is DateTimeOffset dto)
            {
                converted = dto;
                return true;
            }

            if (rawValue is DateTime dt)
            {
                converted = new DateTimeOffset(dt);
                return true;
            }

            return DateTimeOffset.TryParse(
                Convert.ToString(rawValue, CultureInfo.InvariantCulture),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeLocal,
                out converted);
        }

        private static bool IsDateTimeField(string referenceName)
        {
            return referenceName.EndsWith("Date", StringComparison.OrdinalIgnoreCase)
                || referenceName.EndsWith("DateTime", StringComparison.OrdinalIgnoreCase);
        }

        private static bool HasExplicitOffsetOrUtc(string value)
        {
            return value.EndsWith("Z", StringComparison.OrdinalIgnoreCase)
                || Regex.IsMatch(value, @"[+-]\d{2}:\d{2}$", RegexOptions.CultureInvariant);
        }

        private static bool ShouldValidateRequiredField(string referenceName)
        {
            return !referenceName.Equals(AzureDevOpsProtocol.StateReferenceName, StringComparison.OrdinalIgnoreCase)
                && !referenceName.Equals("System.Reason", StringComparison.OrdinalIgnoreCase)
                && !referenceName.Equals("System.WorkItemType", StringComparison.OrdinalIgnoreCase)
                && !referenceName.Equals("System.TeamProject", StringComparison.OrdinalIgnoreCase);
        }

        private static bool RequiresNonNegativeValue(string referenceName)
        {
            return referenceName.Equals("Microsoft.VSTS.Scheduling.StoryPoints", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Normaliza rutas de area/iteracion removiendo segmentos tecnicos como <c>areas</c> o <c>iterations</c>.
        /// </summary>
        public static string NormalizeHierarchyPath(string? path, string kind)
        {
            if (string.IsNullOrWhiteSpace(path))
                return string.Empty;

            var normalized = path.Trim().Replace('/', '\\');
            while (normalized.Contains("\\\\", StringComparison.Ordinal))
                normalized = normalized.Replace("\\\\", "\\", StringComparison.Ordinal);

            normalized = normalized.Trim('\\');
            if (string.IsNullOrWhiteSpace(normalized))
                return string.Empty;

            var segments = normalized
                .Split('\\', StringSplitOptions.RemoveEmptyEntries)
                .Select(segment => segment.Trim())
                .Where(segment => !string.IsNullOrWhiteSpace(segment))
                .ToList();

            if (segments.Count == 0)
                return string.Empty;

            string[] technicalRoots = kind.Equals("iteration", StringComparison.OrdinalIgnoreCase)
                ? ["iteration", "iterations"]
                : ["area", "areas"];

            if (segments.Count > 1 && technicalRoots.Contains(segments[0], StringComparer.OrdinalIgnoreCase))
                segments.RemoveAt(0);

            if (segments.Count > 2 && technicalRoots.Contains(segments[1], StringComparer.OrdinalIgnoreCase))
                segments.RemoveAt(1);

            return string.Join("\\", segments);
        }

        private static string NormalizeFieldType(string rawType, bool isPicklist)
        {
            if (isPicklist)
                return "picklist";

            var normalized = (rawType ?? string.Empty).Trim().ToLowerInvariant();
            return normalized switch
            {
                "integer" => "integer",
                "int" => "integer",
                "double" => "number",
                "float" => "number",
                "decimal" => "number",
                "boolean" => "boolean",
                "bool" => "boolean",
                "datetime" => "datetime",
                "date" => "date",
                "html" => "html",
                "plaintext" => "plaintext",
                "string" => "string",
                _ => string.IsNullOrWhiteSpace(normalized) ? "string" : normalized
            };
        }

        private static string ResolveControl(
            string normalizedType,
            bool hasOptions,
            string referenceName,
            string alias,
            string label)
        {
            if (hasOptions || normalizedType.Equals("picklist", StringComparison.OrdinalIgnoreCase))
                return "select";

            if (IsDateLikeField(referenceName, alias, label)
                && (normalizedType.Equals("date", StringComparison.OrdinalIgnoreCase)
                    || normalizedType.Equals("datetime", StringComparison.OrdinalIgnoreCase)
                    || normalizedType.Equals("string", StringComparison.OrdinalIgnoreCase)))
            {
                return "datetime";
            }

            return normalizedType switch
            {
                "datetime" => "datetime",
                "date" => "date",
                "boolean" => "checkbox",
                "html" => "textarea",
                "plaintext" => "textarea",
                _ => "input"
            };
        }

        private static bool IsDateLikeField(string referenceName, string alias, string label)
        {
            return referenceName.Contains("Date", StringComparison.OrdinalIgnoreCase)
                || alias.Contains("Date", StringComparison.OrdinalIgnoreCase)
                || label.Contains("Date", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsPlanningOrClassificationUiField(WorkItemFieldConfig field)
        {
            var referenceName = field.ReferenceName?.Trim() ?? string.Empty;
            var normalizedName = NormalizeLookupKey(field.Name);
            var normalizedReferenceName = NormalizeLookupKey(referenceName);
            var normalizedLabel = NormalizeLookupKey(field.Label);

            if (referenceName.StartsWith("Custom.", StringComparison.OrdinalIgnoreCase)
                && (field.Type.Equals("picklist", StringComparison.OrdinalIgnoreCase)
                    || field.Control.Equals("select", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            if (referenceName.Equals("Microsoft.VSTS.Common.Priority", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Common.BacklogPriority", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Common.Risk", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Common.Severity", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Common.ValueArea", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Common.BusinessValue", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (referenceName.Equals("System.AssignedTo", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (referenceName.Equals("System.IterationPath", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("System.AreaPath", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (referenceName.StartsWith("Microsoft.VSTS.Scheduling.", StringComparison.OrdinalIgnoreCase))
                return true;

            if (normalizedName is "priority" or "backlogpriority" or "risk" or "severity" or "valuearea" or "businessvalue")
                return true;

            if (normalizedLabel is "priority" or "backlogpriority" or "risk" or "severity" or "valuearea" or "businessvalue")
                return true;

            return normalizedName is "startdate" or "finishdate" or "tipohu" or "frentedetrabajo"
                || normalizedReferenceName is "customtipohu" or "customfrentedetrabajo"
                || normalizedLabel is "tipohu" or "frentedetrabajo";
        }

        private static bool IsFieldRelevantForCreate(string referenceName)
        {
            string[] excluded =
            [
                "System.Id",
                "System.Rev",
                "System.TeamProject",
                "System.NodeName",
                "System.AreaId",
                "System.IterationId",
                "System.AuthorizedDate",
                "System.RevisedDate",
                "System.ChangedDate",
                "System.CreatedDate",
                "System.Watermark",
                "System.History",
                "System.ExternalLinkCount",
                "System.HyperLinkCount",
                "System.AttachedFileCount",
                "System.CommentCount",
                "System.RelatedLinkCount",
                "System.RemoteLinkCount"
            ];

            return !excluded.Contains(referenceName, StringComparer.OrdinalIgnoreCase);
        }

        private static bool HasDefaultValue(JsonElement fieldElement)
        {
            if (!fieldElement.TryGetProperty("defaultValue", out var defaultValue))
                return false;

            return defaultValue.ValueKind != JsonValueKind.Null
                && defaultValue.ValueKind != JsonValueKind.Undefined;
        }

        private static IReadOnlyList<JsonElement> GetFieldArray(JsonElement root)
        {
            if (root.TryGetProperty("value", out var valueElement) && valueElement.ValueKind == JsonValueKind.Array)
                return valueElement.EnumerateArray().ToArray();

            if (root.TryGetProperty("fields", out var fieldsElement) && fieldsElement.ValueKind == JsonValueKind.Array)
                return fieldsElement.EnumerateArray().ToArray();

            return [];
        }

        private static IEnumerable<string> GetAllowedValues(JsonElement fieldElement)
        {
            if (!fieldElement.TryGetProperty("allowedValues", out var allowedValuesElement)
                || allowedValuesElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var values = new List<string>();
            foreach (var option in allowedValuesElement.EnumerateArray())
            {
                var optionValue = ExtractAllowedValue(option);
                if (!string.IsNullOrWhiteSpace(optionValue))
                    values.Add(optionValue.Trim());
            }

            return values
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase);
        }

        private async Task<string[]> GetFieldAllowedValuesAsync(
            string project,
            string workItemType,
            string referenceName,
            IDictionary<string, string[]> fieldOptionCache,
            IDictionary<string, string[]> picklistCache,
            CancellationToken cancellationToken)
        {
            var cacheKey = $"{project}::{workItemType}::{referenceName}";
            if (fieldOptionCache.TryGetValue(cacheKey, out var cachedValues))
                return cachedValues;

            if (string.IsNullOrWhiteSpace(referenceName))
            {
                fieldOptionCache[cacheKey] = [];
                return [];
            }

            try
            {
                var escapedWorkItemType = Uri.EscapeDataString(workItemType);
                var escapedReferenceName = Uri.EscapeDataString(referenceName);
                var escapedProject = EncodeUrlPathSegment(project);
                var url = $"https://dev.azure.com/{_escapedOrg}/{escapedProject}/_apis/wit/workitemtypes/{escapedWorkItemType}/fields/{escapedReferenceName}?api-version={_api}&$expand=allowedValues";
                using var resp = await _client.GetAsync(url, cancellationToken);
                var body = await resp.Content.ReadAsStringAsync(cancellationToken);

                if (!resp.IsSuccessStatusCode)
                {
                    fieldOptionCache[cacheKey] = [];
                    return [];
                }

                using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
                var values = GetAllowedValues(doc.RootElement).ToArray();
                if (values.Length == 0)
                    values = GetInlinePicklistValues(doc.RootElement).ToArray();

                var picklistId = GetPicklistId(doc.RootElement);

                if (values.Length == 0 || string.IsNullOrWhiteSpace(picklistId))
                {
                    var globalFieldMetadata = await GetGlobalFieldMetadataAsync(referenceName, cancellationToken);
                    if (values.Length == 0)
                        values = globalFieldMetadata.AllowedValues;

                    if (string.IsNullOrWhiteSpace(picklistId))
                        picklistId = globalFieldMetadata.PicklistId;
                }

                if (values.Length == 0)
                {
                    values = await GetPicklistValuesAsync(picklistId, picklistCache, cancellationToken);
                }

                if (values.Length == 0)
                {
                    _logger?.LogInformation(
                        "No se encontraron opciones para campo de work item. Project: {Project}. WorkItemType: {WorkItemType}. ReferenceName: {ReferenceName}",
                        project,
                        workItemType,
                        referenceName);
                }

                fieldOptionCache[cacheKey] = values;
                return values;
            }
            catch (TaskCanceledException)
            {
                _logger?.LogWarning(
                    "Timeout consultando opciones de campo. Project: {Project}. WorkItemType: {WorkItemType}. ReferenceName: {ReferenceName}",
                    project,
                    workItemType,
                    referenceName);

                fieldOptionCache[cacheKey] = [];
                return [];
            }
            catch
            {
                _logger?.LogWarning(
                    "Error consultando opciones de campo. Project: {Project}. WorkItemType: {WorkItemType}. ReferenceName: {ReferenceName}",
                    project,
                    workItemType,
                    referenceName);

                fieldOptionCache[cacheKey] = [];
                return [];
            }
        }

        private async Task<string[]> GetPicklistValuesAsync(
            string picklistId,
            IDictionary<string, string[]> picklistCache,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(picklistId))
                return [];

            if (picklistCache.TryGetValue(picklistId, out var cachedValues))
                return cachedValues;

            try
            {
                var escapedPicklistId = Uri.EscapeDataString(picklistId.Trim());
                var url = $"https://dev.azure.com/{_escapedOrg}/_apis/wit/picklists/{escapedPicklistId}?api-version={_api}";
                using var resp = await _client.GetAsync(url, cancellationToken);
                var body = await resp.Content.ReadAsStringAsync(cancellationToken);

                if (!resp.IsSuccessStatusCode)
                {
                    const string previewApiVersion = "7.1-preview.1";
                    var previewUrl = $"https://dev.azure.com/{_escapedOrg}/_apis/wit/picklists/{escapedPicklistId}?api-version={previewApiVersion}";
                    using var previewResp = await _client.GetAsync(previewUrl, cancellationToken);
                    var previewBody = await previewResp.Content.ReadAsStringAsync(cancellationToken);
                    if (!previewResp.IsSuccessStatusCode)
                    {
                        _logger?.LogWarning(
                            "No fue posible consultar picklist. PicklistId: {PicklistId}. Status: {StatusCode}.",
                            picklistId,
                            (int)previewResp.StatusCode);
                        picklistCache[picklistId] = [];
                        return [];
                    }

                    using var previewDoc = JsonDocument.Parse(previewBody, _jsonDocumentOptions);
                    var previewValues = ParsePicklistItems(previewDoc.RootElement);
                    picklistCache[picklistId] = previewValues;
                    return previewValues;
                }

                using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
                var result = ParsePicklistItems(doc.RootElement);
                picklistCache[picklistId] = result;
                return result;
            }
            catch (TaskCanceledException)
            {
                _logger?.LogWarning(
                    "Timeout consultando picklist. PicklistId: {PicklistId}.",
                    picklistId);
                picklistCache[picklistId] = [];
                return [];
            }
            catch
            {
                _logger?.LogWarning(
                    "Error consultando picklist. PicklistId: {PicklistId}.",
                    picklistId);
                picklistCache[picklistId] = [];
                return [];
            }
        }

        private static string ExtractAllowedValue(JsonElement option)
        {
            if (option.ValueKind == JsonValueKind.String)
                return option.GetString()?.Trim() ?? string.Empty;

            if (option.ValueKind == JsonValueKind.Number
                || option.ValueKind == JsonValueKind.True
                || option.ValueKind == JsonValueKind.False)
            {
                return option.ToString();
            }

            if (option.ValueKind != JsonValueKind.Object)
                return string.Empty;

            var optionValue = GetStringProperty(option, "name");
            if (string.IsNullOrWhiteSpace(optionValue))
                optionValue = GetStringProperty(option, "value");

            if (string.IsNullOrWhiteSpace(optionValue))
                optionValue = GetStringProperty(option, "displayName");

            if (string.IsNullOrWhiteSpace(optionValue))
                optionValue = GetStringProperty(option, "id");

            return optionValue.Trim();
        }

        private static string GetStringProperty(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var property))
                return string.Empty;

            return property.ValueKind == JsonValueKind.String
                ? property.GetString() ?? string.Empty
                : property.ToString();
        }

        private static int GetIntProperty(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var property))
                return 0;

            if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var numberValue))
                return numberValue;

            return property.ValueKind == JsonValueKind.String &&
                   int.TryParse(property.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : 0;
        }

        private static string GetIdentityDisplayName(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.Object)
                return string.Empty;

            var displayName = GetStringProperty(property, "displayName");
            if (!string.IsNullOrWhiteSpace(displayName))
                return displayName;

            var uniqueName = GetStringProperty(property, "uniqueName");
            if (!string.IsNullOrWhiteSpace(uniqueName))
                return uniqueName;

            return GetStringProperty(property, "name");
        }

        private static bool GetBooleanProperty(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var property))
                return false;

            return property.ValueKind == JsonValueKind.True
                || (property.ValueKind == JsonValueKind.String &&
                    bool.TryParse(property.GetString(), out var parsed) && parsed);
        }

        private static string GetNormalizedFieldText(JsonElement fields, string referenceName)
        {
            if (fields.ValueKind != JsonValueKind.Object || !fields.TryGetProperty(referenceName, out var value))
                return string.Empty;

            return NormalizeWorkItemText(ValueToString(value));
        }

        private async Task<IReadOnlyList<int>> ExecuteWiqlAsync(
            string wiql,
            int top,
            CancellationToken cancellationToken)
        {
            var escapedProject = EncodeUrlPathSegment(_project);
            var normalizedTop = NormalizeSearchTop(top);
            var url = $"https://dev.azure.com/{_escapedOrg}/{escapedProject}/_apis/wit/wiql?$top={normalizedTop}&api-version={_api}";
            var requestBody = JsonSerializer.Serialize(new { query = wiql }, _jsonOptions);

            using var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
            using var resp = await _client.PostAsync(url, content, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
                throw new AzDoRequestException("SearchWorkItemsWiql", (int)resp.StatusCode, url, body);

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            if (!doc.RootElement.TryGetProperty("workItems", out var workItems)
                || workItems.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var ids = new List<int>();
            foreach (var workItem in workItems.EnumerateArray())
            {
                if (workItem.TryGetProperty("id", out var idProperty)
                    && idProperty.TryGetInt32(out var id)
                    && id > 0)
                {
                    ids.Add(id);
                }
            }

            return ids;
        }

        private async Task<IReadOnlyList<WorkItemLookupItem>> GetWorkItemLookupItemsBatchAsync(
            IReadOnlyList<int> ids,
            CancellationToken cancellationToken)
        {
            if (ids.Count == 0)
                return [];

            var url = $"https://dev.azure.com/{_escapedOrg}/{_escapedProject}/_apis/wit/workitemsbatch?api-version={_api}";
            var requestBody = JsonSerializer.Serialize(new
            {
                ids,
                fields = new[]
                {
                    "System.Id",
                    "System.Title",
                    AzureDevOpsProtocol.StateReferenceName,
                    "System.AreaPath",
                    "System.IterationPath",
                    "System.WorkItemType"
                }
            }, _jsonOptions);

            using var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
            using var resp = await _client.PostAsync(url, content, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
                throw new AzDoRequestException("SearchWorkItemsBatch", (int)resp.StatusCode, url, body);

            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            if (!doc.RootElement.TryGetProperty("value", out var value)
                || value.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var items = new List<WorkItemLookupItem>();
            foreach (var workItem in value.EnumerateArray())
            {
                var id = workItem.TryGetProperty("id", out var idProperty) && idProperty.TryGetInt32(out var parsedId)
                    ? parsedId
                    : 0;

                if (id <= 0)
                    continue;

                var fields = workItem.TryGetProperty("fields", out var fieldsElement)
                    && fieldsElement.ValueKind == JsonValueKind.Object
                        ? fieldsElement
                        : default;

                var title = GetNormalizedFieldText(fields, "System.Title");
                if (string.IsNullOrWhiteSpace(title))
                    title = $"Work item {id}";

                items.Add(new WorkItemLookupItem
                {
                    Id = id,
                    Title = title,
                    State = GetNormalizedFieldText(fields, AzureDevOpsProtocol.StateReferenceName),
                    AreaPath = GetNormalizedFieldText(fields, "System.AreaPath"),
                    IterationPath = GetNormalizedFieldText(fields, "System.IterationPath"),
                    WorkItemType = GetNormalizedFieldText(fields, "System.WorkItemType")
                });
            }

            return items;
        }

        private static string BuildUserStoriesSearchWiql(
            string project,
            string requirementWorkItemType,
            string? areaPath,
            string? iterationPath,
            string? searchText)
        {
            var clauses = new List<string>
            {
                $"[System.TeamProject] = '{EscapeWiqlLiteral(project)}'",
                $"[System.WorkItemType] = '{EscapeWiqlLiteral(requirementWorkItemType)}'"
            };

            var normalizedAreaPath = NormalizeHierarchyPath(areaPath, "area");
            if (!string.IsNullOrWhiteSpace(normalizedAreaPath))
                clauses.Add($"[System.AreaPath] UNDER '{EscapeWiqlLiteral(normalizedAreaPath)}'");

            var normalizedIterationPath = NormalizeHierarchyPath(iterationPath, "iteration");
            if (!string.IsNullOrWhiteSpace(normalizedIterationPath))
                clauses.Add($"[System.IterationPath] UNDER '{EscapeWiqlLiteral(normalizedIterationPath)}'");

            var normalizedSearchText = searchText?.Trim() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(normalizedSearchText))
            {
                if (int.TryParse(normalizedSearchText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var workItemId)
                    && workItemId > 0)
                {
                    clauses.Add($"[System.Id] = {workItemId}");
                }
                else
                {
                    clauses.Add($"[System.Title] CONTAINS '{EscapeWiqlLiteral(normalizedSearchText)}'");
                }
            }

            return $"SELECT [System.Id] FROM WorkItems WHERE {string.Join(" AND ", clauses)} ORDER BY [System.ChangedDate] DESC";
        }

        private int NormalizeSearchTop(int top)
        {
            if (top <= 0)
                return Math.Min(_defaultWorkItemSearchTop, _maxWorkItemSearchTop);

            return Math.Min(top, _maxWorkItemSearchTop);
        }

        private static string ToJsonPatchFieldPath(string referenceName)
        {
            var normalized = referenceName.StartsWith("/fields/", StringComparison.OrdinalIgnoreCase)
                ? referenceName[8..]
                : referenceName;
            var escaped = normalized
                .Replace("~", "~0", StringComparison.Ordinal)
                .Replace("/", "~1", StringComparison.Ordinal);
            return $"/fields/{escaped}";
        }

        private static string EscapeWiqlLiteral(string value) =>
            (value ?? string.Empty).Trim().Replace("'", "''", StringComparison.Ordinal);

        private static int? GetNullableIntField(JsonElement fields, string referenceName)
        {
            if (fields.ValueKind != JsonValueKind.Object || !fields.TryGetProperty(referenceName, out var value))
                return null;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var intValue))
                return intValue;

            if (value.ValueKind == JsonValueKind.Number
                && value.TryGetDouble(out var doubleValue))
            {
                try
                {
                    return checked((int)Math.Round(doubleValue));
                }
                catch (OverflowException)
                {
                    return null;
                }
            }

            return value.ValueKind == JsonValueKind.String
                && int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                    ? parsed
                    : null;
        }

        private static double? GetNullableDoubleField(JsonElement fields, string referenceName)
        {
            if (fields.ValueKind != JsonValueKind.Object || !fields.TryGetProperty(referenceName, out var value))
                return null;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var doubleValue))
                return doubleValue;

            return value.ValueKind == JsonValueKind.String
                && double.TryParse(value.GetString(), NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var parsed)
                    ? parsed
                    : null;
        }

        private static Dictionary<string, object?> ExtractFunctionalFields(JsonElement fields)
        {
            var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            if (fields.ValueKind != JsonValueKind.Object)
                return result;

            foreach (var field in fields.EnumerateObject())
            {
                var referenceName = field.Name;
                if (!IsRelevantEvaluationField(referenceName))
                    continue;

                var value = ConvertFieldValue(field.Value);
                if (value is null)
                    continue;

                if (value is string stringValue && string.IsNullOrWhiteSpace(stringValue))
                    continue;

                result[referenceName] = value;
            }

            return result;
        }

        private static bool IsRelevantEvaluationField(string referenceName)
        {
            if (string.IsNullOrWhiteSpace(referenceName))
                return false;

            if (referenceName.Equals("System.Title", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("System.Description", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("System.WorkItemType", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals(AzureDevOpsProtocol.StateReferenceName, StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("System.AreaPath", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("System.IterationPath", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Common.AcceptanceCriteria", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Common.Priority", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Common.BacklogPriority", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Scheduling.StoryPoints", StringComparison.OrdinalIgnoreCase)
                || referenceName.Equals("Microsoft.VSTS.Scheduling.Effort", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            var normalized = referenceName.ToLowerInvariant();
            string[] relevantTokens =
            [
                "business",
                "value",
                "risk",
                "severity",
                "tipo",
                "frente",
                "modulo",
                "module",
                "proceso",
                "process",
                "canal",
                "channel",
                "actor",
                "role",
                "rol",
                "producto",
                "product",
                "servicio",
                "service",
                "regla",
                "rule",
                "dependency",
                "dependencia",
                "impact",
                "impacto",
                "scope",
                "alcance",
                "feature",
                "component",
                "componente"
            ];

            return relevantTokens.Any(token => normalized.Contains(token, StringComparison.OrdinalIgnoreCase));
        }

        private static object? ConvertFieldValue(JsonElement value)
        {
            return value.ValueKind switch
            {
                JsonValueKind.String => NormalizeWorkItemText(value.GetString() ?? string.Empty),
                JsonValueKind.Number when value.TryGetInt64(out var intValue) => intValue,
                JsonValueKind.Number when value.TryGetDouble(out var doubleValue) => doubleValue,
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                JsonValueKind.Undefined => null,
                _ => value.GetRawText()
            };
        }

        private static string ValueToString(JsonElement value)
        {
            return value.ValueKind == JsonValueKind.String
                ? value.GetString() ?? string.Empty
                : value.ToString();
        }

        private static string NormalizeWorkItemText(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            var withoutTags = Regex.Replace(value, "<[^>]+>", " ");
            var decoded = WebUtility.HtmlDecode(withoutTags) ?? string.Empty;
            return Regex.Replace(decoded, @"\s+", " ").Trim();
        }

        private static string ExtractName(JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.String)
                return element.GetString()?.Trim() ?? string.Empty;

            if (element.ValueKind != JsonValueKind.Object)
                return string.Empty;

            if (element.TryGetProperty("name", out var nameProperty) && nameProperty.ValueKind == JsonValueKind.String)
                return nameProperty.GetString()?.Trim() ?? string.Empty;

            return string.Empty;
        }

        private static string BuildFieldAlias(string referenceName, string label)
        {
            var source = referenceName?.Trim() ?? string.Empty;
            if (source.Contains(".", StringComparison.Ordinal))
                source = source[(source.LastIndexOf(".", StringComparison.Ordinal) + 1)..];

            if (string.IsNullOrWhiteSpace(source))
                source = label?.Trim() ?? string.Empty;

            return ToCamelCase(source);
        }

        private static string EnsureUniqueFieldName(string name, ISet<string> usedNames)
        {
            var cleaned = string.IsNullOrWhiteSpace(name) ? "field" : name.Trim();
            var candidate = cleaned;
            var suffix = 2;

            while (usedNames.Contains(candidate))
            {
                candidate = $"{cleaned}{suffix}";
                suffix++;
            }

            usedNames.Add(candidate);
            return candidate;
        }

        private static string ToCamelCase(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return "field";

            var separators = new[] { ' ', '-', '_', '.', '/' };
            var tokens = value
                .Split(separators, StringSplitOptions.RemoveEmptyEntries)
                .Select(token => new string(token.Where(char.IsLetterOrDigit).ToArray()))
                .Where(token => !string.IsNullOrWhiteSpace(token))
                .ToArray();

            if (tokens.Length == 0)
                return "field";

            var first = tokens[0];
            var result = new StringBuilder(first[..1].ToLowerInvariant() + first[1..]);
            for (var i = 1; i < tokens.Length; i++)
            {
                var token = tokens[i];
                result.Append(char.ToUpperInvariant(token[0]));
                if (token.Length > 1)
                    result.Append(token[1..]);
            }

            return result.ToString();
        }

        private static string NormalizeLookupKey(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            return new string(value
                .Where(char.IsLetterOrDigit)
                .Select(char.ToLowerInvariant)
                .ToArray());
        }

        private static string[] ParsePicklistItems(JsonElement root)
        {
            if (!root.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
                return [];

            var values = new List<string>();
            foreach (var item in items.EnumerateArray())
            {
                var value = ExtractAllowedValue(item);
                if (!string.IsNullOrWhiteSpace(value))
                    values.Add(value.Trim());
            }

            return values
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        private async Task<(string[] AllowedValues, string PicklistId)> GetGlobalFieldMetadataAsync(
            string referenceName,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(referenceName))
                return ([], string.Empty);

            try
            {
                var escapedReferenceName = Uri.EscapeDataString(referenceName);
                var url = $"https://dev.azure.com/{_escapedOrg}/_apis/wit/fields/{escapedReferenceName}?api-version={_api}";
                using var resp = await _client.GetAsync(url, cancellationToken);
                var body = await resp.Content.ReadAsStringAsync(cancellationToken);
                if (!resp.IsSuccessStatusCode)
                    return ([], string.Empty);

                using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
                var values = GetAllowedValues(doc.RootElement).ToArray();
                if (values.Length == 0)
                    values = GetInlinePicklistValues(doc.RootElement).ToArray();

                var picklistId = GetPicklistId(doc.RootElement);
                return (values, picklistId);
            }
            catch
            {
                return ([], string.Empty);
            }
        }

        private static IEnumerable<string> GetInlinePicklistValues(JsonElement fieldElement)
        {
            var values = new List<string>();
            if (!TryGetPicklistItemsElement(fieldElement, out var itemsElement))
                return values;

            foreach (var item in itemsElement.EnumerateArray())
            {
                var value = ExtractAllowedValue(item);
                if (!string.IsNullOrWhiteSpace(value))
                    values.Add(value.Trim());
            }

            return values
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase);
        }

        private static bool TryGetPicklistItemsElement(JsonElement fieldElement, out JsonElement itemsElement)
        {
            itemsElement = default;
            if (TryGetPicklistElement(fieldElement, out var picklistElement)
                && picklistElement.TryGetProperty("items", out itemsElement)
                && itemsElement.ValueKind == JsonValueKind.Array)
            {
                return true;
            }

            return false;
        }

        private static string GetPicklistId(JsonElement fieldElement)
        {
            var picklistId = GetStringProperty(fieldElement, "picklistId");
            if (!string.IsNullOrWhiteSpace(picklistId))
                return picklistId.Trim();

            picklistId = GetStringProperty(fieldElement, "pickListId");
            if (!string.IsNullOrWhiteSpace(picklistId))
                return picklistId.Trim();

            if (TryGetPicklistElement(fieldElement, out var picklistElement))
            {
                picklistId = GetStringProperty(picklistElement, "id");
                if (!string.IsNullOrWhiteSpace(picklistId))
                    return picklistId.Trim();
            }

            return string.Empty;
        }

        private static bool TryGetPicklistElement(JsonElement fieldElement, out JsonElement picklistElement)
        {
            picklistElement = default;

            if (fieldElement.TryGetProperty("picklist", out picklistElement)
                && picklistElement.ValueKind == JsonValueKind.Object)
            {
                return true;
            }

            if (fieldElement.TryGetProperty("pickList", out picklistElement)
                && picklistElement.ValueKind == JsonValueKind.Object)
            {
                return true;
            }

            picklistElement = default;
            return false;
        }

        async Task<JsonElement> PatchWiAsync(string url, List<Dictionary<string, object>> patch, string operation)
        {
            var json = JsonSerializer.Serialize(patch, _jsonOptions);
            using var content = new StringContent(json, Encoding.UTF8);
            content.Headers.ContentType = MediaTypeHeaderValue.Parse("application/json-patch+json");
            using var req = new HttpRequestMessage(HttpMethod.Patch, url) { Content = content };
            using var resp = await _client.SendAsync(req);
            var body = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode)
                throw new AzDoRequestException(operation, (int)resp.StatusCode, url, body);
            using var doc = JsonDocument.Parse(body, _jsonDocumentOptions);
            return doc.RootElement.Clone();
        }

        static void FlattenClassificationNodePaths(JsonElement node, List<string> paths)
        {
            if (node.TryGetProperty("path", out var pathProperty))
            {
                var path = pathProperty.GetString();
                if (!string.IsNullOrWhiteSpace(path))
                    paths.Add(path.Trim());
            }

            if (node.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in children.EnumerateArray())
                    FlattenClassificationNodePaths(child, paths);
            }
        }
    }
}
