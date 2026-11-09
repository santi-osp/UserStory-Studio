import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AzdoConfigService } from '../../services/azdo-config.service';
import { ApiService } from '../../services/api.service';
import {
  AzdoMetadataResult,
  ProjectMetadata,
  WorkItemConfigResult,
  WorkItemFieldConfig,
  TestPlanSummary,
  WorkItemPayload,
} from '../../models/types';
import { WorkItemPromptContract } from '../../prompts/work-items';
import { SearchableSelectOption } from '../shared/searchable-select/searchable-select.component';
import { formatAzdoPathLabel, normalizeAzdoPath } from '../../utils/azdo-path';
import {
  DEFAULT_WORK_ITEM_TYPE,
  WorkItemTypeOption,
  WORK_ITEM_TYPE_OPTIONS,
  getWorkItemTypeOption,
  resolveWorkItemType,
  requireSupportedWorkItemType,
  supportsTestCasesForWorkItemType,
} from '../../utils/work-item-type';
import { hasCompleteWorkItemContentMetadata } from '../../utils/work-item-content-metadata';
import { BROWSER_STORAGE_KEYS } from '../../config/browser-storage-keys';
import { UI_TIMINGS } from '../../config/ui-timings';
import {
  safeGetSessionItem,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetSessionItem,
} from '../../utils/browser-storage';
import {
  AZDO_STATE_REFERENCE_NAME,
  AZDO_TEST_CASE_WORK_ITEM_TYPE,
  selectTestCaseState,
} from '../../utils/azure-devops-invariants';
import { WorkItemWorkspaceStateService } from '../../services/work-item-workspace-state.service';
import { FeedbackMessageComponent } from '../shared/ui/feedback-message/feedback-message.component';
import { PageHeaderComponent } from '../shared/ui/page-header/page-header.component';
import { SectionCardComponent } from '../shared/ui/section-card/section-card.component';
import { ToastService } from '../../services/toast.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import {
  AiRequestValidationService,
  AiVisibleRequiredField,
} from '../../services/ai-request-validation.service';
import { RequiredFieldMarkerComponent } from '../shared/ui/required-field-marker/required-field-marker.component';
import { WorkItemPromptBuilderService } from '../../services/work-item-prompt-builder.service';
import { WorkItemDynamicFieldsFormComponent } from '../shared/work-item-dynamic-fields-form/work-item-dynamic-fields-form.component';
import { FieldValidationMessageComponent } from '../shared/ui/field-validation-message/field-validation-message.component';
import { FormValidationIssue } from '../../models/form-validation';
import { FormValidationOrchestratorService } from '../../services/form-validation-orchestrator.service';
import {
  CatalogLoadState,
  TestCaseGenerationControls,
  TestCaseQuantityMode,
  WorkItemDestinationControls,
} from '../../models/work-item-generation-form';
import { WorkItemDestinationFieldsComponent } from '../shared/work-item-destination-fields/work-item-destination-fields.component';
import { WorkItemTypeSelectorComponent } from '../shared/work-item-type-selector/work-item-type-selector.component';
import { TestCaseGenerationSettingsComponent } from '../shared/test-case-generation-settings/test-case-generation-settings.component';
import { LoadingSpinnerComponent } from '../shared/ui/loading-spinner/loading-spinner.component';
import {
  configureTestCaseCountControl,
  configureTestPlanControl,
  mapTestPlanIdForPayload,
  normalizeTestCaseCount,
  normalizeTestPlanId,
} from '../../utils/test-case-generation-form';
import { getAzureConnectionMessage } from '../../utils/azure-connection-message';
import {
  collectDynamicWorkItemFields,
  collectSanitizedDynamicWorkItemFields,
  dynamicWorkItemControlName,
  dynamicWorkItemInputStep,
  dynamicWorkItemInputType,
  getMissingRequiredDynamicWorkItemFields,
  isDynamicCheckboxField,
  isDynamicSelectField,
  isDynamicTextareaField,
  removeDynamicWorkItemControls,
  shouldRenderDynamicWorkItemField,
  syncDynamicWorkItemControls,
  WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX,
} from '../../utils/work-item-dynamic-fields';

interface WorkItemJsonBuilderPersistedState {
  formValues: {
    sourceWorkItemText: string;
    azdoProject: string;
    workItemType: string;
    iterationPath: string;
    areaPath: string;
    useTestCases: boolean;
    tcCount: number;
    tcState: string;
    aiCantidadTestcases: boolean;
    testSuitePlanId: number | null;
    dynamicWorkItemFields: Record<string, unknown>;
  };
  prompt: string;
}

