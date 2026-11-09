export type RiskLevel = string;
export type TcState = string;

export interface AiFieldFlags {
  cantidadTestcases: boolean;
}

export interface WorkItemFields {
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: number | string;
  storyPoints?: number | string;
  risk: RiskLevel;
  startDate: string;
  finishDate: string;
  valueArea: string;
  tipoHU: string;
  frenteDeTrabajo: string;
  assignedTo: string;
  [key: string]: unknown;
}

export type RefinableWorkItemField =
  'title' | 'description' | 'acceptanceCriteria';

export type WorkItemRefinementContent = Partial<
  Record<RefinableWorkItemField, string>
>;

export interface WorkItemContentRefinementCandidate {
  scope: 'content';
  content: WorkItemRefinementContent;
  supportedFields: RefinableWorkItemField[];
  selectedFields: RefinableWorkItemField[];
  changedFields: RefinableWorkItemField[];
  baseFingerprint: string;
}

export type TestCaseRefinementMode = 'improve' | 'regenerate';

export interface TestCaseRefinementSelection {
  ref: string;
  position: number;
  title: string;
  steps: TcStep[];
}

export interface TestCaseRefinementProposal {
  ref: string;
  position: number;
  title: string;
  steps: TcStep[];
}

export interface TestCaseRefinementCandidate {
  scope: 'testCases';
  mode: TestCaseRefinementMode;
  proposals: TestCaseRefinementProposal[];
  selectedRefs: string[];
  baseFingerprint: string;
}

export type WorkItemRefinementCandidate =
  WorkItemContentRefinementCandidate | TestCaseRefinementCandidate;

export interface TcFields {
  title: string;
  state: TcState;
  steps: TcStep[];
  [key: string]: unknown;
}

export interface TcStep {
  action: string;
  expected: string;
  [key: string]: unknown;
}

export interface GenerateTestCasesRequest {
  prompt: string;
  systemPrompt: string;
  model?: string;
}

export interface TestSuiteConfig {
  planId: number;
}

export interface WorkItemPayload {
  azdoOrg: string;
  azdoProject: string;
  iterationPath: string;
  areaPath: string;
  workItemType?: string;
  workItem: WorkItemFields;
  testCases: TcFields[];
  testSuite: TestSuiteConfig;
}

export interface CreateWorkItemRequest {
  azdoOrg: string;
  azdoProject: string;
  iterationPath: string;
  areaPath: string;
  workItemType?: string;
  hu: Record<string, unknown>;
  testCases: TcFields[];
  testSuite: TestSuiteConfig;
}

export interface FormValues {
  need: string;
  useTestCases?: boolean;
  tcCount: number;
  tcState: TcState;
  azdoOrg: string;
  azdoProject: string;
  iterationPath: string;
  areaPath: string;
  workItemType: string;
  workItem: WorkItemFields;
  dynamicWorkItemFields: Record<string, unknown>;
  workItemFieldConfigs?: WorkItemFieldConfig[];
  testCases: TcFields[];
  testSuite: TestSuiteConfig;
  aiFields: AiFieldFlags;
}

export interface PromptResult {
  prompt: string;
  systemPrompt: string;
  finalJson: WorkItemPayload;
}

export interface CreatedTc {
  id: number;
  title: string;
  url: string;
  initialState?: string;
  requestedState?: string;
  finalState?: string;
  index?: number;
}

export interface CreateResult {
  huId: number | null;
  huUrl: string | null;
  message: string;
  operationStatus?: 'completed' | 'partial';
  suite?: {
    id: number;
    suiteType: 'requirementTestSuite' | 'staticTestSuite';
    requestedBaseName: string;
    finalName: string;
    renamedDueToDuplicate: boolean;
  };
  createdTestCases?: CreatedTc[];
  failedTestCases?: {
    index: number;
    title: string;
    message: string;
    phase: string;
  }[];
  warnings?: string[];
  plan?: { id: number; name: string };
}

export interface GenerateRequest {
  prompt: string;
  systemPrompt: string;
  azdoContext?: AzdoContext;
}

export interface GenerateResult {
  json?: string;
  raw?: string;
  error?: string;
  warning?: string;
}

export interface ApiErrorShape {
  status: number;
  code: string;
  message: string;
  correlationId?: string;
  detail?: string;
}

export interface AzdoContext {
  organization: string;
}

export interface AzdoFlowContext extends AzdoContext {
  correlationId: string;
}

export interface PersistedAzdoConfigV2 extends AzdoFlowContext {
  version: 2;
}

export interface ProjectMetadata {
  project: string;
  areaPaths: string[];
  iterationPaths: string[];
}

export interface AzdoMetadataResult {
  projects: string[];
  areaPaths: string[];
  iterationPaths: string[];
  projectMetadata?: ProjectMetadata[];
}

export interface AzdoSessionInformation {
  version: 1;
  organization: string;
  loadedAt: string;
  projects: string[];
  areaPaths: string[];
  iterationPaths: string[];
  projectMetadata: ProjectMetadata[];
}

export type WorkItemFieldControl =
  'input' | 'select' | 'date' | 'datetime' | 'textarea' | 'checkbox';

export interface WorkItemFieldConfig {
  name: string;
  referenceName: string;
  label: string;
  type: string;
  required: boolean;
  control: WorkItemFieldControl | string;
  options: string[];
  hasDefaultValue?: boolean;
  isReadOnly?: boolean;
}

export interface WorkItemConfigResult {
  project: string;
  workItemType: string;
  fields: WorkItemFieldConfig[];
}

export interface TestPlanSummary {
  id: number;
  name: string;
}

export interface TestPlansResult {
  project: string;
  testPlans: TestPlanSummary[];
}

export interface EvaluateWorkItemRequest {
  workItemId: number;
  azdoProject: string;
  requestedModel?: string;
  prompt: string;
  systemPrompt: string;
  azdoContext?: AzdoContext;
}

export interface SearchWorkItemsRequest {
  azdoProject: string;
  areaPath?: string;
  iterationPath?: string;
  searchText?: string;
  top?: number;
  azdoContext?: AzdoContext;
}

export interface WorkItemLookupItem {
  id: number;
  title: string;
  state: string;
  areaPath: string;
  iterationPath: string;
  workItemType?: string;
  displayName?: string;
}

export interface SearchWorkItemsResponse {
  project: string;
  count: number;
  items: WorkItemLookupItem[];
}

export interface EvaluateWorkItemResponse {
  workItemId: number;
  workItemUrl: string;
  title: string;
  workItemType: string;
  state: string;
  model: string;
  evaluation: WorkItemEvaluationResult;
}

export interface WorkItemEvaluationResult {
  summary: string;
  qualityScore: number;
  qualityLevel: string;
  readiness: string;
  mainFindings: string[];
  risks: string[];
  ambiguities: string[];
  missingInformation: string[];
  acceptanceCriteriaFindings: string[];
  edgeCases: string[];
  dependencies: string[];
  dataValidations: string[];
  securityConsiderations: string[];
  observabilityConsiderations: string[];
  recommendations: string[];
  refinementQuestions: string[];
  suggestedAcceptanceCriteria: string[];
  improvedVersion: WorkItemImprovedVersion;
  refinementPriority: string;
  conclusion: string;
}

export interface WorkItemImprovedVersion {
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedAcceptanceCriteria: string[];
}
