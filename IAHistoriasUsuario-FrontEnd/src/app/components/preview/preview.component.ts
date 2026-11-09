import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import DOMPurify from 'dompurify';
import { Subscription } from 'rxjs';
import { FormValidationIssue } from '../../models/form-validation';
import {
  PreviewHistoryItem,
  PreviewHistoryRefinementScope,
  PreviewHistorySource,
  PreviewHistoryVersionType,
} from '../../models/preview-history';
import {
  CreateWorkItemRequest,
  CreateResult,
  RefinableWorkItemField,
  TcFields,
  TestCaseRefinementProposal,
  WorkItemFieldConfig,
  WorkItemFields,
  WorkItemPayload,
  WorkItemRefinementCandidate,
} from '../../models/types';
import {
  PreparedWorkItemCreation,
  WorkItemCreationDialogState,
  WorkItemCreationSnapshot,
  WorkItemCreationSummary,
} from '../../models/work-item-creation-preflight';
import { AiRequestValidationService } from '../../services/ai-request-validation.service';
import { ApiService } from '../../services/api.service';
import { AzdoConfigService } from '../../services/azdo-config.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { FormValidationOrchestratorService } from '../../services/form-validation-orchestrator.service';
import { PreviewHistoryService } from '../../services/preview-history.service';
import { ToastService } from '../../services/toast.service';
import { WorkItemPromptBuilderService } from '../../services/work-item-prompt-builder.service';
import {
  validateGeneratedWorkItemResponse,
  WorkItemPromptContract,
  WorkItemPromptResult,
} from '../../prompts/work-items';
import { WorkItemWorkspaceStateService } from '../../services/work-item-workspace-state.service';
import { selectTestCaseState } from '../../utils/azure-devops-invariants';
import { parseTestCaseRefinementResponse } from '../../utils/test-case-refinement';
import {
  normalizeTestCaseTitles,
  stripTestCaseNumberPrefix,
} from '../../utils/test-case-title';
import {
  isWorkItemContentHtmlEmpty,
  normalizeWorkItemContentHtml,
} from '../../utils/work-item-content-html';
import {
  ContentMetadataLoadState,
  findWorkItemContentFieldConfig,
  getAvailableRefinementFields,
  hasCompleteWorkItemContentMetadata,
  resolveWorkItemContentCapability,
  WorkItemContentCapability,
} from '../../utils/work-item-content-metadata';
import {
  restoreUserControlledWorkItemFieldsFromBase,
  sanitizeWorkItemPayload,
} from '../../utils/work-item-dynamic-fields';
import {
  hasSufficientRefinementBase,
  mergeWorkItemRefinementContent,
  parseWorkItemRefinementResponse,
  pickWorkItemRefinementContent,
} from '../../utils/work-item-refinement';
import {
  DEFAULT_WORK_ITEM_TYPE,
  supportsTestCasesForWorkItemType,
} from '../../utils/work-item-type';
import { buildCreateWorkItemRequest } from '../../utils/work-item-create-request';
import { getAzureConnectionMessage } from '../../utils/azure-connection-message';
import { WorkItemCreationDialogComponent } from '../shared/work-item-creation-dialog/work-item-creation-dialog.component';
import { RichTextEditorComponent } from '../shared/rich-text-editor/rich-text-editor.component';
import {
  TestCaseEditorChange,
  TestCaseEditorComponent,
} from '../shared/test-case-editor/test-case-editor.component';
import { FeedbackMessageComponent } from '../shared/ui/feedback-message/feedback-message.component';
import { LoadingSpinnerComponent } from '../shared/ui/loading-spinner/loading-spinner.component';
import { PageHeaderComponent } from '../shared/ui/page-header/page-header.component';
import { SectionCardComponent } from '../shared/ui/section-card/section-card.component';
import {
  WorkItemRefinementDialogComponent,
  WorkItemRefinementDialogSubmit,
} from '../shared/work-item-refinement-dialog/work-item-refinement-dialog.component';

interface RemovedTestCase {
  testCase: TcFields;
  index: number;
  previousFingerprint?: string;
  nextFingerprint?: string;
}

type HistoryRestorePhase =
  | 'idle'
  | 'confirming'
  | 'applying'
  | 'refreshingMetadata'
  | 'completed'
  | 'metadataWarning'
  | 'failed';

interface HistoryRestoreState {
  entryId: string | null;
  phase: HistoryRestorePhase;
  operationId: number;
  message: string;
  detail: string;
  canRetryMetadata: boolean;
  isInitialLoad: boolean;
}

interface HistoryRestoreBanner {
  tone: 'info' | 'success' | 'warning';
  title: string;
  message: string;
  detail: string;
  showSpinner: boolean;
  canRetryMetadata: boolean;
}

const AI_EDITABLE_WORK_ITEM_LOOKUPS = new Set([
  'title',
  'description',
  'acceptancecriteria',
]);

function createIdleHistoryRestoreState(operationId = 0): HistoryRestoreState {
  return {
    entryId: null,
    phase: 'idle',
    operationId,
    message: '',
    detail: '',
    canRetryMetadata: false,
    isInitialLoad: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRestorableHistoryPayload(value: unknown): value is WorkItemPayload {
  if (
    !isRecord(value) ||
    typeof value['azdoProject'] !== 'string' ||
    typeof value['iterationPath'] !== 'string' ||
    typeof value['areaPath'] !== 'string' ||
    !isRecord(value['workItem'])
  ) {
    return false;
  }

  const workItem = value['workItem'];
  if (
    typeof workItem['title'] !== 'string' ||
    !workItem['title'].trim() ||
    typeof workItem['description'] !== 'string' ||
    (Object.prototype.hasOwnProperty.call(workItem, 'acceptanceCriteria') &&
      typeof workItem['acceptanceCriteria'] !== 'string')
  ) {
    return false;
  }

  const testCases = value['testCases'];
  if (
    testCases !== undefined &&
    (!Array.isArray(testCases) ||
      !testCases.every((testCase) => {
        if (
          !isRecord(testCase) ||
          typeof testCase['title'] !== 'string' ||
          typeof testCase['state'] !== 'string' ||
          !Array.isArray(testCase['steps']) ||
          testCase['steps'].length === 0
        ) {
          return false;
        }

        return testCase['steps'].every(
          (step) =>
            isRecord(step) &&
            typeof step['action'] === 'string' &&
            typeof step['expected'] === 'string',
        );
      }))
  ) {
    return false;
  }

  const testSuite = value['testSuite'];
  return (
    testSuite === undefined ||
    (isRecord(testSuite) && Number.isFinite(Number(testSuite['planId'] ?? 0)))
  );
}

function nonBlankTextValidator(
  control: AbstractControl,
): ValidationErrors | null {
  return String(control.value ?? '').trim() ? null : { required: true };
}

function nonBlankHtmlValidator(
  control: AbstractControl,
): ValidationErrors | null {
  return isWorkItemContentHtmlEmpty(control.value) ? { required: true } : null;
}

function parseWorkItemPayload(value: string): unknown {
  return JSON.parse(value) as unknown;
}

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    FeedbackMessageComponent,
    LoadingSpinnerComponent,
    PageHeaderComponent,
    SectionCardComponent,
    TestCaseEditorComponent,
    WorkItemCreationDialogComponent,
    WorkItemRefinementDialogComponent,
    RichTextEditorComponent,
  ],
  templateUrl: './preview.component.html',
})
export class PreviewComponent implements OnInit, OnDestroy {
  @ViewChild('previewWorkItemStart')
  private previewWorkItemStart?: ElementRef<HTMLElement>;

