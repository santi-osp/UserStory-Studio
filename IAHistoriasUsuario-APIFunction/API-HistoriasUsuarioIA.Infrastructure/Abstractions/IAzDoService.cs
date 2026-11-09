namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Contrato de operaciones soportadas contra Azure DevOps para metadata, work items, comentarios y Test Plans.
    /// </summary>
    public interface IAzDoService
    {
        /// <summary>
        /// Lista todos los proyectos visibles para el PAT configurado en la organizacion.
        /// </summary>
        Task<IReadOnlyList<string>> GetProjectsAsync();

        /// <summary>
        /// Obtiene rutas de clasificacion de un proyecto para <c>areas</c> o <c>iterations</c>.
        /// </summary>
        Task<IReadOnlyList<string>> GetClassificationPathsAsync(string project, string structureGroup);

        /// <summary>
        /// Construye la URL navegable del work item en Azure DevOps.
        /// </summary>
        string WorkItemUrl(int id);

        /// <summary>
        /// Resuelve el tipo de work item asociado a una categoria del proceso, usando fallback si la categoria no existe.
        /// </summary>
        Task<string> ResolveWorkItemTypeByCategoryAsync(
            string project,
            string categoryReferenceName,
            string fallbackWorkItemType);

        /// <summary>
        /// Crea un work item generico mediante JSON Patch de campos Azure DevOps.
        /// </summary>
        Task<int> CreateWorkItemAsync(string workItemType, IReadOnlyDictionary<string, object?> fields);

        /// <summary>
        /// Agrega relacion padre-hijo entre dos work items existentes.
        /// </summary>
        Task LinkParentAsync(int childId, int parentId);

        /// <summary>
        /// Obtiene campos configurables para el tipo de work item de requerimiento del proyecto o para el tipo solicitado.
        /// </summary>
        Task<WorkItemConfigResponse> GetWorkItemConfigAsync(string project, string requestedWorkItemType = "");

        /// <summary>
        /// Enriquece campos de UI con opciones de picklists y controles sugeridos.
        /// </summary>
        Task<IReadOnlyList<WorkItemFieldConfig>> PopulateUiFieldOptionsAsync(
            string project,
            string workItemType,
            IReadOnlyList<WorkItemFieldConfig> fields,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Crea un Work Item usando la configuración dinámica de campos y valida requeridos antes de llamar Azure DevOps.
        /// </summary>
        Task<int> CreateWorkItemAsync(CreateWorkItemPayload payload, WorkItemConfigResponse workItemConfig);

        /// <summary>
        /// Consulta solo los campos necesarios de un work item para evaluación funcional de Work Item.
        /// </summary>
        Task<AzdoWorkItemDetails> GetWorkItemDetailsAsync(
            int workItemId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Busca work items de tipo requerimiento para poblar el selector de evaluación de Work Item.
        /// </summary>
        Task<IReadOnlyList<WorkItemLookupItem>> SearchWorkItemsAsync(
            string project,
            string? areaPath,
            string? iterationPath,
            string? searchText,
            int top,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Crea un Test Case con pasos TCM, iteracion, area y estado opcional.
        /// </summary>
        Task<CreatedTestCase> CreateTestCaseAsync(string iterationPath, string areaPath, TestCaseFields testCase);

        Task UpdateTestCaseStateAsync(int testCaseId, string state);

        /// <summary>
        /// Consulta comentarios de discusion de un work item, incluyendo elementos eliminados.
        /// </summary>
        Task<WorkItemDiscussionCommentsResponse> GetWorkItemDiscussionCommentsAsync(
            int workItemId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Consulta comentarios de discusion para varios work items, normalizando ids duplicados o invalidos.
        /// </summary>
        Task<WorkItemsDiscussionCommentsResponse> GetWorkItemsDiscussionCommentsAsync(
            IEnumerable<int> workItemIds,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Lista Test Plans del proyecto actual del servicio.
        /// </summary>
        Task<IReadOnlyList<TestPlanSummary>> GetTestPlansAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Resuelve el Test Plan y su suite raiz.
        /// </summary>
        Task<TestPlanContext> GetTestPlanContextAsync(int planId);

        Task<IReadOnlyList<TestSuiteSummary>> GetDirectChildSuitesAsync(int planId, int rootSuiteId);

        Task<CreatedTestSuite> CreateRequirementSuiteAsync(
            int planId,
            int parentSuiteId,
            int requirementId);

        Task<CreatedTestSuite> CreateStaticSuiteAsync(
            int planId,
            int parentSuiteId,
            string name);

        Task AddTestCaseToSuiteAsync(int planId, int suiteId, int testCaseId);

        /// <summary>
        /// Vincula un Work Item con un Test Case usando la relacion Tested By de Azure DevOps.
        /// </summary>
        Task LinkTestedByAsync(int workItemId, int testCaseId);
    }
}