@Component({
  selector: 'app-work-item-json-builder',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FeedbackMessageComponent,
    PageHeaderComponent,
    SectionCardComponent,
    RequiredFieldMarkerComponent,
    WorkItemDynamicFieldsFormComponent,
    FieldValidationMessageComponent,
    WorkItemDestinationFieldsComponent,
    WorkItemTypeSelectorComponent,
    TestCaseGenerationSettingsComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './work-item-json-builder.component.html',
})
export class WorkItemJsonBuilderComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  prompt = '';
  systemPrompt = '';
  jsonTemplate: object | null = null;
  private generationContract: WorkItemPromptContract | null = null;
  message = '';
  dynamicValidationMessages: Record<string, string> = {};
  validationIssues: FormValidationIssue[] = [];
  isSubmittingPreview = false;
  error = '';
  warning = '';

  projectOptions: string[] = [];
  areaPathOptions: string[] = [];
  iterationPathOptions: string[] = [];
  dynamicFieldConfigs: WorkItemFieldConfig[] = [];

  isLoadingWorkItemConfig = false;
  workItemConfigMessage = '';
  workItemConfigError = '';
  testPlanOptions: TestPlanSummary[] = [];
  isLoadingTestPlans = false;
  testPlansMessage = '';
  testPlansError = '';
  testPlanCatalogState: CatalogLoadState = 'idle';
  submitAttempted = false;
  readonly workItemTypeOptions = WORK_ITEM_TYPE_OPTIONS;
  tcStateOptions: string[] = [];
  readonly dynamicControlPrefix = WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX;
  destinationControls!: WorkItemDestinationControls;
  testCaseControls!: TestCaseGenerationControls;

  private readonly subscriptions = new Subscription();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private workItemConfigRefreshTimer: ReturnType<typeof setTimeout> | null =
    null;
  private projectMetadata: ProjectMetadata[] = [];
  private flatAreaPathOptions: string[] = [];
  private flatIterationPathOptions: string[] = [];
  private workItemConfig: WorkItemConfigResult | null = null;
  private pendingDynamicWorkItemFieldValues: Record<string, unknown> = {};
  private lastWorkItemConfigKey = '';
  private testPlanRequestVersion = 0;
  private workItemConfigRequestVersion = 0;
  private destroyed = false;
  private readonly workItemJsonBuilderStorageKey =
    BROWSER_STORAGE_KEYS.workItemJsonBuilderState;
  private readonly workItemConfigRefreshDelayMs =
    UI_TIMINGS.workItemConfigRefreshDelayMs;
  private readonly stateSaveDebounceMs = UI_TIMINGS.stateSaveDebounceMs;

  constructor(
    private fb: FormBuilder,
    private azdoConfigService: AzdoConfigService,
    private apiService: ApiService,
    private workspaceState: WorkItemWorkspaceStateService,
    private toastService: ToastService,
    private confirmDialog: ConfirmDialogService,
    private aiRequestValidation: AiRequestValidationService,
    private workItemPromptBuilder: WorkItemPromptBuilderService,
    private router: Router,
    private formValidation: FormValidationOrchestratorService = new FormValidationOrchestratorService(
      document,
    ),
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      sourceWorkItemText: ['', [Validators.required]],
      azdoProject: ['', [Validators.required]],
      workItemType: [DEFAULT_WORK_ITEM_TYPE],
      iterationPath: ['', [Validators.required]],
      areaPath: ['', [Validators.required]],
      useTestCases: [true],
      tcCount: [3],
      tcState: [''],
      ai: this.fb.group({
        cantidadTestcases: ['fixed' as TestCaseQuantityMode],
      }),
      testSuitePlanId: [null],
    });

    this.destinationControls = {
      project: this.getRequiredFormControl('azdoProject') as FormControl<
        string | null
      >,
      areaPath: this.getRequiredFormControl('areaPath') as FormControl<
        string | null
      >,
      iterationPath: this.getRequiredFormControl(
        'iterationPath',
      ) as FormControl<string | null>,
      workItemType: this.getRequiredFormControl('workItemType') as FormControl<
        string | null
      >,
    };
    this.testCaseControls = {
      enabled: this.getRequiredFormControl('useTestCases') as FormControl<
        boolean | null
      >,
      quantityMode: this.getRequiredFormControl(
        'ai.cantidadTestcases',
      ) as FormControl<TestCaseQuantityMode>,
      quantity: this.getRequiredFormControl('tcCount') as FormControl<
        number | null
      >,
      state: this.getRequiredFormControl('tcState') as FormControl<
        string | null
      >,
      testPlanId: this.getRequiredFormControl('testSuitePlanId') as FormControl<
        number | null
      >,
    };

    this.restoreState();
    this.form.patchValue(
      {
        workItemType: resolveWorkItemType(
          this.form.value.workItemType || DEFAULT_WORK_ITEM_TYPE,
        ),
      },
      { emitEvent: false },
    );
    this.normalizePathControl('iteration');
    this.normalizePathControl('area');

    this.applyMetadata(this.azdoConfigService.getMetadataSnapshot());
    this.warning = this.isAzdoConfigured
      ? ''
      : 'Primero debes guardar organización y PAT en Configuración Azure.';

    const contextSub = this.azdoConfigService.context$.subscribe(
      (nextContext) => {
        this.warning = this.isAzdoConfigured
          ? ''
          : 'Primero debes guardar organización y PAT en Configuración Azure.';

        if (!this.isAzdoConfigured) {
          this.workItemConfigRequestVersion++;
          this.testPlanRequestVersion++;
          this.clearGeneratedPrompt();
          this.clearWorkItemConfig(true);
          this.lastWorkItemConfigKey = '';
          this.testPlanOptions = [];
          this.testPlanCatalogState = 'error';
          this.syncTestCaseRules();
          return;
        }

        this.scheduleWorkItemConfigRefresh(0);
        void this.refreshTestPlans();
      },
    );

    const metadataSub = this.azdoConfigService.metadata$.subscribe(
      (metadata) => {
        this.applyMetadata(metadata);
      },
    );

    const projectSub = this.form
      .get('azdoProject')
      ?.valueChanges.subscribe((value) => {
        this.updatePathOptions(this.normalizeText(value));
        this.clearWorkItemConfig(false);
        this.lastWorkItemConfigKey = '';
        this.form.patchValue({ testSuitePlanId: null }, { emitEvent: false });
        this.scheduleWorkItemConfigRefresh();
        void this.refreshTestPlans();
      });

    const workItemTypeSub = this.form
      .get('workItemType')
      ?.valueChanges.subscribe((value) => {
        const normalizedType = resolveWorkItemType(
          value || DEFAULT_WORK_ITEM_TYPE,
        );
        if (!this.isSameText(this.form.value.workItemType, normalizedType)) {
          this.form.patchValue(
            { workItemType: normalizedType },
            { emitEvent: false },
          );
        }

        if (
          !supportsTestCasesForWorkItemType(normalizedType) &&
          this.useTestCases
        ) {
          this.form.patchValue(
            {
              useTestCases: false,
              ai: { cantidadTestcases: 'fixed' },
              testSuitePlanId: null,
            },
            { emitEvent: false },
          );
        }

        this.lastWorkItemConfigKey = '';
        this.clearWorkItemConfig(false);
        this.syncTestCaseRules();
        this.scheduleWorkItemConfigRefresh();
      });

    const useTestCasesSub = this.form
      .get('useTestCases')
      ?.valueChanges.subscribe(() => this.syncTestCaseRules());
    const aiCountSub = this.form
      .get('ai.cantidadTestcases')
      ?.valueChanges.subscribe(() => this.syncTestCaseRules());
    this.subscriptions.add(contextSub);
    this.subscriptions.add(metadataSub);
    if (projectSub) {
      this.subscriptions.add(projectSub);
    }
    if (workItemTypeSub) {
      this.subscriptions.add(workItemTypeSub);
    }
    if (useTestCasesSub) this.subscriptions.add(useTestCasesSub);
    if (aiCountSub) this.subscriptions.add(aiCountSub);
    this.syncTestCaseRules();

    const formSub = this.form.valueChanges.subscribe(() => {
      this.error = '';
      this.message = '';
      this.reconcileValidationIssues();
      this.scheduleSave();
    });
    this.subscriptions.add(formSub);

    if (
      this.isAzdoConfigured &&
      this.normalizeText(this.form.value.azdoProject)
    ) {
      this.scheduleWorkItemConfigRefresh(0);
      void this.refreshTestPlans();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.testPlanRequestVersion++;
    this.workItemConfigRequestVersion++;
    this.flushPendingStateSave();

    if (this.workItemConfigRefreshTimer) {
      clearTimeout(this.workItemConfigRefreshTimer);
    }

    this.subscriptions.unsubscribe();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.normalizePathControl('iteration');
    this.normalizePathControl('area');
  }

  get projectSelectOptions(): SearchableSelectOption[] {
    return this.projectOptions.map((project) => ({
      value: project,
      label: project,
    }));
  }

  get iterationSelectOptions(): SearchableSelectOption[] {
    return this.iterationPathOptions.map((path) => ({
      value: path,
      label: this.formatPathLabel(path, 'iteration'),
    }));
  }

  get areaSelectOptions(): SearchableSelectOption[] {
    return this.areaPathOptions.map((path) => ({
      value: path,
      label: this.formatPathLabel(path, 'area'),
    }));
  }

  get testPlanSelectOptions(): SearchableSelectOption[] {
    return this.testPlanOptions.map((plan) => ({
      value: plan.id,
      label: `${plan.id} - ${plan.name}`,
    }));
  }

  get isAzdoConfigured(): boolean {
    const context = this.azdoConfigService.getContextSnapshot();
    return (
      !!context.organization.trim() &&
      this.azdoConfigService.hasRuntimeCredential()
    );
  }

  get azureConnectionMessage(): string {
    return getAzureConnectionMessage(
      this.azdoConfigService.getOrganization(),
      this.azdoConfigService.hasRuntimeCredential(),
    );
  }

  get useTestCases(): boolean {
    return !!this.getFormControl('useTestCases')?.value;
  }

  get selectedWorkItemType(): WorkItemTypeOption {
    return getWorkItemTypeOption(this.form?.value?.workItemType);
  }

  get supportsTestCasesForSelectedType(): boolean {
    return supportsTestCasesForWorkItemType(this.form?.value?.workItemType);
  }

  get isWorkItemMetadataReady(): boolean {
    return !!this.workItemConfig;
  }

  get aiDecidesTestCaseCount(): boolean {
    return this.getFormControl('ai.cantidadTestcases')?.value === 'ai';
  }

  get canEditManualTestCaseCount(): boolean {
    return this.useTestCases && !this.aiDecidesTestCaseCount;
  }

  get canGeneratePrompt(): boolean {
    if (!this.form || !this.isAzdoConfigured || this.form.invalid) {
      return false;
    }

    if (!this.supportsTestCasesForSelectedType || !this.useTestCases) {
      return true;
    }

    if (
      !this.aiDecidesTestCaseCount &&
      this.normalizeTestCaseCount(this.form.value.tcCount) <= 0
    ) {
      return false;
    }

    return true;
  }

  isAiFieldRequired(fieldKey: AiVisibleRequiredField): boolean {
    return this.aiRequestValidation.isFieldRequired(
      'work-item-json-generation',
      fieldKey,
    );
  }

  generateResults(): void {
    this.sendToAi();
  }

  async resetForm(): Promise<void> {
    if (this.hasResettableContent()) {
      const confirmed = await this.confirmDialog.confirm({
        title: 'Reiniciar formulario',
        message:
          'Se eliminarán el texto, la configuración del formulario y los resultados generados.',
        detail:
          'Esta acción no afecta la configuración global de Azure DevOps.',
        type: 'danger',
        cancelLabel: 'Conservar datos',
        confirmLabel: 'Reiniciar formulario',
      });

      if (!confirmed) {
        return;
      }
    }

    this.performFormReset();
  }

  private performFormReset(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    this.form.patchValue(
      {
        sourceWorkItemText: '',
        azdoProject: '',
        workItemType: DEFAULT_WORK_ITEM_TYPE,
        iterationPath: '',
        areaPath: '',
        useTestCases: true,
        tcCount: 3,
        tcState: '',
        ai: { cantidadTestcases: 'fixed' },
        testSuitePlanId: null,
      },
      { emitEvent: false },
    );

    this.pendingDynamicWorkItemFieldValues = {};
    this.clearWorkItemConfig(false);
    this.lastWorkItemConfigKey = '';
    this.testPlanOptions = [];
    this.testPlansMessage = '';
    this.testPlansError = '';
    this.prompt = '';
    this.jsonTemplate = null;
    this.generationContract = null;
    this.error = '';
    this.message = '';
    this.dynamicValidationMessages = {};
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.workspaceState.setPrompt('', 'work-item-json-builder');
    safeRemoveSessionItem(this.workItemJsonBuilderStorageKey);
    safeRemoveLocalItem(this.workItemJsonBuilderStorageKey);
    this.toastService.info('Formulario reiniciado.');
  }

  private hasResettableContent(): boolean {
    if (this.prompt.trim() || this.jsonTemplate !== null) {
      return true;
    }

    const v = this.form.getRawValue();
    const hasDynamicValues = Object.values(
      this.collectDynamicWorkItemFields(),
    ).some((value) => {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'number') {
        return value !== 0;
      }

      return (
        value !== null && value !== undefined && String(value).trim() !== ''
      );
    });

    return (
      this.normalizeText(v.sourceWorkItemText) !== '' ||
      this.normalizeText(v.azdoProject) !== '' ||
      resolveWorkItemType(v.workItemType || DEFAULT_WORK_ITEM_TYPE) !==
        DEFAULT_WORK_ITEM_TYPE ||
      this.normalizeText(v.iterationPath) !== '' ||
      this.normalizeText(v.areaPath) !== '' ||
      v.useTestCases !== true ||
      Number(v.tcCount ?? 3) !== 3 ||
      !!this.normalizeText(v.tcState) ||
      v.ai?.cantidadTestcases === 'ai' ||
      normalizeTestPlanId(v.testSuitePlanId) !== null ||
      hasDynamicValues
    );
  }

  dynamicControlName(field: WorkItemFieldConfig): string {
    return dynamicWorkItemControlName(
      field,
      WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX,
    );
  }

  useDynamicSelectControl(field: WorkItemFieldConfig): boolean {
    return isDynamicSelectField(field);
  }

  isDynamicTextareaControl(field: WorkItemFieldConfig): boolean {
    return isDynamicTextareaField(field);
  }

  isDynamicCheckboxControl(field: WorkItemFieldConfig): boolean {
    return isDynamicCheckboxField(field);
  }

  dynamicInputType(
    field: WorkItemFieldConfig,
  ): 'text' | 'number' | 'date' | 'datetime-local' {
    return dynamicWorkItemInputType(field);
  }

  dynamicInputStep(field: WorkItemFieldConfig): string | null {
    return dynamicWorkItemInputStep(field);
  }

  formatPathLabel(path: string, kind: 'iteration' | 'area'): string {
    return formatAzdoPathLabel(path, kind);
  }

  private generatePromptFromForm(manualTrigger: boolean): void {
    this.error = '';
    this.submitAttempted = manualTrigger;
    this.syncTestCaseRules();
    if (manualTrigger) {
      this.message = '';
    }

    if (!this.isAzdoConfigured) {
      this.clearGeneratedPrompt();
      if (manualTrigger) {
        this.error =
          'Configura organización y PAT en Configuración Azure antes de continuar.';
      }
      return;
    }

    const useTestCases = this.useTestCases;
    const effectiveUseTestCases =
      this.supportsTestCasesForSelectedType && useTestCases;
    const aiDecidesTestCaseCount = this.aiDecidesTestCaseCount;
    const testCaseCount = this.normalizeTestCaseCount(this.form.value.tcCount);
    const testCaseState = this.normalizeText(this.form.value.tcState);

    if (
      effectiveUseTestCases &&
      !aiDecidesTestCaseCount &&
      testCaseCount <= 0
    ) {
      this.clearGeneratedPrompt();
      if (manualTrigger) {
        this.error = 'La cantidad manual de test cases debe ser mayor a 0.';
      }
      return;
    }

    if (
      effectiveUseTestCases &&
      !this.tcStateOptions.some((option) => option === testCaseState)
    ) {
      this.clearGeneratedPrompt();
      if (manualTrigger) {
        this.error = 'Selecciona un estado real disponible para Test Case.';
      }
      return;
    }

    if (this.form.invalid) {
      this.clearGeneratedPrompt();
      if (manualTrigger) {
        this.form.markAllAsTouched();
        this.error =
          'Completa los campos requeridos para preparar la vista previa.';
      }
      return;
    }

    const selectedPlanId = normalizeTestPlanId(
      this.testCaseControls.testPlanId.value,
    );
    if (
      effectiveUseTestCases &&
      (selectedPlanId === null ||
        !this.testPlanOptions.some((option) => option.id === selectedPlanId))
    ) {
      this.clearGeneratedPrompt();
      if (manualTrigger && this.testPlanCatalogState !== 'loading') {
        this.testCaseControls.testPlanId.markAsTouched();
        this.error =
          'Selecciona un Test Plan disponible para el proyecto actual.';
      }
      return;
    }

    const dynamicWorkItemFields = this.collectPayloadDynamicWorkItemFields();
    const workItemType = requireSupportedWorkItemType(
      this.form.value.workItemType,
    );
    const planId = mapTestPlanIdForPayload(
      effectiveUseTestCases,
      this.testCaseControls.testPlanId.value,
      this.testPlanOptions,
    );

    const result = this.workItemPromptBuilder.buildCreateJsonPrompt({
      sourceWorkItemText: this.normalizeText(
        this.form.value.sourceWorkItemText,
      ),
      azdoOrg: this.azdoConfigService.getContextSnapshot().organization,
      azdoProject: this.normalizeText(this.form.value.azdoProject),
      workItemType,
      iterationPath: normalizeAzdoPath(
        this.form.value.iterationPath,
        'iteration',
      ),
      areaPath: normalizeAzdoPath(this.form.value.areaPath, 'area'),
      useTestCases: effectiveUseTestCases,
      testCaseCount,
      testCaseState,
      aiDecideTestCaseCount: aiDecidesTestCaseCount,
      testSuitePlanId: planId,
      dynamicWorkItemFields,
      workItemFieldConfigs: this.workItemConfig?.fields ?? [],
    });

    this.prompt = result.prompt;
    this.systemPrompt = result.systemPrompt;
    this.jsonTemplate = result.jsonTemplate;
    this.generationContract = result.contract;
    if (manualTrigger) {
      this.message =
        'Propuesta preparada. Puedes revisarla en Previsualizar Work Item.';
    }
    this.workspaceState.setPrompt(
      this.prompt,
      'work-item-json-builder',
      this.systemPrompt,
    );
    this.persistState();
  }

  async sendToAi(): Promise<void> {
    if (this.isSubmittingPreview) return;
    this.submitAttempted = true;
    this.error = '';
    this.message = '';
    if (!this.validateGenerationRequest()) return;

    this.isSubmittingPreview = true;
    try {
      this.prompt = '';
      this.systemPrompt = '';
      this.jsonTemplate = null;
      this.generationContract = null;
      this.generatePromptFromForm(true);
      if (!this.prompt.trim())
        throw new Error('No fue posible preparar la solicitud.');
      this.workspaceState.preparePreview(
        this.prompt,
        'work-item-json-builder',
        this.toPreviewBasePayload(this.jsonTemplate),
        this.generationContract ?? undefined,
      );
      const navigated = await this.router.navigate([
        '/previsualizar-work-item',
      ]);
      if (!navigated)
        throw new Error('No fue posible abrir la vista previa.');
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Inténtalo nuevamente.';
    } finally {
      this.isSubmittingPreview = false;
    }
  }

  private validateGenerationRequest(): boolean {
    this.syncTestCaseRules();

    const missingDynamicFields = this.getMissingRequiredDynamicFields();
    const validation = this.aiRequestValidation.validate(
      'work-item-json-generation',
      {
        ...this.getAiValidationContext(),
        missingRequiredDynamicFields: missingDynamicFields.map((field) => ({
          referenceName: field.referenceName,
          label: field.label || field.name || field.referenceName,
        })),
      },
    );

    if (!validation.allowed) {
      this.formValidation.markAttempt(this.form);
      this.applyAiValidationFeedback(validation.message, validation.issues);
      return false;
    }

    if (!hasCompleteWorkItemContentMetadata(this.workItemConfig?.fields)) {
      this.error = this.isLoadingWorkItemConfig
        ? 'Espera a que terminen de cargar los campos del Work Item.'
        : 'Actualiza los campos disponibles: deben existir título y descripción para generar.';
      return false;
    }

    const effectiveUseTestCases =
      this.supportsTestCasesForSelectedType && this.useTestCases;
    if (effectiveUseTestCases && this.testCaseControls.quantity.invalid) {
      this.testCaseControls.quantity.markAsTouched();
      this.error = 'Ingresa una cantidad válida de Test Cases.';
      this.formValidation.focusFirst([
        {
          key: 'tcCount',
          type: 'required',
          message: this.error,
          controlId: 'work-item-json-count',
          order: 50,
          section: 'test-cases',
          source: 'ai-preflight',
        },
      ]);
      return false;
    }
    const selectedPlanId = normalizeTestPlanId(
      this.testCaseControls.testPlanId.value,
    );
    if (
      effectiveUseTestCases &&
      (selectedPlanId === null ||
        !this.testPlanOptions.some((option) => option.id === selectedPlanId))
    ) {
      if (this.testPlanCatalogState !== 'loading') {
        this.testCaseControls.testPlanId.markAsTouched();
        this.error =
          'Selecciona un Test Plan disponible para el proyecto actual.';
        this.formValidation.focusFirst([
          {
            key: 'testSuitePlanId',
            type: 'required',
            message: this.error,
            controlId: 'work-item-json-test-plan',
            order: 52,
            section: 'test-cases',
            source: 'ai-preflight',
          },
        ]);
      }
      return false;
    }
    if (effectiveUseTestCases && this.testCaseControls.state.invalid) {
      this.testCaseControls.state.markAsTouched();
      this.error = 'Selecciona un estado válido para los Test Cases.';
      this.formValidation.focusFirst([
        {
          key: 'tcState',
          type: 'required',
          message: this.error,
          controlId: 'work-item-json-state',
          order: 51,
          section: 'test-cases',
          source: 'ai-preflight',
        },
      ]);
      return false;
    }

    this.validationIssues = [];
    this.dynamicValidationMessages = {};
    return true;
  }

  private applyAiValidationFeedback(
    message: string,
    issues: { fieldKey?: string; label: string; referenceName?: string }[],
  ): void {
    const core = {
      sourceWorkItemText: {
        message: 'Ingresa el texto funcional antes de generar la vista previa.',
        controlId: 'work-item-json-source-work-item',
        order: 10,
        section: 'content',
      },
      azdoProject: {
        message: 'Selecciona un proyecto de Azure DevOps.',
        controlId: 'work-item-json-azdo-project',
        order: 20,
        section: 'azure',
      },
      iterationPath: {
        message: 'Selecciona o escribe una ruta de iteración.',
        controlId: 'work-item-json-iteration-path',
        order: 30,
        section: 'azure',
      },
      areaPath: {
        message: 'Selecciona o escribe un área del proyecto.',
        controlId: 'work-item-json-area-path',
        order: 40,
        section: 'azure',
      },
    } as const;
    this.validationIssues = issues
      .flatMap((issue, index): FormValidationIssue[] => {
        if (issue.fieldKey === 'dynamicWorkItemFields' && issue.referenceName) {
          const field = this.dynamicFieldConfigs.find(
            (candidate) => candidate.referenceName === issue.referenceName,
          );
          return field
            ? [
                {
                  key: 'dynamicWorkItemField',
                  referenceName: issue.referenceName,
                  type: 'required',
                  message: `Completa ${field.label || field.name || field.referenceName}.`,
                  controlId: `dynamic-field-${dynamicWorkItemControlName(field, this.dynamicControlPrefix).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
                  order: 100 + index,
                  section: 'dynamic',
                  source: 'ai-preflight',
                },
              ]
            : [];
        }
        const config = core[issue.fieldKey as keyof typeof core];
        return config
          ? [
              {
                key: issue.fieldKey!,
                type: 'required',
                ...config,
                source: 'ai-preflight',
              },
            ]
          : [];
      })
      .sort((left, right) => left.order - right.order);
    this.dynamicValidationMessages = Object.fromEntries(
      this.validationIssues
        .filter((issue) => issue.referenceName)
        .map((issue) => [issue.referenceName!, issue.message]),
    );
    this.error = this.validationIssues.length ? '' : message;
    this.formValidation.focusFirst(this.validationIssues);
  }

  validationMessage(key: string): string {
    return (
      this.validationIssues.find((issue) => issue.key === key)?.message ?? ''
    );
  }

  private reconcileValidationIssues(): void {
    this.validationIssues = this.validationIssues.filter((issue) => {
      if (issue.referenceName) {
        const field = this.dynamicFieldConfigs.find(
          (candidate) => candidate.referenceName === issue.referenceName,
        );
        return (
          !!field &&
          this.form.get(
            dynamicWorkItemControlName(field, this.dynamicControlPrefix),
          )?.invalid
        );
      }
      return this.form.get(issue.key)?.invalid ?? false;
    });
    this.dynamicValidationMessages = Object.fromEntries(
      this.validationIssues
        .filter((issue) => issue.referenceName)
        .map((issue) => [issue.referenceName!, issue.message]),
    );
  }

  async refreshWorkItemConfig(forceRefresh = false): Promise<void> {
    if (!this.form) {
      return;
    }
    const requestVersion = ++this.workItemConfigRequestVersion;

    const project = this.normalizeText(this.form.value.azdoProject);
    if (!project) {
      this.workItemConfigMessage =
        'Selecciona un proyecto para cargar campos dinámicos.';
      this.workItemConfigError = '';
      this.clearWorkItemConfig(false);
      this.lastWorkItemConfigKey = '';
      return;
    }

    if (!this.isAzdoConfigured) {
      this.workItemConfigMessage = '';
      this.workItemConfigError =
        'Configura organización y PAT para cargar campos dinámicos.';
      this.clearWorkItemConfig(false);
      this.lastWorkItemConfigKey = '';
      return;
    }

    const context = this.azdoConfigService.getConfigSnapshot();
    const requestedWorkItemType = resolveWorkItemType(
      this.form.value.workItemType || DEFAULT_WORK_ITEM_TYPE,
    );
    const requestKey = this.buildWorkItemConfigKey(
      context.organization,
      project,
      requestedWorkItemType,
    );
    if (
      !forceRefresh &&
      requestKey === this.lastWorkItemConfigKey &&
      this.workItemConfig
    ) {
      return;
    }

    this.isLoadingWorkItemConfig = true;
    this.workItemConfigMessage =
      'Cargando campos del Work Item…';
    this.workItemConfigError = '';

    try {
      const [response, testCaseConfig] = await Promise.all([
        this.apiService.fetchWorkItemConfig(
          project,
          requestedWorkItemType,
          context,
          forceRefresh,
        ),
        this.apiService.fetchWorkItemConfig(
          project,
          AZDO_TEST_CASE_WORK_ITEM_TYPE,
          context,
          forceRefresh,
        ),
      ]);
      if (
        this.destroyed ||
        requestVersion !== this.workItemConfigRequestVersion ||
        !this.isSameText(project, this.form.value.azdoProject) ||
        !this.isSameText(response.project, project) ||
        !this.isSameText(requestedWorkItemType, this.form.value.workItemType)
      )
        return;
      this.applyWorkItemConfig(response);
      this.applyTestCaseStates(testCaseConfig.fields);
      this.lastWorkItemConfigKey = requestKey;
      this.workItemConfigMessage =
        this.dynamicFieldConfigs.length > 0
          ? `Campos dinámicos cargados para ${response.workItemType}.`
          : `Azure DevOps no configuró campos adicionales para ${response.workItemType}.`;
    } catch (error) {
      if (
        this.destroyed ||
        requestVersion !== this.workItemConfigRequestVersion
      )
        return;
      this.workItemConfigMessage = '';
      this.workItemConfigError = (error as Error).message;
      this.clearWorkItemConfig(false);
      this.lastWorkItemConfigKey = '';
    } finally {
      if (requestVersion === this.workItemConfigRequestVersion)
        this.isLoadingWorkItemConfig = false;
    }
  }

  private applyTestCaseStates(fields: WorkItemFieldConfig[]): void {
    const stateField = fields.find(
      (field) =>
        field.referenceName.toLowerCase() ===
        AZDO_STATE_REFERENCE_NAME.toLowerCase(),
    );
    this.tcStateOptions = [...(stateField?.options ?? [])];
    this.form.controls['tcState'].setValue(
      selectTestCaseState(
        this.tcStateOptions,
        this.form.controls['tcState'].value,
      ),
      { emitEvent: false },
    );
  }

  async refreshTestPlans(forceRefresh = false): Promise<void> {
    if (!this.form) {
      return;
    }
    const requestVersion = ++this.testPlanRequestVersion;

    const project = this.normalizeText(this.form.value.azdoProject);
    if (!project) {
      this.testPlanOptions = [];
      this.testPlanCatalogState = 'idle';
      this.syncTestCaseRules();
      this.testPlansMessage = 'Selecciona un proyecto para cargar Test Plans.';
      this.testPlansError = '';
      return;
    }

    if (!this.isAzdoConfigured) {
      this.testPlanOptions = [];
      this.testPlanCatalogState = 'error';
      this.syncTestCaseRules();
      this.testPlansMessage = '';
      this.testPlansError =
        'Configura organización y PAT para cargar Test Plans.';
      return;
    }

    const context = this.azdoConfigService.getConfigSnapshot();
    this.isLoadingTestPlans = true;
    this.testPlanCatalogState = 'loading';
    this.testPlanOptions = [];
    this.testCaseControls.testPlanId.setValue(null, { emitEvent: false });
    this.syncTestCaseRules();
    this.testPlansMessage = 'Cargando Test Plans…';
    this.testPlansError = '';

    try {
      const response = await this.apiService.fetchTestPlans(
        project,
        context,
        forceRefresh,
      );
      if (
        this.destroyed ||
        requestVersion !== this.testPlanRequestVersion ||
        !this.isSameText(response.project, this.form.value.azdoProject)
      )
        return;
      this.testPlanOptions = response.testPlans ?? [];
      this.testPlanCatalogState =
        this.testPlanOptions.length > 0 ? 'ready' : 'empty';
      this.syncTestCaseRules();
      this.testPlansMessage =
        this.testPlanOptions.length > 0
          ? `${this.testPlanOptions.length} Test Plans disponibles.`
          : 'El proyecto no devolvio Test Plans disponibles.';
    } catch (error) {
      if (this.destroyed || requestVersion !== this.testPlanRequestVersion)
        return;
      this.testPlanOptions = [];
      this.testPlanCatalogState = 'error';
      this.syncTestCaseRules();
      this.testPlansMessage = '';
      this.testPlansError = (error as Error).message;
    } finally {
      if (requestVersion === this.testPlanRequestVersion)
        this.isLoadingTestPlans = false;
    }
  }

  private applyMetadata(metadata: AzdoMetadataResult): void {
    this.projectMetadata = (metadata.projectMetadata ?? []).map((item) => ({
      project: item.project,
      areaPaths: this.normalizePathCollection(item.areaPaths, 'area'),
      iterationPaths: this.normalizePathCollection(
        item.iterationPaths,
        'iteration',
      ),
    }));

    const fallbackProjects = this.projectMetadata.map((item) => item.project);
    this.projectOptions =
      metadata.projects.length > 0 ? metadata.projects : fallbackProjects;

    this.flatAreaPathOptions = this.normalizePathCollection(
      metadata.areaPaths,
      'area',
    );
    this.flatIterationPathOptions = this.normalizePathCollection(
      metadata.iterationPaths,
      'iteration',
    );

    this.updatePathOptions(this.normalizeText(this.form?.value?.azdoProject));
  }

  private scheduleWorkItemConfigRefresh(delayMs?: number): void {
    if (this.workItemConfigRefreshTimer) {
      clearTimeout(this.workItemConfigRefreshTimer);
    }

    const effectiveDelayMs = delayMs ?? this.workItemConfigRefreshDelayMs;
    this.workItemConfigRefreshTimer = setTimeout(() => {
      this.workItemConfigRefreshTimer = null;
      void this.refreshWorkItemConfig();
    }, effectiveDelayMs);
  }

  private applyWorkItemConfig(config: WorkItemConfigResult): void {
    this.workItemConfig = config;
    this.form.patchValue(
      { workItemType: resolveWorkItemType(config.workItemType) },
      { emitEvent: false },
    );
    this.syncTestCaseRules();
    this.syncDynamicControls(
      config.fields.filter((field) => this.shouldRenderDynamicField(field)),
    );
  }

  private clearWorkItemConfig(resetWorkItemType: boolean): void {
    this.workItemConfig = null;
    this.dynamicFieldConfigs = [];
    this.removeDynamicControls();

    if (resetWorkItemType && this.form) {
      this.form.patchValue(
        { workItemType: DEFAULT_WORK_ITEM_TYPE },
        { emitEvent: false },
      );
    }
  }

  private syncDynamicControls(fields: WorkItemFieldConfig[]): void {
    this.dynamicFieldConfigs = syncDynamicWorkItemControls(
      this.form,
      fields,
      WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX,
      this.pendingDynamicWorkItemFieldValues,
    );
  }

  private removeDynamicControls(): void {
    removeDynamicWorkItemControls(
      this.form,
      WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX,
    );
  }

  private shouldRenderDynamicField(field: WorkItemFieldConfig): boolean {
    return shouldRenderDynamicWorkItemField(field);
  }

  private collectDynamicWorkItemFields(): Record<string, unknown> {
    return collectDynamicWorkItemFields(
      this.form,
      this.dynamicFieldConfigs,
      WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX,
    );
  }

  private collectPayloadDynamicWorkItemFields(): Record<string, unknown> {
    return collectSanitizedDynamicWorkItemFields(
      this.form,
      this.dynamicFieldConfigs,
      WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX,
      resolveWorkItemType(
        this.form.value.workItemType || DEFAULT_WORK_ITEM_TYPE,
      ),
    ).workItem;
  }

  private toPreviewBasePayload(
    value: object | null,
  ): WorkItemPayload | undefined {
    if (!value) {
      return undefined;
    }

    const payload = value as Partial<WorkItemPayload>;
    const workItemType = resolveWorkItemType(
      payload.workItemType || DEFAULT_WORK_ITEM_TYPE,
    );
    const supportsTestCases = supportsTestCasesForWorkItemType(workItemType);

    return {
      azdoOrg: payload.azdoOrg ?? '',
      azdoProject: payload.azdoProject ?? '',
      iterationPath: payload.iterationPath ?? '',
      areaPath: payload.areaPath ?? '',
      workItemType,
      workItem: (payload.workItem ?? {}) as WorkItemPayload['workItem'],
      testCases: supportsTestCases ? (payload.testCases ?? []) : [],
      testSuite: {
        planId: supportsTestCases ? Number(payload.testSuite?.planId ?? 0) : 0,
      },
    };
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persistState();
    }, this.stateSaveDebounceMs);
  }

  private flushPendingStateSave(): void {
    if (!this.saveTimer) {
      return;
    }

    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.persistState();
  }

  private clearGeneratedPrompt(): void {
    if (!this.prompt.trim() && !this.jsonTemplate) {
      return;
    }

    this.prompt = '';
    this.jsonTemplate = null;
    this.generationContract = null;
    this.workspaceState.setPrompt('', 'work-item-json-builder');
    this.persistState();
  }

  private persistState(): void {
    if (!this.form) {
      return;
    }

    const v = this.form.value;
    const state: WorkItemJsonBuilderPersistedState = {
      formValues: {
        sourceWorkItemText: this.normalizeText(v.sourceWorkItemText),
        azdoProject: this.normalizeText(v.azdoProject),
        workItemType: resolveWorkItemType(
          v.workItemType || DEFAULT_WORK_ITEM_TYPE,
        ),
        iterationPath: normalizeAzdoPath(v.iterationPath, 'iteration'),
        areaPath: normalizeAzdoPath(v.areaPath, 'area'),
        useTestCases: !!v.useTestCases,
        tcCount: this.normalizeTestCaseCount(v.tcCount),
        tcState: this.normalizeText(v.tcState),
        aiCantidadTestcases: v.ai?.cantidadTestcases === 'ai',
        testSuitePlanId: normalizeTestPlanId(v.testSuitePlanId),
        dynamicWorkItemFields: this.collectPayloadDynamicWorkItemFields(),
      },
      prompt: this.prompt,
    };

    safeRemoveLocalItem(this.workItemJsonBuilderStorageKey);
    safeSetSessionItem(
      this.workItemJsonBuilderStorageKey,
      JSON.stringify(state),
    );
  }

  private restoreState(): void {
    safeRemoveLocalItem(this.workItemJsonBuilderStorageKey);
    try {
      const raw = safeGetSessionItem(this.workItemJsonBuilderStorageKey);
      if (!raw) {
        return;
      }

      const state = JSON.parse(raw) as WorkItemJsonBuilderPersistedState;
      const fv = state.formValues;

      this.form.patchValue(
        {
          sourceWorkItemText: fv?.sourceWorkItemText ?? '',
          azdoProject: fv?.azdoProject ?? '',
          workItemType: resolveWorkItemType(
            fv?.workItemType || DEFAULT_WORK_ITEM_TYPE,
          ),
          iterationPath: normalizeAzdoPath(fv?.iterationPath, 'iteration'),
          areaPath: normalizeAzdoPath(fv?.areaPath, 'area'),
          useTestCases: fv?.useTestCases ?? true,
          tcCount: this.normalizeTestCaseCount(fv?.tcCount ?? 3),
          tcState: this.normalizeText(fv?.tcState),
          ai: {
            cantidadTestcases: this.resolvePersistedAiCantidadTestcases(fv)
              ? 'ai'
              : 'fixed',
          },
          testSuitePlanId: normalizeTestPlanId(fv?.testSuitePlanId),
        },
        { emitEvent: false },
      );

      this.pendingDynamicWorkItemFieldValues = {
        ...(fv?.dynamicWorkItemFields ?? {}),
      };
      this.prompt = state.prompt ?? '';
    } catch {
      safeRemoveSessionItem(this.workItemJsonBuilderStorageKey);
      safeRemoveLocalItem(this.workItemJsonBuilderStorageKey);
    }
  }

  private resolvePersistedAiCantidadTestcases(
    values:
      Partial<WorkItemJsonBuilderPersistedState['formValues']> | undefined,
  ): boolean {
    if (!values) {
      return false;
    }

    const legacyValues = values as Record<string, unknown>;
    return !!(
      values.aiCantidadTestcases ?? legacyValues['ai.cantidadTestcases']
    );
  }

  private updatePathOptions(selectedProject: string): void {
    const project = this.normalizeText(selectedProject);
    const hasProjectMetadata = this.projectMetadata.length > 0;
    const projectEntry = hasProjectMetadata
      ? this.projectMetadata.find((item) =>
          this.isSameText(item.project, project),
        )
      : undefined;
    const useFlatCatalog = !project || !hasProjectMetadata;

    this.areaPathOptions = useFlatCatalog
      ? this.flatAreaPathOptions
      : (projectEntry?.areaPaths ?? []);

    this.iterationPathOptions = useFlatCatalog
      ? this.flatIterationPathOptions
      : (projectEntry?.iterationPaths ?? []);
  }

  private buildWorkItemConfigKey(
    organization: string,
    project: string,
    workItemType: string,
  ): string {
    const correlationId =
      this.azdoConfigService.getContextSnapshot().correlationId.trim() ||
      'no-session';
    return `${organization.trim()}::${correlationId}::${project.trim().toLowerCase()}::${workItemType.trim().toLowerCase()}`;
  }

  private getFormControl(controlName: string): FormControl | null {
    const exactMatch = this.form.controls[controlName];
    if (exactMatch) {
      return exactMatch as FormControl;
    }

    return this.form.get(controlName) as FormControl | null;
  }

  getRequiredFormControl(controlName: string): FormControl {
    const control = this.getFormControl(controlName);
    if (!control) throw new Error(`Control ${controlName} no existe.`);
    return control;
  }

  private normalizePathControl(kind: 'iteration' | 'area'): void {
    const controlName = kind === 'iteration' ? 'iterationPath' : 'areaPath';
    const rawValue = this.form?.value?.[controlName];
    const normalized = normalizeAzdoPath(rawValue, kind);

    if (kind === 'iteration' && rawValue !== normalized) {
      this.form.patchValue({ iterationPath: normalized }, { emitEvent: false });
    }

    if (kind === 'area' && rawValue !== normalized) {
      this.form.patchValue({ areaPath: normalized }, { emitEvent: false });
    }
  }

  private normalizePathCollection(
    values: string[],
    kind: 'iteration' | 'area',
  ): string[] {
    const byKey = new Map<string, string>();

    for (const value of values) {
      const normalized = normalizeAzdoPath(value, kind);
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, normalized);
      }
    }

    return Array.from(byKey.values()).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
  }

  private normalizeTestCaseCount(value: unknown): number {
    return normalizeTestCaseCount(value);
  }

  private syncTestCaseRules(): void {
    if (!this.form) return;
    const enabled =
      this.supportsTestCasesForSelectedType &&
      !!this.getFormControl('useTestCases')?.value;
    configureTestCaseCountControl(
      this.getRequiredFormControl('tcCount'),
      enabled && !this.aiDecidesTestCaseCount,
    );
    const stateControl = this.getRequiredFormControl('tcState');
    if (enabled) {
      stateControl.enable({ emitEvent: false });
      stateControl.setValidators([Validators.required]);
    } else {
      stateControl.clearValidators();
      stateControl.disable({ emitEvent: false });
    }
    stateControl.updateValueAndValidity({ emitEvent: false });
    configureTestPlanControl(
      this.getRequiredFormControl('testSuitePlanId'),
      enabled,
      () => ({
        state: this.testPlanCatalogState,
        options: this.testPlanOptions,
      }),
    );
  }

  private getAiValidationContext() {
    const context = this.azdoConfigService.getContextSnapshot();
    const metadata = this.azdoConfigService.getMetadataSnapshot();
    return {
      organization: context.organization,
      runtimeCredentialAvailable: this.azdoConfigService.hasRuntimeCredential(),
      azdoProject: this.form?.value?.azdoProject,
      sourceWorkItemText: this.form?.value?.sourceWorkItemText,
      iterationPath: this.form?.value?.iterationPath,
      areaPath: this.form?.value?.areaPath,
      azdoMetadataLoaded:
        metadata.projects.length > 0 ||
        metadata.areaPaths.length > 0 ||
        metadata.iterationPaths.length > 0 ||
        (metadata.projectMetadata?.length ?? 0) > 0,
      workItemConfigLoaded: !!this.workItemConfig,
    };
  }

  private getMissingRequiredDynamicFields(): WorkItemFieldConfig[] {
    return getMissingRequiredDynamicWorkItemFields(
      this.form,
      this.dynamicFieldConfigs,
      WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX,
    );
  }

  private normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isSameText(left: string, right: string): boolean {
    return (
      this.normalizeText(left).toLowerCase() ===
      this.normalizeText(right).toLowerCase()
    );
  }
}