  promptInput = '';
  systemPromptInput = '';
  rawJson = '';
  parsed: WorkItemPayload | null = null;
  rawResponse = '';
  isLoading = false;
  isCreating = false;
  status = '';
  error = '';
  createResult: CreateResult | null = null;
  creationDialogState: WorkItemCreationDialogState | null = null;
  testCaseStateOptions: string[] = [];
  showTestCaseValidation = false;
  showRefinementModal = false;
  isPreparingRefinement = false;
  isRefining = false;
  refinementError = '';
  refinementPreparationError = '';
  refinementUsingFallback = false;
  refinementFields: RefinableWorkItemField[] = [];
  refinementCandidate: WorkItemRefinementCandidate | null = null;
  showCurrentTestCaseComparison = false;
  historyItems: PreviewHistoryItem[] = [];
  isAddingTestCase = false;
  historyRestoreState: HistoryRestoreState = createIdleHistoryRestoreState();
  readonly contentForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [nonBlankTextValidator],
    }),
    description: new FormControl('', { nonNullable: true }),
    acceptanceCriteria: new FormControl('', { nonNullable: true }),
  });
  activeHistoryEntryId: string | null = null;
  private historySource: PreviewHistorySource = 'designer';
  private lastAutoGenerateRequest = 0;
  private lastCreateFingerprint = '';
  private lastCreateErrorAmbiguous = false;
  private preparedCreation: PreparedWorkItemCreation | null = null;
  private creationPreflightRequestId = 0;
  private creationPreflightFrame: number | null = null;
  private creationInvalidIssues: FormValidationIssue[] = [];
  private creationShouldNavigateBack = false;
  private generationBasePayload: WorkItemPayload | null = null;
  private generationContract: WorkItemPromptContract | null = null;
  private currentWorkItemFields: WorkItemFieldConfig[] = [];
  private readonly acceptanceCriteriaSupportedTypes = new Set<string>();
  contentMetadataState: ContentMetadataLoadState = 'idle';
  private refinementMetadataRequestId = 0;
  private refinementGenerationRequestId = 0;
  private readonly contentFormChanges = new Subscription();
  private syncingContentForm = false;
  private initialHistoryLoadFrame: number | null = null;
  private historyRestoreOperationId = 0;
  private historyRestoreMetadataPromise: Promise<boolean> | null = null;
  private historyRestoreFocusFrame: number | null = null;
  private componentDestroyed = false;

  constructor(
    private api: ApiService,
    private workspaceState: WorkItemWorkspaceStateService,
    private previewHistory: PreviewHistoryService,
    private toastService: ToastService,
    private confirmDialog: ConfirmDialogService,
    private aiRequestValidation: AiRequestValidationService,
    private promptBuilder: WorkItemPromptBuilderService,
    private formValidation: FormValidationOrchestratorService,
    private azdoConfigService: AzdoConfigService,
    private router: Router,
  ) {
    this.contentFormChanges.add(
      this.contentForm.controls.title.valueChanges.subscribe((value) =>
        this.updateCurrentContentField('title', value),
      ),
    );
    this.contentFormChanges.add(
      this.contentForm.controls.description.valueChanges.subscribe((value) =>
        this.updateCurrentContentField('description', value),
      ),
    );
    this.contentFormChanges.add(
      this.contentForm.controls.acceptanceCriteria.valueChanges.subscribe(
        (value) => this.updateCurrentContentField('acceptanceCriteria', value),
      ),
    );
  }

  ngOnInit(): void {
    this.historyItems = this.previewHistory.getHistory();
    this.historySource = this.workspaceState.getPreviewSource();
    const request = this.workspaceState.consumePreviewRequest();
    this.systemPromptInput =
      request?.systemPrompt ?? this.workspaceState.getSystemPromptSnapshot();
    this.generationBasePayload = request?.basePayload
      ? this.clonePayload(request.basePayload)
      : null;
    this.generationContract = request?.contract ?? null;
    this.applyInitialPrompt(
      request?.prompt ?? this.workspaceState.getPromptSnapshot(),
    );
    if (request) {
      this.requestAutoGeneration(request.requestId);
    } else if (this.historyItems.length > 0) {
      this.initialHistoryLoadFrame = requestAnimationFrame(() => {
        this.initialHistoryLoadFrame = null;
        if (!this.parsed) {
          void this.loadHistoryItemOnInit();
        }
      });
    }
  }

  get hasWorkspaceData(): boolean {
    return (
      !!this.promptInput.trim() ||
      this.parsed !== null ||
      !!this.rawJson.trim() ||
      this.createResult !== null
    );
  }

  get activeHistoryEntry(): PreviewHistoryItem | null {
    return (
      this.historyItems.find((item) => item.id === this.activeHistoryEntryId) ??
      null
    );
  }

  get hasRuntimeCredential(): boolean {
    return this.azdoConfigService.hasRuntimeCredential();
  }

  get previewHasManualChanges(): boolean {
    return (
      !!this.parsed &&
      !!this.activeHistoryEntry &&
      this.payloadFingerprint(this.parsed) !==
        this.activeHistoryEntry.fingerprint
    );
  }

  get isTemporaryPreview(): boolean {
    return !!this.parsed && !this.activeHistoryEntry;
  }

  isViewingHistoryItem(item: PreviewHistoryItem): boolean {
    return (
      item.id === this.activeHistoryEntryId && !this.previewHasManualChanges
    );
  }

  isHistoryBaseItem(item: PreviewHistoryItem): boolean {
    return (
      item.id === this.activeHistoryEntryId && this.previewHasManualChanges
    );
  }

  historyVersionLabel(item: PreviewHistoryItem): string {
    return item.versionType === 'refinementAccepted'
      ? 'Refinamiento aceptado'
      : 'Generada por IA';
  }

  get previewStatusTone(): 'info' | 'success' {
    return this.isLoading || this.isCreating || this.isRefining
      ? 'info'
      : 'success';
  }

  get historyRestoreBanner(): HistoryRestoreBanner | null {
    if (this.historyRestoreState.isInitialLoad) {
      return null;
    }

    if (this.historyRestoreState.phase === 'refreshingMetadata') {
      return {
        tone: 'info',
        title: 'Work Item restaurado',
        message:
          'La versión ya está disponible. Estamos actualizando los campos y estados de Azure DevOps.',
        detail: '',
        showSpinner: true,
        canRetryMetadata: false,
      };
    }

    if (this.historyRestoreState.phase === 'completed') {
      return {
        tone: 'success',
        title: 'Restauración completada',
        message: 'La versión y su configuración están listas para continuar.',
        detail: '',
        showSpinner: false,
        canRetryMetadata: false,
      };
    }

    if (this.historyRestoreState.phase === 'metadataWarning') {
      return {
        tone: 'warning',
        title: 'Versión restaurada con configuración pendiente',
        message:
          'El contenido fue recuperado, pero no fue posible actualizar toda la metadata. Reintenta la carga antes de crear el Work Item.',
        detail: this.historyRestoreState.detail,
        showSpinner: false,
        canRetryMetadata: this.historyRestoreState.canRetryMetadata,
      };
    }

    return null;
  }

  get isHistoryRestoreInProgress(): boolean {
    return (
      this.historyRestoreState.phase === 'confirming' ||
      this.historyRestoreState.phase === 'applying' ||
      this.historyRestoreState.phase === 'refreshingMetadata'
    );
  }

  get isHistoryMetadataRefreshing(): boolean {
    return this.historyRestoreState.phase === 'refreshingMetadata';
  }

  get isHistoryMetadataBlockingActions(): boolean {
    return (
      this.isHistoryMetadataRefreshing ||
      this.historyRestoreState.phase === 'metadataWarning'
    );
  }

  get metadataDependentActionReason(): string {
    if (this.isHistoryMetadataRefreshing) {
      return 'Espera a que se validen los campos del Work Item.';
    }
    if (this.historyRestoreState.phase === 'metadataWarning') {
      return 'Reintenta la metadata antes de enviar el Work Item a Azure DevOps.';
    }
    return '';
  }

  isRestoringHistoryEntry(entryId: string): boolean {
    return (
      !this.historyRestoreState.isInitialLoad &&
      this.historyRestoreState.entryId === entryId &&
      (this.historyRestoreState.phase === 'applying' ||
        this.historyRestoreState.phase === 'refreshingMetadata')
    );
  }

  isHistoryRestoreError(entryId: string): boolean {
    return (
      this.historyRestoreState.entryId === entryId &&
      this.historyRestoreState.phase === 'failed'
    );
  }

  get displayedWorkItem(): WorkItemFields {
    if (!this.parsed) {
      return {} as WorkItemFields;
    }

    if (
      !this.refinementCandidate ||
      this.refinementCandidate.scope !== 'content'
    ) {
      return this.parsed.workItem;
    }

    return mergeWorkItemRefinementContent(
      this.parsed.workItem,
      this.refinementCandidate.content,
      this.refinementCandidate.supportedFields,
    );
  }

  get canOpenRefinement(): boolean {
    return (
      !!this.parsed &&
      this.previewHistory.hasCompletePayload(this.parsed) &&
      !!this.parsed.workItemType?.trim() &&
      this.createResult === null &&
      !this.refinementCandidate &&
      !this.showRefinementModal &&
      !this.isLoading &&
      !this.isCreating &&
      !this.isRefining &&
      !this.isPreparingRefinement
    );
  }

  get refinementDisabledReason(): string {
    if (!this.parsed) return 'No hay un Work Item disponible para refinar.';
    if (!this.previewHistory.hasCompletePayload(this.parsed))
      return 'Completa el Work Item antes de refinarlo.';
    if (!this.parsed.workItemType?.trim())
      return 'Selecciona un tipo de Work Item antes de refinar.';
    if (this.createResult)
      return 'La creación ya finalizó para esta previsualización.';
    if (this.refinementCandidate)
      return 'Acepta o descarta la propuesta pendiente antes de generar otra.';
    if (this.isCreating) return 'Espera a que termine la creación actual.';
    if (this.isLoading) return 'Espera a que termine la generación actual.';
    if (
      this.isRefining ||
      this.isPreparingRefinement ||
      this.showRefinementModal
    ) {
      return 'Ya hay una operación de refinamiento en curso.';
    }
    return '';
  }

  get supportsAcceptanceCriteria(): boolean {
    return this.shouldDisplayAcceptanceCriteria;
  }

  get shouldDisplayAcceptanceCriteria(): boolean {
    const currentWorkItem = this.parsed?.workItem;
    const candidateContent =
      this.refinementCandidate?.scope === 'content'
        ? this.refinementCandidate.content
        : undefined;
    const hasCurrentOrCandidateField =
      this.hasOwnField(currentWorkItem, 'acceptanceCriteria') ||
      this.hasOwnField(candidateContent, 'acceptanceCriteria');
    if (this.acceptanceCriteriaCapability === 'unsupported') {
      return false;
    }

    return (
      this.isAcceptanceCriteriaSupportedByMetadata ||
      hasCurrentOrCandidateField ||
      this.acceptanceCriteriaSupportedTypes.has(this.currentWorkItemTypeKey)
    );
  }

  get isAcceptanceCriteriaSupportedByMetadata(): boolean {
    return this.acceptanceCriteriaCapability === 'supported';
  }

  get acceptanceCriteriaCapability(): WorkItemContentCapability {
    return resolveWorkItemContentCapability(
      this.currentWorkItemFields,
      'acceptanceCriteria',
      this.contentMetadataState,
    );
  }

  get isAcceptanceCriteriaRequired(): boolean {
    return (
      this.acceptanceCriteriaCapability === 'supported' &&
      (this.findContentFieldConfig('acceptanceCriteria')?.required === true ||
        this.generationContract?.acceptanceCriteria.requiredForGeneration ===
          true)
    );
  }

  get hasUnsupportedAcceptanceCriteriaContent(): boolean {
    return (
      this.acceptanceCriteriaCapability === 'unsupported' &&
      !isWorkItemContentHtmlEmpty(
        this.contentForm.controls.acceptanceCriteria.value,
      )
    );
  }

  get supportsTestCases(): boolean {
    return (
      !!this.parsed &&
      supportsTestCasesForWorkItemType(
        this.parsed.workItemType || DEFAULT_WORK_ITEM_TYPE,
      )
    );
  }

  get contentEditingDisabled(): boolean {
    return (
      this.isCreating ||
      this.creationDialogState !== null ||
      this.createResult !== null ||
      this.refinementCandidate !== null
    );
  }

  isContentFieldRequired(field: RefinableWorkItemField): boolean {
    if (field === 'title') {
      return true;
    }
    if (field === 'acceptanceCriteria') {
      return this.isAcceptanceCriteriaRequired;
    }

    return this.findContentFieldConfig(field)?.required === true;
  }

  isContentFieldInvalid(field: RefinableWorkItemField): boolean {
    const control = this.contentForm.controls[field];
    return control.invalid && (control.dirty || control.touched);
  }

  resetAll(): void {
    this.invalidateHistoryRestore();
    this.rawJson = '';
    this.parsed = null;
    this.activeHistoryEntryId = null;
    this.error = '';
    this.status = '';
    this.rawResponse = '';
    this.createResult = null;
    this.closeCreationDialog(false);
    this.lastCreateFingerprint = '';
    this.lastCreateErrorAmbiguous = false;
    this.resetRefinementState(true);
    this.syncContentForm();
  }

  async openRefinementDialog(): Promise<void> {
    if (!this.ensureRuntimeCredential()) return;
    if (!this.canOpenRefinement || !this.parsed) {
      return;
    }

    const basePayload = this.clonePayload(this.parsed);
    const baseFingerprint = this.payloadFingerprint(basePayload);
    const requestId = ++this.refinementMetadataRequestId;
    this.showRefinementModal = true;
    this.isPreparingRefinement = true;
    this.refinementError = '';
    this.refinementPreparationError = '';
    this.refinementUsingFallback = false;
    this.refinementFields = [];
    this.currentWorkItemFields = [];
    this.contentMetadataState = 'loading';
    this.configureContentValidators();
    await this.prepareRefinementMetadata(
      basePayload,
      baseFingerprint,
      requestId,
      false,
    );
  }

  ngOnDestroy(): void {
    this.componentDestroyed = true;
    this.creationPreflightRequestId++;
    this.creationDialogState = null;
    this.invalidateHistoryRestore();
    this.refinementMetadataRequestId++;
    this.refinementGenerationRequestId++;
    this.contentFormChanges.unsubscribe();
    if (this.initialHistoryLoadFrame !== null) {
      cancelAnimationFrame(this.initialHistoryLoadFrame);
      this.initialHistoryLoadFrame = null;
    }
    if (this.creationPreflightFrame !== null) {
      cancelAnimationFrame(this.creationPreflightFrame);
      this.creationPreflightFrame = null;
    }
  }

  closeRefinementModal(): void {
    if (this.isRefining) {
      return;
    }

    this.refinementMetadataRequestId++;
    this.refinementGenerationRequestId++;
    this.showRefinementModal = false;
    this.isPreparingRefinement = false;
    this.refinementError = '';
    this.refinementPreparationError = '';
    this.refinementUsingFallback = false;
    if (this.contentMetadataState === 'loading') {
      this.currentWorkItemFields = [];
      this.contentMetadataState = 'idle';
      this.configureContentValidators();
    }
  }

  async retryRefinementMetadata(): Promise<void> {
    if (!this.ensureRuntimeCredential()) return;
    if (
      !this.parsed ||
      !this.showRefinementModal ||
      this.isPreparingRefinement ||
      this.isRefining
    ) {
      return;
    }

    const basePayload = this.clonePayload(this.parsed);
    const baseFingerprint = this.payloadFingerprint(basePayload);
    const requestId = ++this.refinementMetadataRequestId;
    this.isPreparingRefinement = true;
    this.refinementPreparationError = '';
    this.refinementUsingFallback = false;
    this.currentWorkItemFields = [];
    this.contentMetadataState = 'loading';
    this.configureContentValidators();
    await this.prepareRefinementMetadata(
      basePayload,
      baseFingerprint,
      requestId,
      true,
    );
  }

  continueRefinementWithFallback(): void {
    if (this.isPreparingRefinement || this.refinementFields.length === 0) {
      return;
    }

    this.refinementPreparationError = '';
    this.refinementUsingFallback = true;
  }

  async generateRefinement(
    request: WorkItemRefinementDialogSubmit,
  ): Promise<void> {
    if (!this.ensureRuntimeCredential()) return;
    if (
      !this.parsed ||
      !this.showRefinementModal ||
      this.isPreparingRefinement ||
      !!this.refinementPreparationError ||
      (request.scope === 'content' && this.refinementFields.length === 0) ||
      this.isRefining ||
      this.refinementCandidate
    ) {
      return;
    }

    const requestId = ++this.refinementGenerationRequestId;
    const basePayload = this.clonePayload(this.parsed);
    const baseFingerprint = this.payloadFingerprint(basePayload);
    if (request.scope === 'testCases') {
      await this.generateTestCaseRefinement(
        request,
        basePayload,
        baseFingerprint,
        requestId,
      );
      return;
    }
    const supportedFields = [...this.refinementFields];
    const baseContent = pickWorkItemRefinementContent(
      basePayload.workItem,
      supportedFields,
    );
    let prompt: WorkItemPromptResult;
    try {
      prompt = this.promptBuilder.buildRefinementPrompt({
        workItemType: basePayload.workItemType ?? '',
        supportedFields,
        selectedFields: request.selectedFields,
        currentContent: baseContent,
        instructions: request.instructions,
      });
    } catch (error) {
      this.refinementError = (error as Error).message;
      return;
    }
    const validation = this.aiRequestValidation.validate(
      'work-item-refinement',
      {
        prompt: prompt.prompt,
        workItemAvailable: this.previewHistory.hasCompletePayload(basePayload),
        workItemType: basePayload.workItemType,
        workItemConfigLoaded:
          this.currentWorkItemFields.length > 0 || this.refinementUsingFallback,
        selectedRefinementFields: request.selectedFields,
        supportedRefinementFields: supportedFields,
        refinementInstructions: request.instructions,
        baseContentAvailable: hasSufficientRefinementBase(
          baseContent,
          request.selectedFields,
        ),
      },
    );
    if (!validation.allowed) {
      this.refinementError = validation.message;
      return;
    }

    this.isRefining = true;
    this.refinementError = '';
    try {
      const data = await this.api.generate({
        prompt: prompt.prompt,
        systemPrompt: prompt.systemPrompt,
      });
      if (data.error) {
        throw new Error(data.error);
      }

      if (
        this.componentDestroyed ||
        requestId !== this.refinementGenerationRequestId
      )
        return;
      if (
        !this.parsed ||
        this.payloadFingerprint(this.parsed) !== baseFingerprint
      ) {
        throw new Error(
          'La versión actual cambió durante el refinamiento. Genera una nueva propuesta.',
        );
      }

      const result = parseWorkItemRefinementResponse(
        data.json ?? '',
        baseContent,
        supportedFields,
        request.selectedFields,
        request.instructions,
      );
      this.refinementCandidate = {
        scope: 'content',
        content: result.content,
        supportedFields,
        selectedFields: [...request.selectedFields],
        changedFields: result.changedFields,
        baseFingerprint,
      };
      this.syncContentForm();
      this.showRefinementModal = false;
      this.status =
        'Propuesta de refinamiento generada. Revísala antes de aceptar.';
      this.error = '';
      if (data.warning) {
        this.toastService.warning(data.warning, {
          title: 'Refinamiento generado con advertencia',
        });
      }
    } catch (err) {
      this.refinementError = (err as Error).message;
    } finally {
      this.isRefining = false;
    }
  }

  private async generateTestCaseRefinement(
    request: Extract<WorkItemRefinementDialogSubmit, { scope: 'testCases' }>,
    basePayload: WorkItemPayload,
    baseFingerprint: string,
    requestId: number,
  ): Promise<void> {
    if (
      !supportsTestCasesForWorkItemType(basePayload.workItemType) ||
      basePayload.workItemType !== 'User Story'
    ) {
      this.refinementError =
        'Los Test Cases solo se pueden refinar para una User Story confirmada.';
      return;
    }
    const refs = new Set(request.selectedTestCases.map((item) => item.ref));
    if (
      !request.instructions.trim() ||
      request.instructions.length > 2000 ||
      request.selectedTestCases.length === 0 ||
      refs.size !== request.selectedTestCases.length ||
      request.selectedTestCases.some(
        (item) =>
          item.ref !== `tc-${item.position + 1}` ||
          basePayload.testCases[item.position] === undefined ||
          !String(item.title ?? '').trim() ||
          !Array.isArray(item.steps) ||
          item.steps.length === 0 ||
          item.steps.some(
            (step) =>
              !String(step.action ?? '').trim() ||
              !String(step.expected ?? '').trim(),
          ),
      )
    ) {
      this.refinementError =
        'Selecciona al menos un Test Case valido para continuar.';
      return;
    }
    const prompt = this.promptBuilder.buildTestCaseRefinementPrompt({
      workItemType: basePayload.workItemType,
      title: String(basePayload.workItem.title ?? ''),
      description: String(basePayload.workItem.description ?? ''),
      acceptanceCriteria: this.shouldDisplayAcceptanceCriteria
        ? String(basePayload.workItem.acceptanceCriteria ?? '')
        : undefined,
      mode: request.mode,
      selectedTestCases: request.selectedTestCases,
      instructions: request.instructions,
    });

    this.isRefining = true;
    this.refinementError = '';
    try {
      const data = await this.api.generateTestCases(prompt);
      if (data.error) throw new Error(data.error);
      if (
        this.componentDestroyed ||
        requestId !== this.refinementGenerationRequestId
      )
        return;
      if (
        !this.parsed ||
        this.payloadFingerprint(this.parsed) !== baseFingerprint
      ) {
        throw new Error(
          'La version actual cambio durante el refinamiento. Genera una nueva propuesta.',
        );
      }
      const proposals = parseTestCaseRefinementResponse(
        data.json ?? '',
        request.selectedTestCases,
      );
      this.refinementCandidate = {
        scope: 'testCases',
        mode: request.mode,
        proposals,
        selectedRefs: request.selectedTestCases.map((item) => item.ref),
        baseFingerprint,
      };
      this.showCurrentTestCaseComparison = false;
      this.showRefinementModal = false;
      this.status =
        'Propuesta de Test Cases generada. Revisala antes de aceptar.';
      this.error = '';
      if (data.warning)
        this.toastService.warning(data.warning, {
          title: 'Propuesta generada con advertencia',
        });
    } catch (err) {
      if (
        requestId !== this.refinementGenerationRequestId ||
        this.componentDestroyed
      )
        return;
      this.refinementError = (err as Error).message;
    } finally {
      if (requestId === this.refinementGenerationRequestId)
        this.isRefining = false;
    }
  }

  acceptRefinement(): void {
    if (!this.parsed || !this.refinementCandidate || this.isRefining) {
      return;
    }

    const currentPayload = this.clonePayload(this.parsed);
    const candidate = this.refinementCandidate;
    if (candidate.baseFingerprint !== this.payloadFingerprint(currentPayload)) {
      this.toastService.error(
        'La versión actual cambió desde que se generó la propuesta. Descártala y genera una nueva.',
        { title: 'No se pudo aceptar el refinamiento' },
      );
      return;
    }

    if (candidate.scope === 'testCases') {
      if (
        !this.isValidTestCaseCandidate(
          candidate.proposals,
          currentPayload.testCases,
        )
      ) {
        this.toastService.error(
          'La propuesta ya no coincide con los Test Cases actuales. Descartala y genera una nueva.',
          { title: 'No se pudo aceptar el refinamiento' },
        );
        return;
      }
      const proposals = new Map(
        candidate.proposals.map((item) => [item.position, item]),
      );
      const acceptedPayload: WorkItemPayload = {
        ...currentPayload,
        testCases: currentPayload.testCases.map((testCase, position) => {
          const proposal = proposals.get(position);
          return proposal
            ? {
                ...testCase,
                title: proposal.title,
                steps: proposal.steps.map((step) => ({ ...step })),
              }
            : testCase;
        }),
      };
      this.applyCurrentPayload(acceptedPayload, { syncContent: false });
      this.registerHistoryVersion(
        acceptedPayload,
        'refinementAccepted',
        'testCases',
      );
      this.refinementCandidate = null;
      this.showCurrentTestCaseComparison = false;
      this.syncContentForm();
      this.status =
        'Refinamiento de Test Cases aceptado y guardado en la version actual.';
      this.error = '';
      this.toastService.success('Refinamiento de Test Cases aceptado.', {
        title: 'Version actualizada',
      });
      this.focusPreviewStart();
      return;
    }

    const mergedWorkItem = mergeWorkItemRefinementContent(
      currentPayload.workItem,
      candidate.content,
      candidate.selectedFields,
    );
    const restoredWorkItem = restoreUserControlledWorkItemFieldsFromBase(
      mergedWorkItem,
      currentPayload.workItem,
      this.currentWorkItemFields,
      AI_EDITABLE_WORK_ITEM_LOOKUPS,
      { workItemType: currentPayload.workItemType },
    );
    const sanitized = sanitizeWorkItemPayload(
      {
        ...currentPayload,
        workItem: restoredWorkItem,
      },
      this.currentWorkItemFields,
      {
        keepEmptyOptionalFields: false,
        workItemType: currentPayload.workItemType,
      },
    );
    if (sanitized.missingRequiredFields.length > 0) {
      this.toastService.error(
        `No se pudo aceptar la propuesta. Faltan campos obligatorios: ${sanitized.missingRequiredFields.join(', ')}.`,
        { title: 'Refinamiento inválido' },
      );
      return;
    }

    const acceptedWorkItem: WorkItemFields = { ...sanitized.payload.workItem };
    candidate.supportedFields.forEach((field) => {
      acceptedWorkItem[field] = mergedWorkItem[field];
    });
    const acceptedPayload: WorkItemPayload = {
      ...sanitized.payload,
      workItem: acceptedWorkItem,
      testCases: currentPayload.testCases,
      testSuite: currentPayload.testSuite,
    };
    this.applyCurrentPayload(acceptedPayload, {
      syncContent: false,
    });
    this.registerHistoryVersion(
      acceptedPayload,
      'refinementAccepted',
      'content',
    );
    this.refinementCandidate = null;
    this.showCurrentTestCaseComparison = false;
    this.syncContentForm();
    this.status = 'Refinamiento aceptado y guardado en la versión actual.';
    this.error = '';
    this.toastService.success('Refinamiento aceptado.', {
      title: 'Versión actualizada',
    });
  }

  discardRefinement(): void {
    if (!this.refinementCandidate || this.isRefining) {
      return;
    }

    this.refinementCandidate = null;
    this.showCurrentTestCaseComparison = false;
    this.syncContentForm();
    this.status =
      'Propuesta de refinamiento descartada. La versión actual se conservó sin cambios.';
    this.toastService.info('Propuesta de refinamiento descartada.');
  }

  refinementFieldChanged(field: RefinableWorkItemField): boolean {
    return (
      this.refinementCandidate?.scope === 'content' &&
      this.refinementCandidate.changedFields.includes(field)
    );
  }

  get isTestCaseRefinementCandidate(): boolean {
    return this.refinementCandidate?.scope === 'testCases';
  }

  testCaseProposalAt(position: number): TestCaseRefinementProposal | null {
    return this.refinementCandidate?.scope === 'testCases'
      ? (this.refinementCandidate.proposals.find(
          (item) => item.position === position,
        ) ?? null)
      : null;
  }

  toggleTestCaseComparison(): void {
    if (this.isTestCaseRefinementCandidate) {
      this.showCurrentTestCaseComparison = !this.showCurrentTestCaseComparison;
    }
  }

  private isValidTestCaseCandidate(
    proposals: readonly TestCaseRefinementProposal[],
    currentTestCases: readonly TcFields[],
  ): boolean {
    const positions = new Set<number>();
    return (
      proposals.length > 0 &&
      proposals.every((proposal) => {
        if (
          positions.has(proposal.position) ||
          proposal.ref !== `tc-${proposal.position + 1}` ||
          !currentTestCases[proposal.position] ||
          !proposal.title.trim() ||
          proposal.steps.length === 0
        )
          return false;
        positions.add(proposal.position);
        return proposal.steps.every(
          (step) =>
            !!String(step.action ?? '').trim() &&
            !!String(step.expected ?? '').trim(),
        );
      })
    );
  }

  private focusPreviewStart(): void {
    requestAnimationFrame(() =>
      this.previewWorkItemStart?.nativeElement.focus(),
    );
  }

  refinementFieldChangeMessage(field: RefinableWorkItemField): string {
    if (field === 'title') return 'Título modificado.';
    if (field === 'description') return 'Descripción modificada.';
    return 'Criterios de aceptación modificados.';
  }

  async callBackendGenerate(): Promise<void> {
    if (this.refinementCandidate || this.isRefining) {
      return;
    }
    if (!this.ensureRuntimeCredential()) return;

    const validation = this.aiRequestValidation.validate(
      'work-item-preview-generation',
      {
        prompt: this.promptInput,
      },
    );
    if (!validation.allowed) {
      this.error = validation.message;
      return;
    }

    if (!this.generationBasePayload || !this.generationContract) {
      this.error =
        'No existe un contrato de generación vigente. Vuelve al formulario y prepara la vista previa nuevamente.';
      return;
    }

    if (!this.systemPromptInput.trim()) {
      this.error =
        'No fue posible preparar la solicitud de generación. Vuelve al formulario e inténtalo de nuevo.';
      return;
    }
    if (
      this.hasPreviewReplacementConflict() &&
      !(await this.confirmPreviewReplacement())
    ) {
      return;
    }

    this.invalidateHistoryRestore();
    this.isLoading = true;
    this.error = '';
    this.createResult = null;
    this.status = 'Generando vista previa…';

    try {
      const data = await this.api.generate({
        prompt: this.promptInput,
        systemPrompt: this.systemPromptInput,
      });
      if (data.error) throw new Error(data.error);

      this.rawResponse = data.raw ?? '';
      const jsonStr = data.json ?? '';
      const parsedResponse = parseWorkItemPayload(jsonStr);
      const validationResult = validateGeneratedWorkItemResponse(
        parsedResponse,
        this.generationContract,
        this.generationBasePayload,
      );
      if (!validationResult.valid || !validationResult.payload) {
        throw new Error(
          `La respuesta de IA incumple el contrato: ${validationResult.errors[0] ?? 'respuesta inválida'}`,
        );
      }
      const parsedPayload = {
        ...validationResult.payload,
        testCases: normalizeTestCaseTitles(validationResult.payload.testCases),
      };
      const value = await this.resolvePayloadForCurrentMetadata(
        parsedPayload,
        'previsualizar el Work Item generado',
      );
      this.applyCurrentPayload(value, { syncContent: true });
      this.configureContentValidators();
      this.lastCreateFingerprint = '';
      this.lastCreateErrorAmbiguous = false;
      this.resetRefinementState();
      this.registerHistoryVersion(value, 'generated');
      this.status = data.warning
        ? `Work Item generado (con advertencia: ${data.warning})`
        : 'Work Item generado por IA y previsualizado.';
    } catch (err) {
      this.status = '';
      this.error = (err as Error).message;
    } finally {
      this.isLoading = false;
    }
  }

  createInAzureDevOps(): void {
    if (
      !this.parsed ||
      this.refinementCandidate ||
      this.isRefining ||
      this.isCreating ||
      this.creationDialogState
    )
      return;

    const snapshot = this.captureCreationSnapshot();
    this.creationInvalidIssues = [];
    this.creationShouldNavigateBack = false;
    this.error = '';
    this.status = '';
    this.creationDialogState = this.createCreationDialogState(
      snapshot.summary,
      'preparing',
      'Validando la información de Azure DevOps…',
    );
    this.updateContentFormDisabledState();

    this.creationPreflightFrame = requestAnimationFrame(() => {
      this.creationPreflightFrame = null;
      void this.runCreationPreflight(snapshot, false);
    });
  }

  retryCreationPreflight(): void {
    if (
      !this.creationDialogState ||
      this.creationDialogState.phase !== 'error' ||
      !this.parsed
    )
      return;
    void this.runCreationPreflight(this.captureCreationSnapshot(), true);
  }

  closeCreationDialog(focusInvalid = true): void {
    if (this.isCreating) return;
    const navigateBack = this.creationShouldNavigateBack;
    const issues = this.creationInvalidIssues;
    this.creationPreflightRequestId++;
    if (this.creationPreflightFrame !== null) {
      cancelAnimationFrame(this.creationPreflightFrame);
      this.creationPreflightFrame = null;
    }
    this.creationDialogState = null;
    this.creationInvalidIssues = [];
    this.creationShouldNavigateBack = false;
    this.updateContentFormDisabledState();
    if (navigateBack) {
      this.navigateBack();
    } else if (focusInvalid && issues.length > 0) {
      requestAnimationFrame(() => this.formValidation.focusFirst(issues));
    }
  }

  viewCreationResult(): void {
    this.closeCreationDialog(false);
    requestAnimationFrame(() =>
      this.previewWorkItemStart?.nativeElement.focus(),
    );
  }

  async confirmPreparedCreation(): Promise<void> {
    if (
      this.isCreating ||
      this.creationDialogState?.phase !== 'ready' ||
      !this.preparedCreation
    )
      return;
    const currentSnapshot = this.captureCreationSnapshot();
    if (
      currentSnapshot.key !== this.preparedCreation.key ||
      !this.isPreparedCreationMetadataFresh(this.preparedCreation)
    ) {
      await this.runCreationPreflight(currentSnapshot, false);
      return;
    }

    const prepared = this.preparedCreation;
    this.isCreating = true;
    this.lastCreateFingerprint = prepared.fingerprint;
    this.creationDialogState = {
      ...this.creationDialogState,
      phase: 'creating',
      message: 'Creando el Work Item en Azure DevOps…',
      error: '',
    };
    this.updateContentFormDisabledState();

    try {
      const data = await this.api.createPrepared(prepared.request, {
        organization: prepared.summary.organization,
      });
      if (data.error) throw new Error(data.error);
      this.createResult = data;
      this.status = data.message;
      this.lastCreateErrorAmbiguous = false;
      this.creationDialogState = {
        ...this.creationDialogState,
        phase: 'result',
        message:
          data.operationStatus === 'partial'
            ? 'El Work Item se creó con resultados parciales.'
            : 'El Work Item se creó correctamente.',
        result: data,
      };
      this.toastService.success(
        data.message || 'Work Item creado en Azure DevOps.',
        {
          title: 'Creación completada',
        },
      );
    } catch (err) {
      const ambiguous = this.isAmbiguousCreateError(err);
      this.lastCreateErrorAmbiguous = ambiguous;
      this.status = '';
      this.error = (err as Error).message;
      this.creationDialogState = {
        ...this.creationDialogState,
        phase: 'result',
        message: 'La creación no pudo confirmarse.',
        error: ambiguous
          ? 'La respuesta fue ambigua. Verifica Azure DevOps antes de intentar nuevamente para evitar duplicados.'
          : this.error,
        result: null,
      };
    } finally {
      this.isCreating = false;
      this.updateContentFormDisabledState();
    }
  }

  async restoreHistoryItem(
    item: PreviewHistoryItem,
    requireConfirmation = true,
    announce = true,
  ): Promise<boolean> {
    if (
      this.refinementCandidate ||
      this.historyRestoreState.phase === 'confirming' ||
      this.historyRestoreState.phase === 'applying' ||
      (this.historyRestoreState.phase === 'refreshingMetadata' &&
        this.historyRestoreState.entryId === item.id)
    ) {
      return false;
    }

    const returnFocusElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const operationId = ++this.historyRestoreOperationId;
    const requiresReplacement =
      requireConfirmation && this.hasPreviewReplacementConflict();
    this.historyRestoreState = {
      entryId: item.id,
      phase: 'confirming',
      operationId,
      message: '',
      detail: '',
      canRetryMetadata: false,
      isInitialLoad: !announce,
    };

    if (requiresReplacement) {
      const confirmed = await this.confirmPreviewReplacement('history');
      if (!this.isCurrentHistoryRestore(operationId, item.id)) {
        return false;
      }
      if (!confirmed) {
        this.historyRestoreState = createIdleHistoryRestoreState(operationId);
        this.scheduleRestoreFocus(returnFocusElement);
        return false;
      }
    }

    this.historyRestoreState = {
      ...this.historyRestoreState,
      phase: 'applying',
    };

    let snapshot: WorkItemPayload;
    try {
      snapshot = this.createRestorableHistorySnapshot(item);
      this.applyHistorySnapshot(item, snapshot, announce);
    } catch {
      if (this.isCurrentHistoryRestore(operationId, item.id)) {
        const message =
          'La entrada del historial no contiene una previsualización válida.';
        this.historyRestoreState = {
          entryId: item.id,
          phase: 'failed',
          operationId,
          message,
          detail: '',
          canRetryMetadata: false,
          isInitialLoad: false,
        };
        this.scheduleRestoreErrorFocus(item.id, returnFocusElement);
      }
      return false;
    }

    this.historyRestoreState = {
      entryId: item.id,
      phase: 'refreshingMetadata',
      operationId,
      message: '',
      detail: '',
      canRetryMetadata: false,
      isInitialLoad: !announce,
    };
    this.contentMetadataState = 'loading';
    this.configureContentValidators();
    const navigation = announce
      ? this.navigateToRestoredWorkItem(operationId, item.id)
      : Promise.resolve(this.isCurrentHistoryRestore(operationId, item.id));
    this.historyRestoreMetadataPromise = navigation.then(
      (navigationIsCurrent) =>
        navigationIsCurrent
          ? this.refreshRestoredHistoryMetadata(
              snapshot,
              item.id,
              operationId,
              false,
            )
          : false,
    );
    void this.historyRestoreMetadataPromise;
    return true;
  }

  private applyHistorySnapshot(
    item: PreviewHistoryItem,
    snapshot: WorkItemPayload,
    announce = true,
  ): void {
    this.promptInput = '';
    this.parsed = snapshot;
    this.activeHistoryEntryId = item.id;
    this.historySource = item.source;
    this.resetRefinementState(true);
    this.rawJson = this.buildCurrentJson();
    this.configureContentValidators();
    this.syncContentForm();
    this.rawResponse = '';
    this.error = '';
    this.status = announce ? `Visualizando la versión: ${item.title}.` : '';
    this.createResult = null;
    this.closeCreationDialog(false);
    this.lastCreateFingerprint = '';
    this.lastCreateErrorAmbiguous = false;
    if (announce) {
      this.toastService.info(`Visualizando la versión: ${item.title}.`);
    }
  }

  async retryHistoryRestoreMetadata(): Promise<void> {
    if (
      !this.parsed ||
      this.historyRestoreState.phase !== 'metadataWarning' ||
      !this.historyRestoreState.entryId ||
      !this.historyRestoreState.canRetryMetadata
    ) {
      return;
    }

    const entryId = this.historyRestoreState.entryId;
    const operationId = ++this.historyRestoreOperationId;
    const snapshot = this.cloneHistoryPayload(this.parsed);
    this.currentWorkItemFields = [];
    this.contentMetadataState = 'loading';
    this.configureContentValidators();
    this.historyRestoreState = {
      entryId,
      phase: 'refreshingMetadata',
      operationId,
      message: '',
      detail: '',
      canRetryMetadata: false,
      isInitialLoad: false,
    };
    this.historyRestoreMetadataPromise = this.refreshRestoredHistoryMetadata(
      snapshot,
      entryId,
      operationId,
      true,
    );
    await this.historyRestoreMetadataPromise;
  }

  async removeHistoryItem(id: string): Promise<void> {
    if (this.refinementCandidate || this.isHistoryRestoreInProgress) {
      return;
    }

    const item = this.historyItems.find((historyItem) => historyItem.id === id);
    if (!item) {
      return;
    }

    const removingActiveBase = item.id === this.activeHistoryEntryId;
    if (removingActiveBase && this.previewHasManualChanges) {
      const confirmed = await this.confirmDialog.confirm({
        title: 'Eliminar la versión base',
        message: 'La vista actual contiene cambios locales sobre esta versión.',
        detail:
          'Al eliminarla también se descartarán los ajustes locales de esta vista.',
        type: 'warning',
        cancelLabel: 'Cancelar',
        confirmLabel: 'Eliminar versión',
      });
      if (!confirmed) {
        return;
      }
    }

    this.historyItems = this.previewHistory.remove(id);
    if (removingActiveBase) {
      this.activeHistoryEntryId = null;
      const next = this.historyItems[0];
      if (next) {
        await this.restoreHistoryItem(next, false, false);
      } else {
        this.resetAll();
      }
    }
    this.toastService.success(`Versión eliminada: ${item.title}.`);
  }

  async clearHistory(): Promise<void> {
    if (
      this.refinementCandidate ||
      this.historyItems.length === 0 ||
      this.isHistoryRestoreInProgress
    ) {
      return;
    }

    const confirmed = await this.confirmDialog.confirm({
      title: 'Limpiar historial de previsualizaciones',
      message:
        'Se eliminarán todas las historias recientes guardadas durante esta sesión.',
      detail: 'Esta acción no se puede deshacer.',
      type: 'danger',
      cancelLabel: 'Cancelar',
      confirmLabel: 'Limpiar historial',
    });
    if (!confirmed) {
      return;
    }

    this.previewHistory.clear();
    this.historyItems = [];
    if (this.parsed) {
      this.resetAll();
    }
    this.toastService.success('Historial de esta sesión limpiado.');
  }

  private contentValidationIssues(): FormValidationIssue[] {
    const fields = [
      {
        key: 'title',
        controlId: 'preview-work-item-title',
        message: 'El título es obligatorio.',
      },
      {
        key: 'description',
        controlId: 'preview-work-item-description',
        message: 'La descripción es obligatoria.',
      },
      {
        key: 'acceptanceCriteria',
        controlId: 'preview-work-item-acceptance-criteria',
        message: 'Los criterios de aceptación son obligatorios.',
      },
    ] as const;
    return fields.flatMap((field, order) =>
      this.contentForm.controls[field.key].invalid
        ? [
            {
              ...field,
              type: 'required' as const,
              order: 10 + order,
              section: 'preview-content',
              source: 'creation-preflight' as const,
            },
          ]
        : [],
    );
  }

  private firstTestCaseValidationIssue(
    testCaseIndex: number,
  ): FormValidationIssue {
    const testCase = this.parsed!.testCases[testCaseIndex];
    let controlId = `test-case-title-${testCaseIndex}`;
    let message = 'El título del Test Case es obligatorio.';
    if (testCase.title.trim() && !this.isValidTestCaseState(testCase.state)) {
      controlId = `test-case-state-${testCaseIndex}`;
      message = 'Selecciona un estado válido de Azure DevOps.';
    } else if (testCase.title.trim() && testCase.steps.length > 0) {
      const stepIndex = testCase.steps.findIndex(
        (step) => !step.action.trim() || !step.expected.trim(),
      );
      if (stepIndex >= 0) {
        const missingAction = !testCase.steps[stepIndex].action.trim();
        controlId = `test-case-${testCaseIndex}-step-${stepIndex}-${missingAction ? 'action' : 'expected'}`;
        message = missingAction
          ? 'La acción es obligatoria.'
          : 'El resultado esperado es obligatorio.';
      }
    }
    return {
      key: 'testCase',
      type: 'required',
      message,
      controlId,
      order: 100,
      section: 'preview-test-cases',
      source: 'creation-preflight',
    };
  }

  private captureCreationSnapshot(): WorkItemCreationSnapshot {
    const context = this.azdoConfigService.getContextSnapshot();
    const payload = this.normalizePayloadForPreview(
      this.restoreBasePayloadContext(this.parsed!),
    );
    const normalizedPayload = this.clonePayload({
      ...payload,
      azdoOrg: context.organization.trim() || payload.azdoOrg,
    });
    const fingerprint = this.payloadFingerprint(normalizedPayload);
    const contextIdentity = `${context.organization.trim().toLowerCase()}::${context.correlationId}`;
    const summary: WorkItemCreationSummary = {
      organization: context.organization.trim(),
      project: normalizedPayload.azdoProject.trim(),
      workItemType:
        normalizedPayload.workItemType?.trim() || DEFAULT_WORK_ITEM_TYPE,
      areaPath: normalizedPayload.areaPath.trim(),
      iterationPath: normalizedPayload.iterationPath.trim(),
      title: String(normalizedPayload.workItem.title ?? '').trim(),
      testCaseCount: normalizedPayload.testCases.length,
      testPlanId: Number(normalizedPayload.testSuite?.planId ?? 0),
    };

    return {
      key: JSON.stringify({ fingerprint, contextIdentity }),
      fingerprint,
      contextIdentity,
      payload: normalizedPayload,
      summary,
    };
  }

  private createCreationDialogState(
    summary: WorkItemCreationSummary,
    phase: WorkItemCreationDialogState['phase'],
    message: string,
    values: Partial<
      Omit<WorkItemCreationDialogState, 'phase' | 'summary' | 'message'>
    > = {},
  ): WorkItemCreationDialogState {
    return {
      phase,
      summary,
      message,
      error: '',
      issues: [],
      warnings: [],
      result: null,
      ambiguousRetry: false,
      ...values,
    };
  }

  private async runCreationPreflight(
    snapshot: WorkItemCreationSnapshot,
    forceRefresh: boolean,
  ): Promise<void> {
    const requestId = ++this.creationPreflightRequestId;
    this.creationInvalidIssues = [];
    this.creationShouldNavigateBack = false;
    this.creationDialogState = this.createCreationDialogState(
      snapshot.summary,
      'preparing',
      'Validando la información de Azure DevOps…',
    );

    const connectionIssue = this.creationConnectionIssue();
    if (connectionIssue) {
      this.setCreationInvalid(requestId, snapshot, connectionIssue);
      return;
    }
    if (this.isHistoryMetadataBlockingActions) {
      this.setCreationInvalid(
        requestId,
        snapshot,
        this.metadataDependentActionReason,
      );
      return;
    }

    this.contentForm.markAllAsTouched();
    if (this.contentForm.invalid) {
      this.creationInvalidIssues = this.contentValidationIssues();
      this.setCreationInvalid(
        requestId,
        snapshot,
        'Completa los campos obligatorios del contenido antes de crear el Work Item.',
        this.creationInvalidIssues.map((issue) => issue.message),
      );
      return;
    }

    if (
      !forceRefresh &&
      this.preparedCreation?.key === snapshot.key &&
      this.isPreparedCreationMetadataFresh(this.preparedCreation)
    ) {
      this.setCreationReady(requestId, this.preparedCreation);
      return;
    }
    this.preparedCreation = null;

    const supportsTestCases = supportsTestCasesForWorkItemType(
      snapshot.summary.workItemType,
    );
    try {
      const workItemConfigRequest = this.api.fetchWorkItemConfig(
        snapshot.summary.project,
        snapshot.summary.workItemType,
        undefined,
        forceRefresh,
      );
      const testCaseConfigRequest =
        supportsTestCases && snapshot.summary.testCaseCount > 0
          ? this.api.fetchWorkItemConfig(
              snapshot.summary.project,
              'Test Case',
              undefined,
              forceRefresh,
            )
          : Promise.resolve(null);
      const [workItemConfig, testCaseConfig] = await Promise.all([
        workItemConfigRequest,
        testCaseConfigRequest,
      ]);
      if (!this.isCurrentCreationPreflight(requestId, snapshot.key)) return;

      this.applyContentMetadata(
        workItemConfig.fields,
        snapshot.summary.workItemType,
      );
      const stateOptions = testCaseConfig
        ? this.extractTestCaseStateOptions(testCaseConfig.fields)
        : [];
      this.testCaseStateOptions = stateOptions;

      const payloadWithUserFields = this.restoreUserControlledWorkItemFields(
        snapshot.payload,
        workItemConfig.fields,
      );
      const sanitized = sanitizeWorkItemPayload(
        payloadWithUserFields,
        workItemConfig.fields,
        { keepEmptyOptionalFields: false },
      );
      if (sanitized.missingRequiredFields.length > 0) {
        this.setCreationInvalid(
          requestId,
          snapshot,
          `Faltan campos obligatorios del tipo ${workItemConfig.workItemType}.`,
          sanitized.missingRequiredFields,
        );
        return;
      }

      const preparedPayload = this.clonePayload(sanitized.payload);
      const invalidTestCase = preparedPayload.testCases.findIndex(
        (testCase) => {
          const validState = stateOptions.find(
            (state) =>
              state.toLowerCase() === testCase.state.trim().toLowerCase(),
          );
          if (validState) testCase.state = validState;
          return (
            !testCase.title.trim() ||
            !validState ||
            testCase.steps.length === 0 ||
            testCase.steps.some(
              (step) => !step.action.trim() || !step.expected.trim(),
            )
          );
        },
      );
      if (invalidTestCase >= 0) {
        this.showTestCaseValidation = true;
        this.creationInvalidIssues = [
          this.firstTestCaseValidationIssue(invalidTestCase),
        ];
        this.setCreationInvalid(
          requestId,
          snapshot,
          `El Test Case ${invalidTestCase + 1} requiere título, estado y al menos un paso completo.`,
          this.creationInvalidIssues.map((issue) => issue.message),
        );
        return;
      }
      if (this.shouldWarnMissingTestPlan(preparedPayload)) {
        this.creationShouldNavigateBack = true;
        this.setCreationInvalid(
          requestId,
          snapshot,
          'Selecciona un Test Plan antes de crear los Test Cases.',
          [
            'La User Story tiene Test Cases, pero no tiene un Test Plan asociado.',
          ],
        );
        return;
      }

      const request: CreateWorkItemRequest = buildCreateWorkItemRequest(
        preparedPayload,
        workItemConfig.fields,
      );
      const warnings =
        sanitized.removedFields.length > 0
          ? [
              `Se omitirán campos sin valor: ${sanitized.removedFields.join(', ')}.`,
            ]
          : [];
      const metadataIdentity = this.workItemCreationMetadataIdentity(
        workItemConfig,
        testCaseConfig,
      );
      const prepared: PreparedWorkItemCreation = {
        ...snapshot,
        payload: preparedPayload,
        request,
        metadataIdentity,
        warnings,
      };
      this.preparedCreation = prepared;
      this.rawJson = this.buildCurrentJson();
      this.setCreationReady(requestId, prepared);
    } catch (err) {
      if (!this.isCurrentCreationPreflight(requestId, snapshot.key)) return;
      this.creationDialogState = this.createCreationDialogState(
        snapshot.summary,
        'error',
        'No fue posible validar la información.',
        { error: (err as Error).message },
      );
    }
  }

  private workItemCreationMetadataIdentity(
    workItemConfig: Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>,
    testCaseConfig: Awaited<
      ReturnType<ApiService['fetchWorkItemConfig']>
    > | null,
  ): string {
    return JSON.stringify({
      project: workItemConfig.project,
      workItemType: workItemConfig.workItemType,
      fields: workItemConfig.fields.map((field) => ({
        referenceName: field.referenceName,
        required: field.required,
        options: field.options,
      })),
      testCaseStates: testCaseConfig
        ? this.extractTestCaseStateOptions(testCaseConfig.fields)
        : [],
    });
  }

  private setCreationReady(
    requestId: number,
    prepared: PreparedWorkItemCreation,
  ): void {
    if (!this.isCurrentCreationPreflight(requestId, prepared.key)) return;
    const ambiguousRetry =
      this.lastCreateErrorAmbiguous &&
      this.lastCreateFingerprint === prepared.fingerprint;
    const warnings = ambiguousRetry
      ? [
          ...prepared.warnings,
          'La solicitud anterior tuvo una respuesta ambigua. Verifica Azure DevOps antes de reintentar para evitar duplicados.',
        ]
      : prepared.warnings;
    this.creationDialogState = this.createCreationDialogState(
      prepared.summary,
      'ready',
      'La información está lista para crear el Work Item.',
      { warnings, ambiguousRetry },
    );
  }

  private setCreationInvalid(
    requestId: number,
    snapshot: WorkItemCreationSnapshot,
    error: string,
    issues: readonly string[] = [],
  ): void {
    if (!this.isCurrentCreationPreflight(requestId, snapshot.key)) return;
    this.creationDialogState = this.createCreationDialogState(
      snapshot.summary,
      'invalid',
      'La información requiere correcciones antes de crear.',
      { error, issues },
    );
  }

  private isCurrentCreationPreflight(requestId: number, key: string): boolean {
    return (
      requestId === this.creationPreflightRequestId &&
      !!this.creationDialogState &&
      !!this.parsed &&
      this.captureCreationSnapshot().key === key
    );
  }

  private isPreparedCreationMetadataFresh(
    prepared: PreparedWorkItemCreation,
  ): boolean {
    const workItemConfig = this.api.getFreshWorkItemConfig(
      prepared.summary.project,
      prepared.summary.workItemType,
    );
    const testCaseConfig =
      prepared.summary.testCaseCount === 0
        ? null
        : this.api.getFreshWorkItemConfig(
            prepared.summary.project,
            'Test Case',
          );
    if (
      !workItemConfig ||
      (prepared.summary.testCaseCount > 0 && !testCaseConfig)
    )
      return false;
    return (
      this.workItemCreationMetadataIdentity(workItemConfig, testCaseConfig) ===
      prepared.metadataIdentity
    );
  }

  private creationConnectionIssue(): string {
    return getAzureConnectionMessage(
      this.azdoConfigService.getOrganization(),
      this.azdoConfigService.hasRuntimeCredential(),
    );
  }

  historySourceLabel(source: PreviewHistorySource): string {
    return source === 'fromText' ? 'Crear desde texto' : 'Diseñar Work Item';
  }

  requestDeleteTestCase(index: number): void {
    if (
      !this.parsed ||
      this.refinementCandidate ||
      index < 0 ||
      index >= this.parsed.testCases.length
    ) {
      return;
    }

    const nextCases = [...this.parsed.testCases];
    const removedTestCase: RemovedTestCase = {
      testCase: { ...nextCases[index] },
      index,
      previousFingerprint:
        index > 0 ? this.testCaseFingerprint(nextCases[index - 1]) : undefined,
      nextFingerprint:
        index < nextCases.length - 1
          ? this.testCaseFingerprint(nextCases[index + 1])
          : undefined,
    };
    nextCases.splice(index, 1);
    this.applyCurrentPayload({
      ...this.parsed,
      testCases: nextCases,
    });
    this.status = 'Test Case eliminado. Puedes deshacer la acción.';
    this.toastService.success('Test Case eliminado.', {
      duration: 8000,
      action: {
        label: 'Deshacer',
        callback: () => this.undoDeleteTestCase(removedTestCase),
      },
    });
  }

  private undoDeleteTestCase(removedTestCase: RemovedTestCase): void {
    if (!this.parsed || this.refinementCandidate) {
      return;
    }

    const nextCases = [...this.parsed.testCases];
    const insertAt = this.resolveTestCaseRestoreIndex(
      nextCases,
      removedTestCase,
    );
    nextCases.splice(insertAt, 0, removedTestCase.testCase);
    this.applyCurrentPayload({
      ...this.parsed,
      testCases: nextCases,
    });
    this.status = 'Test Case restaurado.';
    this.toastService.info('Test Case restaurado.');
  }

  goBackAndReset(): void {
    this.resetAll();
    this.navigateBack();
  }

  navigateBack(): void {
    void this.router.navigate([this.workspaceState.getPreviewReturnRoute()]);
  }

  private updateCurrentContentField(
    field: RefinableWorkItemField,
    value: string,
  ): void {
    if (
      this.syncingContentForm ||
      !this.parsed ||
      this.contentEditingDisabled
    ) {
      return;
    }

    const sanitizedValue =
      field === 'title'
        ? DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
        : normalizeWorkItemContentHtml(value);
    this.applyCurrentPayload({
      ...this.parsed,
      workItem: {
        ...this.parsed.workItem,
        [field]: sanitizedValue,
      },
    });
  }

  private applyCurrentPayload(
    payload: WorkItemPayload,
    options: {
      syncContent?: boolean;
    } = {},
  ): void {
    const { syncContent = false } = options;
    this.parsed = this.normalizePayloadForPreview(payload);
    this.rawJson = this.buildCurrentJson();
    if (syncContent) {
      this.syncContentForm();
    }
  }

  private registerHistoryVersion(
    payload: WorkItemPayload,
    versionType: PreviewHistoryVersionType,
    refinementScope?: PreviewHistoryRefinementScope,
  ): void {
    const normalizedPayload = this.normalizePayloadForPreview(payload);
    this.historyItems = this.previewHistory.save(
      normalizedPayload,
      this.historySource,
      versionType,
      refinementScope,
    );
    const fingerprint = this.previewHistory.fingerprint(normalizedPayload);
    this.activeHistoryEntryId =
      this.historyItems.find((item) => item.fingerprint === fingerprint)?.id ??
      null;
  }

  private async loadHistoryItemOnInit(): Promise<void> {
    const latest = this.historyItems[0];
    if (!latest || this.parsed) {
      return;
    }

    await this.restoreHistoryItem(latest, false, false);
  }

  private syncContentForm(): void {
    this.syncingContentForm = true;
    const content = this.displayedWorkItem;
    this.contentForm.setValue(
      {
        title: String(content.title ?? ''),
        description: String(content.description ?? ''),
        acceptanceCriteria: String(content.acceptanceCriteria ?? ''),
      },
      { emitEvent: false },
    );
    this.contentForm.markAsPristine();
    this.contentForm.markAsUntouched();
    this.syncingContentForm = false;
    this.updateContentFormDisabledState();
  }

  private updateContentFormDisabledState(): void {
    if (this.contentEditingDisabled) {
      this.contentForm.disable({ emitEvent: false });
    } else {
      this.contentForm.enable({ emitEvent: false });
    }
  }

  private configureContentValidators(): void {
    this.contentForm.controls.title.setValidators([nonBlankTextValidator]);
    this.configureHtmlContentValidator('description');
    this.configureHtmlContentValidator('acceptanceCriteria');
    this.contentForm.updateValueAndValidity({ emitEvent: false });
  }

  private configureHtmlContentValidator(
    field: 'description' | 'acceptanceCriteria',
  ): void {
    const validators: ValidatorFn[] = this.isContentFieldRequired(field)
      ? [nonBlankHtmlValidator]
      : [];
    this.contentForm.controls[field].setValidators(validators);
    this.contentForm.controls[field].updateValueAndValidity({
      emitEvent: false,
    });
  }

  private findContentFieldConfig(
    field: RefinableWorkItemField,
  ): WorkItemFieldConfig | undefined {
    return findWorkItemContentFieldConfig(this.currentWorkItemFields, field);
  }

  private buildCurrentJson(): string {
    if (!this.parsed) {
      return this.rawJson;
    }

    return JSON.stringify(
      this.normalizePayloadForPreview(this.parsed),
      null,
      2,
    );
  }

  private normalizePayloadForPreview(
    payload: WorkItemPayload,
  ): WorkItemPayload {
    const supportsTestCases = supportsTestCasesForWorkItemType(
      payload.workItemType || DEFAULT_WORK_ITEM_TYPE,
    );
    const workItem: WorkItemFields = {
      ...payload.workItem,
      description: normalizeWorkItemContentHtml(payload.workItem.description),
    };
    if (this.hasOwnField(payload.workItem, 'acceptanceCriteria')) {
      workItem.acceptanceCriteria = normalizeWorkItemContentHtml(
        payload.workItem.acceptanceCriteria,
      );
    }
    return {
      ...payload,
      workItem,
      testCases: supportsTestCases
        ? (payload.testCases ?? []).map((testCase) => ({
            ...testCase,
            steps: (testCase.steps ?? []).map((step) => ({ ...step })),
          }))
        : [],
      testSuite: {
        planId: supportsTestCases ? Number(payload.testSuite?.planId ?? 0) : 0,
      },
    };
  }

  private restoreBasePayloadContext(payload: WorkItemPayload): WorkItemPayload {
    if (!this.generationBasePayload) {
      return payload;
    }

    const basePayload = this.normalizePayloadForPreview(
      this.generationBasePayload,
    );
    return {
      ...payload,
      azdoOrg: basePayload.azdoOrg,
      azdoProject: basePayload.azdoProject,
      iterationPath: basePayload.iterationPath,
      areaPath: basePayload.areaPath,
      workItemType: basePayload.workItemType,
    };
  }

  private restoreUserControlledWorkItemFields(
    payload: WorkItemPayload,
    fields: WorkItemFieldConfig[],
  ): WorkItemPayload {
    if (!this.generationBasePayload) {
      return payload;
    }

    const basePayload = this.normalizePayloadForPreview(
      this.generationBasePayload,
    );
    const workItem = restoreUserControlledWorkItemFieldsFromBase(
      payload.workItem,
      basePayload.workItem,
      fields,
      AI_EDITABLE_WORK_ITEM_LOOKUPS,
      { workItemType: payload.workItemType },
    );

    return {
      ...payload,
      workItem,
    };
  }

  private async resolvePayloadForCurrentMetadata(
    payload: WorkItemPayload,
    actionLabel: string,
  ): Promise<WorkItemPayload> {
    const normalizedPayload = this.normalizePayloadForPreview(
      this.restoreBasePayloadContext(payload),
    );
    this.contentMetadataState = 'loading';
    let workItemConfig: Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>;
    try {
      workItemConfig = await this.api.fetchWorkItemConfig(
        normalizedPayload.azdoProject,
        normalizedPayload.workItemType || DEFAULT_WORK_ITEM_TYPE,
      );
    } catch (error) {
      this.contentMetadataState = 'error';
      throw error;
    }
    this.applyContentMetadata(
      workItemConfig.fields,
      normalizedPayload.workItemType,
    );
    try {
      await this.loadTestCaseStateOptions(normalizedPayload);
    } catch (err) {
      this.testCaseStateOptions = [];
      this.toastService.warning(
        `No fue posible cargar los estados de Test Case: ${(err as Error).message}`,
        { title: 'Metadata de Test Case no disponible' },
      );
    }
    const payloadWithUserFields = this.restoreUserControlledWorkItemFields(
      normalizedPayload,
      workItemConfig.fields as WorkItemFieldConfig[],
    );
    const result = sanitizeWorkItemPayload(
      payloadWithUserFields,
      workItemConfig.fields as WorkItemFieldConfig[],
      { keepEmptyOptionalFields: false },
    );

    if (result.missingRequiredFields.length > 0) {
      throw new Error(
        `No se puede ${actionLabel}. Faltan campos obligatorios del tipo ${workItemConfig.workItemType}: ${result.missingRequiredFields.join(', ')}.`,
      );
    }

    if (result.removedFields.length > 0) {
      this.toastService.warning(
        `Se omitieron campos no llenados para ${workItemConfig.workItemType}: ${result.removedFields.join(', ')}.`,
      );
    }

    return result.payload;
  }

  private shouldWarnMissingTestPlan(payload: WorkItemPayload): boolean {
    return (
      supportsTestCasesForWorkItemType(
        payload.workItemType || DEFAULT_WORK_ITEM_TYPE,
      ) &&
      (payload.testCases?.length ?? 0) > 0 &&
      Number(payload.testSuite?.planId ?? 0) <= 0
    );
  }

  private applyInitialPrompt(prompt: string): void {
    if (prompt?.trim() && prompt !== this.promptInput) {
      this.promptInput = prompt;
    }
  }

  private requestAutoGeneration(requestId: number): void {
    if (requestId > 0 && requestId !== this.lastAutoGenerateRequest) {
      this.lastAutoGenerateRequest = requestId;
      void this.callBackendGenerate();
    }
  }

  private confirmPreviewReplacement(
    context: 'default' | 'history' = 'default',
  ): Promise<boolean> {
    if (context === 'history') {
      return this.confirmDialog.confirm({
        title: 'Restaurar esta versión',
        message:
          'La previsualización actual será reemplazada por la versión seleccionada. Podrás continuar editándola después de restaurarla.',
        type: 'warning',
        cancelLabel: 'Cancelar',
        confirmLabel: 'Restaurar versión',
      });
    }

    return this.confirmDialog.confirm({
      title: 'Reemplazar la previsualización actual',
      message:
        'La previsualización activa contiene cambios o resultados que se perderán al reemplazarla.',
      detail:
        'Confirma el reemplazo únicamente cuando ya no necesites conservar los ajustes actuales.',
      type: 'warning',
      cancelLabel: 'Conservar actual',
      confirmLabel: 'Reemplazar',
    });
  }

  private hasPreviewReplacementConflict(): boolean {
    if (
      this.previewHasManualChanges ||
      this.createResult !== null ||
      this.refinementCandidate !== null
    ) {
      return true;
    }

    if (!this.parsed) {
      return !!this.rawJson.trim() || !!this.rawResponse.trim();
    }

    return (
      !this.activeHistoryEntry ||
      this.payloadFingerprint(this.parsed) !==
        this.activeHistoryEntry.fingerprint
    );
  }

  private payloadFingerprint(payload: WorkItemPayload): string {
    return this.previewHistory.fingerprint(
      this.normalizePayloadForPreview(payload),
    );
  }

  private isAmbiguousCreateError(error: unknown): boolean {
    const candidate =
      typeof error === 'object' && error !== null
        ? (error as { status?: unknown; code?: unknown; message?: unknown })
        : {};
    const status =
      typeof candidate.status === 'number' ? candidate.status : undefined;

    if (
      status === 0 ||
      status === 408 ||
      status === 429 ||
      (status !== undefined && status >= 500)
    ) {
      return true;
    }

    const code =
      typeof candidate.code === 'string' ? candidate.code.toUpperCase() : '';
    if (
      ['NETWORK_ERROR', 'TIMEOUT', 'REQUEST_TIMEOUT', 'SERVER_ERROR'].includes(
        code,
      )
    ) {
      return true;
    }

    const message =
      typeof candidate.message === 'string'
        ? candidate.message.toLowerCase()
        : '';
    return [
      'timeout',
      'tiempo de espera',
      'demasiado en responder',
      'no fue posible conectar',
      'network',
      'status 0',
      ' 408',
      ' 429',
      'error interno del servicio',
      'service unavailable',
      'bad gateway',
      'gateway timeout',
    ].some((fragment) => message.includes(fragment));
  }

  private clonePayload(payload: WorkItemPayload): WorkItemPayload {
    return JSON.parse(JSON.stringify(payload)) as WorkItemPayload;
  }

  private resolveTestCaseRestoreIndex(
    testCases: TcFields[],
    removed: RemovedTestCase,
  ): number {
    if (removed.nextFingerprint) {
      const nextIndex = testCases.findIndex(
        (testCase) =>
          this.testCaseFingerprint(testCase) === removed.nextFingerprint,
      );
      if (nextIndex >= 0) {
        return nextIndex;
      }
    }

    if (removed.previousFingerprint) {
      const previousIndex = testCases.findIndex(
        (testCase) =>
          this.testCaseFingerprint(testCase) === removed.previousFingerprint,
      );
      if (previousIndex >= 0) {
        return previousIndex + 1;
      }
    }

    return Math.max(0, Math.min(removed.index, testCases.length));
  }

  private testCaseFingerprint(testCase: TcFields): string {
    return JSON.stringify({
      title: stripTestCaseNumberPrefix(testCase.title),
      steps: testCase.steps,
      state: testCase.state,
    });
  }

  updateTestCase(testCaseIndex: number, change: TestCaseEditorChange): void {
    if (
      !this.parsed ||
      this.isCreating ||
      this.refinementCandidate ||
      testCaseIndex < 0 ||
      testCaseIndex >= this.parsed.testCases.length
    ) {
      return;
    }

    const nextCases = [...this.parsed.testCases];
    nextCases[testCaseIndex] = change.testCase;
    this.applyCurrentPayload({
      ...this.parsed,
      testCases: nextCases,
    });
  }

  async addTestCase(): Promise<void> {
    if (!this.ensureRuntimeCredential()) return;
    if (
      !this.parsed ||
      !this.supportsTestCases ||
      this.contentEditingDisabled ||
      this.isAddingTestCase ||
      this.isHistoryMetadataBlockingActions
    ) {
      return;
    }

    this.isAddingTestCase = true;
    let metadataError = '';
    try {
      if (this.testCaseStateOptions.length === 0) {
        await this.loadTestCaseStateOptions(this.parsed);
      }
    } catch (err) {
      metadataError = (err as Error).message;
      this.testCaseStateOptions = [];
    }

    const nextIndex = this.parsed.testCases.length;
    const initialState = selectTestCaseState(this.testCaseStateOptions, '');
    const newTestCase: TcFields = {
      title: '',
      state: initialState,
      steps: [
        {
          action: '',
          expected: '',
        },
      ],
    };
    this.applyCurrentPayload({
      ...this.parsed,
      testCases: [...this.parsed.testCases, newTestCase],
    });
    this.showTestCaseValidation = false;
    this.status =
      'Test Case agregado. Completa sus campos antes de crear el Work Item.';
    this.isAddingTestCase = false;

    setTimeout(() => {
      const titleInput = document.getElementById(
        `test-case-title-${nextIndex}`,
      );
      titleInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      titleInput?.focus();
    });

    if (metadataError || !initialState) {
      this.toastService.warning(
        metadataError
          ? `El Test Case se conservó sin estado porque no fue posible cargar la metadata: ${metadataError}`
          : 'Azure DevOps no devolvió estados válidos. El Test Case se conservó pendiente de selección.',
        { title: 'Completa el estado cuando esté disponible' },
      );
    } else {
      this.toastService.success('Test Case agregado al final de la lista.');
    }
  }

  isValidTestCaseState(state: string): boolean {
    const normalized = state.trim();
    return (
      !!normalized &&
      this.testCaseStateOptions.some((option) => option === normalized)
    );
  }

  private async loadTestCaseStateOptions(
    payload: WorkItemPayload,
  ): Promise<void> {
    if (
      !supportsTestCasesForWorkItemType(
        payload.workItemType || DEFAULT_WORK_ITEM_TYPE,
      )
    ) {
      this.testCaseStateOptions = [];
      return;
    }

    const testCaseConfig = await this.api.fetchWorkItemConfig(
      payload.azdoProject,
      'Test Case',
    );
    this.testCaseStateOptions = this.extractTestCaseStateOptions(
      testCaseConfig.fields,
    );
  }

  private async prepareRefinementMetadata(
    basePayload: WorkItemPayload,
    baseFingerprint: string,
    requestId: number,
    forceRefresh: boolean,
  ): Promise<void> {
    try {
      const workItemConfig = await this.api.fetchWorkItemConfig(
        basePayload.azdoProject,
        basePayload.workItemType || DEFAULT_WORK_ITEM_TYPE,
        undefined,
        forceRefresh,
      );
      if (
        requestId !== this.refinementMetadataRequestId ||
        !this.showRefinementModal
      ) {
        return;
      }
      if (
        !this.parsed ||
        this.payloadFingerprint(this.parsed) !== baseFingerprint
      ) {
        this.currentWorkItemFields = [];
        this.refinementFields = [];
        this.contentMetadataState = 'error';
        this.refinementPreparationError =
          'La versión actual cambió mientras se validaban los campos. Reintenta con el contenido vigente.';
        return;
      }

      this.applyContentMetadata(
        workItemConfig.fields,
        basePayload.workItemType,
      );
      this.refinementFields = getAvailableRefinementFields(
        this.currentWorkItemFields,
        basePayload.workItem,
        this.contentMetadataState,
      );
      this.refinementUsingFallback = !hasCompleteWorkItemContentMetadata(
        this.currentWorkItemFields,
      );
      if (this.refinementFields.length === 0) {
        this.refinementPreparationError =
          'No hay campos de contenido disponibles de forma segura para este Work Item.';
      }
    } catch (err) {
      if (
        requestId !== this.refinementMetadataRequestId ||
        !this.showRefinementModal
      ) {
        return;
      }

      this.currentWorkItemFields = [];
      this.contentMetadataState = 'error';
      this.refinementFields = getAvailableRefinementFields(
        [],
        basePayload.workItem,
        this.contentMetadataState,
      );
      this.refinementUsingFallback = false;
      this.refinementPreparationError =
        'Puedes reintentar la consulta o continuar con los campos de contenido disponibles en esta versión.';
      this.configureContentValidators();
    } finally {
      if (
        requestId === this.refinementMetadataRequestId &&
        this.showRefinementModal
      ) {
        this.isPreparingRefinement = false;
      }
    }
  }

  private createRestorableHistorySnapshot(
    item: PreviewHistoryItem,
  ): WorkItemPayload {
    if (
      !item?.id?.trim() ||
      !item.normalizedJson?.trim() ||
      !isRestorableHistoryPayload(item.payload)
    ) {
      throw new Error('Invalid history snapshot.');
    }

    let serializedSnapshot: unknown;
    try {
      serializedSnapshot = JSON.parse(item.normalizedJson);
    } catch {
      throw new Error('Invalid serialized history snapshot.');
    }
    if (!isRestorableHistoryPayload(serializedSnapshot)) {
      throw new Error('Invalid serialized history payload.');
    }

    const snapshot = this.cloneHistoryPayload(item.payload);
    return this.normalizePayloadForPreview({
      ...snapshot,
      workItemType: snapshot.workItemType?.trim() || DEFAULT_WORK_ITEM_TYPE,
      testCases: snapshot.testCases ?? [],
      testSuite: snapshot.testSuite ?? { planId: 0 },
    });
  }

  private async refreshRestoredHistoryMetadata(
    snapshot: WorkItemPayload,
    entryId: string,
    operationId: number,
    forceRefresh: boolean,
  ): Promise<boolean> {
    if (!this.hasRuntimeCredential) {
      this.currentWorkItemFields = [];
      this.contentMetadataState = 'idle';
      this.testCaseStateOptions = [];
      this.configureContentValidators();
      this.historyRestoreState = {
        entryId,
        phase: 'metadataWarning',
        operationId,
        message: '',
        detail:
          'Ingresa tu Azure PAT en Configuración Azure para actualizar la metadata. La versión local permanece disponible.',
        canRetryMetadata: true,
        isInitialLoad: this.historyRestoreState.isInitialLoad,
      };
      return false;
    }
    const supportsTestCases = supportsTestCasesForWorkItemType(
      snapshot.workItemType || DEFAULT_WORK_ITEM_TYPE,
    );
    const workItemConfigRequest = this.api.fetchWorkItemConfig(
      snapshot.azdoProject,
      snapshot.workItemType || DEFAULT_WORK_ITEM_TYPE,
      undefined,
      forceRefresh,
    );
    const testCaseConfigRequest = supportsTestCases
      ? this.api.fetchWorkItemConfig(
          snapshot.azdoProject,
          'Test Case',
          undefined,
          forceRefresh,
        )
      : Promise.resolve(null);
    const [workItemConfigResult, testCaseConfigResult] =
      await Promise.allSettled([workItemConfigRequest, testCaseConfigRequest]);

    if (!this.isCurrentHistoryRestore(operationId, entryId)) {
      return false;
    }
    if (!this.matchesHistoryRestoreContext(snapshot)) {
      this.historyRestoreState = createIdleHistoryRestoreState(operationId);
      return false;
    }

    const warningDetails: string[] = [];
    if (workItemConfigResult.status === 'fulfilled') {
      this.applyContentMetadata(
        workItemConfigResult.value.fields,
        snapshot.workItemType,
      );
      if (
        !hasCompleteWorkItemContentMetadata(workItemConfigResult.value.fields)
      ) {
        warningDetails.push(
          'La configuración de contenido recibida está incompleta.',
        );
      }
    } else {
      this.currentWorkItemFields = [];
      this.contentMetadataState = 'error';
      this.configureContentValidators();
      warningDetails.push(
        'No se pudo actualizar la configuración del Work Item.',
      );
    }

    if (!supportsTestCases) {
      this.testCaseStateOptions = [];
    } else if (
      testCaseConfigResult.status === 'fulfilled' &&
      testCaseConfigResult.value
    ) {
      this.testCaseStateOptions = this.extractTestCaseStateOptions(
        testCaseConfigResult.value.fields,
      );
      if (this.testCaseStateOptions.length === 0) {
        warningDetails.push(
          'Azure DevOps no devolvió estados disponibles para Test Case.',
        );
      } else {
        const allowedStates = new Set(
          this.testCaseStateOptions.map((state) => state.toLowerCase()),
        );
        const unavailableStates = [
          ...new Set(
            (this.parsed?.testCases ?? [])
              .map((testCase) => testCase.state.trim())
              .filter(
                (state) => state && !allowedStates.has(state.toLowerCase()),
              ),
          ),
        ];
        if (unavailableStates.length > 0) {
          warningDetails.push(
            `Estados históricos no disponibles actualmente: ${unavailableStates.join(', ')}.`,
          );
        }
      }
    } else {
      this.testCaseStateOptions = [];
      warningDetails.push(
        'No se pudieron actualizar los estados de Test Case.',
      );
    }

    const hasWarnings = warningDetails.length > 0;
    this.historyRestoreState = {
      entryId,
      phase: hasWarnings ? 'metadataWarning' : 'completed',
      operationId,
      message: '',
      detail: warningDetails.join(' '),
      canRetryMetadata: hasWarnings,
      isInitialLoad: this.historyRestoreState.isInitialLoad,
    };
    return !hasWarnings;
  }

  private extractTestCaseStateOptions(
    fields: readonly WorkItemFieldConfig[],
  ): string[] {
    const metadataStates =
      fields.find(
        (field) => field.referenceName.toLowerCase() === 'system.state',
      )?.options ?? [];
    return [
      ...new Set(metadataStates.map((state) => state.trim()).filter(Boolean)),
    ];
  }

  private ensureRuntimeCredential(): boolean {
    if (this.hasRuntimeCredential) return true;
    this.status = '';
    this.error = 'Ingresa tu Azure PAT en Configuración Azure para continuar.';
    return false;
  }

  private isCurrentHistoryRestore(
    operationId: number,
    entryId: string,
  ): boolean {
    return (
      !this.componentDestroyed &&
      this.historyRestoreState.operationId === operationId &&
      this.historyRestoreState.entryId === entryId
    );
  }

  private matchesHistoryRestoreContext(snapshot: WorkItemPayload): boolean {
    return (
      !!this.parsed &&
      this.parsed.azdoProject.trim().toLowerCase() ===
        snapshot.azdoProject.trim().toLowerCase() &&
      this.workItemTypeKey(this.parsed.workItemType) ===
        this.workItemTypeKey(snapshot.workItemType)
    );
  }

  private navigateToRestoredWorkItem(
    operationId: number,
    entryId: string,
  ): Promise<boolean> {
    return new Promise((resolve) =>
      requestAnimationFrame(() => {
        if (!this.isCurrentHistoryRestore(operationId, entryId)) {
          resolve(false);
          return;
        }

        const target = this.previewWorkItemStart?.nativeElement;
        if (target) {
          const reducedMotion =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({
            behavior: reducedMotion ? 'auto' : 'smooth',
            block: 'start',
          });
          target.focus({ preventScroll: true });
        }
        resolve(true);
      }),
    );
  }

  private scheduleRestoreFocus(element: HTMLElement | null): void {
    if (!element) {
      return;
    }
    if (this.historyRestoreFocusFrame !== null) {
      cancelAnimationFrame(this.historyRestoreFocusFrame);
    }
    this.historyRestoreFocusFrame = requestAnimationFrame(() => {
      this.historyRestoreFocusFrame = null;
      if (element.isConnected) {
        element.focus();
      }
    });
  }

  private scheduleRestoreErrorFocus(
    entryId: string,
    fallback: HTMLElement | null,
  ): void {
    if (this.historyRestoreFocusFrame !== null) {
      cancelAnimationFrame(this.historyRestoreFocusFrame);
    }
    this.historyRestoreFocusFrame = requestAnimationFrame(() => {
      this.historyRestoreFocusFrame = null;
      const errorElement = document.getElementById(
        `history-restore-error-${entryId}`,
      );
      if (errorElement) {
        errorElement.focus();
      } else if (fallback?.isConnected) {
        fallback.focus();
      }
    });
  }

  private invalidateHistoryRestore(): void {
    const operationId = ++this.historyRestoreOperationId;
    this.historyRestoreState = createIdleHistoryRestoreState(operationId);
    this.historyRestoreMetadataPromise = null;
    if (this.historyRestoreFocusFrame !== null) {
      cancelAnimationFrame(this.historyRestoreFocusFrame);
      this.historyRestoreFocusFrame = null;
    }
  }

  private cloneHistoryPayload(payload: WorkItemPayload): WorkItemPayload {
    return structuredClone(payload);
  }

  private resetRefinementState(clearMetadata = false): void {
    this.refinementMetadataRequestId++;
    this.refinementGenerationRequestId++;
    this.showRefinementModal = false;
    this.isPreparingRefinement = false;
    this.isRefining = false;
    this.refinementError = '';
    this.refinementPreparationError = '';
    this.refinementUsingFallback = false;
    this.refinementFields = [];
    this.refinementCandidate = null;
    this.showCurrentTestCaseComparison = false;
    if (clearMetadata) {
      this.currentWorkItemFields = [];
      this.contentMetadataState = 'idle';
      this.acceptanceCriteriaSupportedTypes.clear();
      this.testCaseStateOptions = [];
      this.configureContentValidators();
    }
  }

  private applyContentMetadata(
    fields: readonly WorkItemFieldConfig[],
    workItemType: string | undefined,
  ): void {
    this.currentWorkItemFields = [...fields];
    this.contentMetadataState = 'loaded';
    if (
      resolveWorkItemContentCapability(
        fields,
        'acceptanceCriteria',
        'loaded',
      ) === 'supported'
    ) {
      this.acceptanceCriteriaSupportedTypes.add(
        this.workItemTypeKey(workItemType),
      );
    }
    this.configureContentValidators();
  }

  private get currentWorkItemTypeKey(): string {
    return this.workItemTypeKey(this.parsed?.workItemType);
  }

  private workItemTypeKey(workItemType: string | undefined): string {
    return (workItemType || DEFAULT_WORK_ITEM_TYPE).trim().toLowerCase();
  }

  private hasOwnField(
    value: object | null | undefined,
    field: string,
  ): boolean {
    return !!value && Object.prototype.hasOwnProperty.call(value, field);
  }

  failureDisplayMessage(failure: {
    index: number;
    message: string;
    phase: string;
  }): string {
    if (failure.phase !== 'state-update') return failure.message;
    const created = this.createResult?.createdTestCases?.find(
      (testCase) => testCase.index === failure.index,
    );
    if (!created?.initialState || !created.requestedState)
      return failure.message;
    return `El Test Case fue creado y procesado para la suite, pero permaneció en el estado ${created.initialState} porque Azure DevOps rechazó el cambio a ${created.requestedState}. ${failure.message}`;
  }
}
