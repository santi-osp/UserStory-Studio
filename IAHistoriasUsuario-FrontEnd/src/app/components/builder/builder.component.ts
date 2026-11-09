import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  payloadToFormValues,
  TEMPLATE_PAYLOAD,
  WorkItemPromptContract,
} from '../../prompts/work-items';
import {
  FormValues,
  WorkItemPayload,
  AzdoMetadataResult,
  ProjectMetadata,
  WorkItemConfigResult,
  WorkItemFieldConfig,
  TestPlanSummary,
} from '../../models/types';
import { SearchableSelectOption } from '../shared/searchable-select/searchable-select.component';
import { AzdoConfigService } from '../../services/azdo-config.service';
import { ApiService } from '../../services/api.service';
import {
  AzdoPathKind,
  formatAzdoPathLabel,
  normalizeAzdoPath,
} from '../../utils/azdo-path';
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
  BUILDER_DYNAMIC_CONTROL_PREFIX,
  collectSanitizedDynamicWorkItemFields,
  dynamicWorkItemControlName,
  getMissingRequiredDynamicWorkItemFields,
  removeDynamicWorkItemControls,
  shouldRenderDynamicWorkItemField,
  syncDynamicWorkItemControls,
} from '../../utils/work-item-dynamic-fields';

type BuilderPersistedFormValues = Omit<FormValues, 'azdoOrg' | 'testSuite'> & {
  testSuite: { planId: number | null };
};

interface BuilderPersistedState {
  formValues: BuilderPersistedFormValues;
  prompt: string;
  jsonOut: unknown;
  message: string;
}

@Component({
  selector: 'app-builder',
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
  templateUrl: './builder.component.html',
})
export class BuilderComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  prompt = '';
  systemPrompt = '';
  jsonOut: WorkItemPayload | null = null;
  private generationContract: WorkItemPromptContract | null = null;
  message = '';
  dynamicValidationMessages: Record<string, string> = {};
  validationIssues: FormValidationIssue[] = [];
  isSubmittingPreview = false;
  projectOptions: string[] = [];
  areaPathOptions: string[] = [];
  iterationPathOptions: string[] = [];
  isLoadingAzdoData = false;
  azdoDataMessage = '';
  azdoDataError = '';
  azdoDataWarning = '';
  canRetryAzdoData = false;
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
  readonly dynamicControlPrefix = BUILDER_DYNAMIC_CONTROL_PREFIX;
  destinationControls!: WorkItemDestinationControls;
  testCaseControls!: TestCaseGenerationControls;

  get isAzdoConfigured(): boolean {
    return (
      !!this.azdoConfigService.getOrganization() &&
      this.azdoConfigService.hasRuntimeCredential()
    );
  }

  get azureConnectionMessage(): string {
    return getAzureConnectionMessage(
      this.azdoConfigService.getOrganization(),
      this.azdoConfigService.hasRuntimeCredential(),
    );
  }

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private workItemConfigRefreshTimer: ReturnType<typeof setTimeout> | null =
    null;
  private readonly subscriptions = new Subscription();
  private flatAreaPathOptions: string[] = [];
  private flatIterationPathOptions: string[] = [];
  private projectMetadata: ProjectMetadata[] = [];
  private workItemConfig: WorkItemConfigResult | null = null;
  private dynamicFieldConfigs: WorkItemFieldConfig[] = [];
  private pendingDynamicWorkItemFieldValues: Record<string, unknown> = {};
  private lastContextKey = '';
  private lastProjectValue = '';
  private lastWorkItemConfigKey = '';
  private testPlanRequestVersion = 0;
  private workItemConfigRequestVersion = 0;
  private destroyed = false;
  private readonly builderStorageKey = BROWSER_STORAGE_KEYS.builderState;
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
    const defaults = payloadToFormValues(TEMPLATE_PAYLOAD);
    this.form = this.fb.group({
      need: [defaults.need, [Validators.required]],
      useTestCases: [defaults.useTestCases ?? true],
      tcCount: [defaults.tcCount],
      tcState: [defaults.tcState],
      azdoProject: [defaults.azdoProject, [Validators.required]],
      workItemType: [
        resolveWorkItemType(defaults.workItemType || DEFAULT_WORK_ITEM_TYPE),
      ],
      iterationPath: [defaults.iterationPath, [Validators.required]],
      areaPath: [defaults.areaPath, [Validators.required]],
      testSuite: this.fb.group({
        planId: [normalizeTestPlanId(defaults.testSuite.planId)],
      }),
      ai: this.fb.group({
        cantidadTestcases: ['fixed' as TestCaseQuantityMode],
      }),
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
      testPlanId: this.getRequiredFormControl(
        'testSuite.planId',
      ) as FormControl<number | null>,
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

    const initialContext = this.azdoConfigService.getContextSnapshot();
    this.lastContextKey = this.buildContextKey(
      initialContext.organization,
      initialContext.correlationId,
    );
    this.lastProjectValue = this.normalizeText(this.form.value.azdoProject);

    this.applyMetadata(this.azdoConfigService.getMetadataSnapshot());

    const configSub = this.azdoConfigService.context$.subscribe((context) => {
      if (!this.form) return;

      const nextContextKey = this.buildContextKey(
        context.organization,
        context.correlationId,
      );
      if (nextContextKey === this.lastContextKey) {
        return;
      }

      this.lastContextKey = nextContextKey;

      if (
        !context.organization.trim() ||
        !this.azdoConfigService.hasRuntimeCredential()
      ) {
        this.workItemConfigRequestVersion++;
        this.testPlanRequestVersion++;
        this.azdoConfigService.clearMetadata();
        this.azdoDataMessage = '';
        this.azdoDataError = '';
        this.azdoDataWarning = '';
        this.canRetryAzdoData = false;
        this.clearWorkItemConfig(true);
        this.lastWorkItemConfigKey = '';
        this.testPlanOptions = [];
        this.testPlanCatalogState = 'error';
        this.syncTestCaseRules();
        return;
      }

      void this.refreshAzdoData();
      void this.refreshWorkItemConfig();
    });

    const metadataSub = this.azdoConfigService.metadata$.subscribe(
      (metadata) => {
        this.applyMetadata(metadata);
      },
    );

    const projectSub = this.form
      .get('azdoProject')
      ?.valueChanges.subscribe((value) => {
        const nextProjectValue = this.normalizeText(value);
        const hasProjectChanged = nextProjectValue !== this.lastProjectValue;
        this.lastProjectValue = nextProjectValue;

        if (hasProjectChanged) {
          this.form.patchValue(
            { areaPath: '', iterationPath: '', testSuite: { planId: null } },
            { emitEvent: false },
          );
          this.clearWorkItemConfig(false);
          this.lastWorkItemConfigKey = '';
          this.scheduleWorkItemConfigRefresh();
          void this.refreshTestPlans();
        }

        this.updatePathOptions(nextProjectValue);
      });

    const workItemTypeSub = this.form
      .get('workItemType')
      ?.valueChanges.subscribe((value) => {
        const normalizedType = resolveWorkItemType(
          value || DEFAULT_WORK_ITEM_TYPE,
        );
        if (!this.isSameText(normalizedType, String(value ?? ''))) {
          this.form.patchValue(
            { workItemType: normalizedType },
            { emitEvent: false },
          );
        }

        if (!supportsTestCasesForWorkItemType(normalizedType)) {
          this.form.patchValue(
            {
              useTestCases: false,
              ai: { cantidadTestcases: 'fixed' },
              testSuite: { planId: null },
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

    this.subscriptions.add(configSub);
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

    if (
      initialContext.organization.trim() &&
      this.azdoConfigService.hasRuntimeCredential()
    ) {
      if (this.isMetadataEmpty(this.azdoConfigService.getMetadataSnapshot())) {
        void this.refreshAzdoData();
      }

      if (this.normalizeText(this.form.value.azdoProject)) {
        this.scheduleWorkItemConfigRefresh(0);
        void this.refreshTestPlans();
      }
    }

    this.form.valueChanges.subscribe(() => {
      this.reconcileValidationIssues();
      this.scheduleSave();
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.testPlanRequestVersion++;
    this.workItemConfigRequestVersion++;
    this.flushPendingStateSave();
    if (this.workItemConfigRefreshTimer)
      clearTimeout(this.workItemConfigRefreshTimer);
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

  get selectedWorkItemType(): WorkItemTypeOption {
    return getWorkItemTypeOption(this.form?.value?.workItemType);
  }

  get supportsTestCasesForSelectedType(): boolean {
    return supportsTestCasesForWorkItemType(this.form?.value?.workItemType);
  }

  get isWorkItemMetadataReady(): boolean {
    return !!this.workItemConfig;
  }

  get useTestCases(): boolean {
    if (!this.supportsTestCasesForSelectedType) {
      return false;
    }

    return !!this.getFormControl('useTestCases')?.value;
  }

  get aiDecidesTestCaseCount(): boolean {
    return this.getFormControl('ai.cantidadTestcases')?.value === 'ai';
  }

  get canEditManualTestCaseCount(): boolean {
    return this.useTestCases && !this.aiDecidesTestCaseCount;
  }

  get dynamicWorkItemFieldConfigs(): WorkItemFieldConfig[] {
    return this.dynamicFieldConfigs;
  }

  isAiFieldRequired(fieldKey: AiVisibleRequiredField): boolean {
    return this.aiRequestValidation.isFieldRequired(
      'work-item-design-generation',
      fieldKey,
    );
  }

  get builderMessageTone(): 'success' | 'error' {
    const normalizedMessage = this.message.trim().toLowerCase();
    const isValidationError =
      normalizedMessage.startsWith('ingresa ') ||
      normalizedMessage.includes(' debe ') ||
      normalizedMessage.includes('cambió') ||
      normalizedMessage.startsWith('no fue posible') ||
      normalizedMessage.startsWith('actualiza ');

    return isValidationError ? 'error' : 'success';
  }

  private getFormControl(controlName: string): FormControl | null {
    if (!this.form) {
      return null;
    }

    const exactMatch = this.form.controls[controlName];
    if (exactMatch) {
      return exactMatch as FormControl;
    }

    return this.form.get(controlName) as FormControl | null;
  }

  getRequiredFormControl(controlName: string): FormControl {
    const control = this.getFormControl(controlName);
    if (!control) {
      throw new Error(`Control ${controlName} no existe.`);
    }

    return control;
  }

  formatPathLabel(path: string, kind: AzdoPathKind): string {
    return formatAzdoPathLabel(path, kind);
  }

  onGenerate(): Promise<void> {
    return this.sendToAi();
  }

  private generateFromForm(): boolean {
    this.syncTestCaseRules();
    const selectedPlanId = normalizeTestPlanId(
      this.testCaseControls.testPlanId.value,
    );
    if (
      this.useTestCases &&
      (selectedPlanId === null ||
        !this.testPlanOptions.some((option) => option.id === selectedPlanId))
    ) {
      return false;
    }

    const values = this.getFormValues();
    const result = this.workItemPromptBuilder.buildDesignPrompt(values);
    this.prompt = result.prompt;
    this.systemPrompt = result.systemPrompt;
    this.jsonOut = result.finalJson;
    this.generationContract = result.contract;
    this.workspaceState.setPrompt(
      result.prompt,
      'builder',
      result.systemPrompt,
    );
    this.persistState();

    return true;
  }

  async sendToAi(): Promise<void> {
    if (this.isSubmittingPreview) return;
    this.submitAttempted = true;
    this.message = '';
    if (!this.validateGenerationRequest()) return;

    this.isSubmittingPreview = true;
    try {
      this.prompt = '';
      this.systemPrompt = '';
      this.jsonOut = null;
      this.generationContract = null;
      if (!this.generateFromForm() || !this.prompt.trim())
        throw new Error('No fue posible preparar la solicitud.');
      this.workspaceState.preparePreview(
        this.prompt,
        'builder',
        this.jsonOut ?? undefined,
        this.generationContract ?? undefined,
      );
      const navigated = await this.router.navigate([
        '/previsualizar-work-item',
      ]);
      if (!navigated)
        throw new Error('No fue posible abrir la vista previa.');
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : 'Inténtalo nuevamente.';
    } finally {
      this.isSubmittingPreview = false;
    }
  }

  private validateGenerationRequest(): boolean {
    this.syncTestCaseRules();

    const missingDynamicFields = this.getMissingRequiredDynamicFields();
    const validation = this.aiRequestValidation.validate(
      'work-item-design-generation',
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
      this.message = this.isLoadingWorkItemConfig
        ? 'Espera a que terminen de cargar los campos del Work Item.'
        : 'Actualiza los campos disponibles: deben existir título y descripción para generar.';
      return false;
    }

    if (
      this.useTestCases &&
      !this.aiDecidesTestCaseCount &&
      this.testCaseControls.quantity.invalid
    ) {
      this.testCaseControls.quantity.markAsTouched();
      this.message = 'Ingresa una cantidad válida de Test Cases.';
      this.formValidation.focusFirst([
        {
          key: 'tcCount',
          type: 'required',
          message: this.message,
          controlId: 'builder-count',
          order: 50,
          section: 'test-cases',
          source: 'ai-preflight',
        },
      ]);
      return false;
    }
    if (this.useTestCases && this.testCaseControls.state.invalid) {
      this.testCaseControls.state.markAsTouched();
      this.message = 'Selecciona un estado válido para los Test Cases.';
      this.formValidation.focusFirst([
        {
          key: 'tcState',
          type: 'required',
          message: this.message,
          controlId: 'builder-state',
          order: 51,
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
      this.useTestCases &&
      (selectedPlanId === null ||
        !this.testPlanOptions.some((plan) => plan.id === selectedPlanId))
    ) {
      this.testCaseControls.testPlanId.markAsTouched();
      this.message =
        'Selecciona un Test Plan disponible para el proyecto actual.';
      this.formValidation.focusFirst([
        {
          key: 'testSuite.planId',
          type: 'required',
          message: this.message,
          controlId: 'builder-test-plan',
          order: 52,
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
      need: {
        message: 'Describe la necesidad antes de generar la vista previa.',
        controlId: 'builder-need',
        order: 10,
        section: 'content',
      },
      azdoProject: {
        message: 'Selecciona un proyecto de Azure DevOps.',
        controlId: 'builder-azdo-project',
        order: 20,
        section: 'azure',
      },
      iterationPath: {
        message: 'Selecciona o escribe una ruta de iteración.',
        controlId: 'builder-iteration-path',
        order: 30,
        section: 'azure',
      },
      areaPath: {
        message: 'Selecciona o escribe un área del proyecto.',
        controlId: 'builder-area-path',
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
    this.message = this.validationIssues.length ? '' : message;
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
          this.getRequiredFormControl(
            dynamicWorkItemControlName(field, this.dynamicControlPrefix),
          ).invalid
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

  async refreshAzdoData(forceRefresh = false): Promise<void> {
    if (this.isLoadingAzdoData) {
      return;
    }

    const config = this.azdoConfigService.getConfigSnapshot();
    if (
      !config.organization.trim() ||
      !this.azdoConfigService.hasRuntimeCredential()
    ) {
      this.azdoDataError =
        'Configura organización y Azure PAT en el módulo Configuración Azure.';
      this.azdoDataMessage = '';
      this.azdoDataWarning = '';
      this.canRetryAzdoData = false;
      return;
    }

    this.isLoadingAzdoData = true;
    this.azdoDataError = '';
    this.azdoDataWarning = '';
    this.canRetryAzdoData = false;
    this.azdoDataMessage = 'Consultando información de Azure DevOps...';

    try {
      const metadata = await this.apiService.fetchAzdoMetadata(
        config,
        forceRefresh,
      );
      this.azdoConfigService.setMetadata(metadata);
      this.azdoDataMessage = 'Información de Azure DevOps actualizada.';

      const hasCatalogData =
        metadata.projects.length > 0 ||
        metadata.areaPaths.length > 0 ||
        metadata.iterationPaths.length > 0 ||
        (metadata.projectMetadata?.length ?? 0) > 0;

      if (!hasCatalogData) {
        this.azdoDataWarning =
          'Azure DevOps respondió sin información para el contexto actual.';
      }

      if (this.normalizeText(this.form?.value?.azdoProject)) {
        void this.refreshWorkItemConfig();
        void this.refreshTestPlans(forceRefresh);
      }
    } catch (err) {
      this.azdoDataMessage = '';
      this.azdoDataError = (err as Error).message;
      this.canRetryAzdoData = this.isTimeoutMessage(this.azdoDataError);
    } finally {
      this.isLoadingAzdoData = false;
    }
  }

  async refreshWorkItemConfig(forceRefresh = false): Promise<void> {
    if (!this.form) {
      return;
    }
    const requestVersion = ++this.workItemConfigRequestVersion;

    const config = this.azdoConfigService.getConfigSnapshot();
    const project = this.normalizeText(this.form.value.azdoProject);

    if (!project) {
      this.workItemConfigMessage =
        'Selecciona un proyecto para cargar la configuración del Work Item.';
      this.workItemConfigError = '';
      this.clearWorkItemConfig(true);
      this.lastWorkItemConfigKey = '';
      return;
    }

    if (
      !config.organization.trim() ||
      !this.azdoConfigService.hasRuntimeCredential()
    ) {
      this.workItemConfigMessage = '';
      this.workItemConfigError =
        'Configura organización y Azure PAT para cargar los campos del Work Item.';
      this.clearWorkItemConfig(true);
      this.lastWorkItemConfigKey = '';
      return;
    }

    const configuredWorkItemType = resolveWorkItemType(
      this.form.value.workItemType || DEFAULT_WORK_ITEM_TYPE,
    );
    const requestKey = this.buildWorkItemConfigKey(
      config.organization,
      project,
      configuredWorkItemType,
    );
    if (
      !forceRefresh &&
      requestKey === this.lastWorkItemConfigKey &&
      this.workItemConfig
    ) {
      return;
    }

    this.isLoadingWorkItemConfig = true;
    this.workItemConfigError = '';
    this.workItemConfigMessage =
      'Cargando campos del Work Item…';

    try {
      const [response, testCaseConfig] = await Promise.all([
        this.apiService.fetchWorkItemConfig(
          project,
          configuredWorkItemType,
          config,
          forceRefresh,
        ),
        this.apiService.fetchWorkItemConfig(
          project,
          AZDO_TEST_CASE_WORK_ITEM_TYPE,
          config,
          forceRefresh,
        ),
      ]);
      if (
        this.destroyed ||
        requestVersion !== this.workItemConfigRequestVersion ||
        !this.isSameText(project, this.form.value.azdoProject) ||
        !this.isSameText(response.project, project) ||
        !this.isSameText(configuredWorkItemType, this.form.value.workItemType)
      )
        return;

      this.applyWorkItemConfig(response);
      this.applyTestCaseStates(testCaseConfig.fields);
      this.lastWorkItemConfigKey = requestKey;
      this.workItemConfigMessage =
        this.dynamicFieldConfigs.length > 0
          ? `Configuración cargada para ${response.workItemType}.`
          : `Azure DevOps no configuró campos adicionales para ${response.workItemType}.`;
    } catch (err) {
      if (
        this.destroyed ||
        requestVersion !== this.workItemConfigRequestVersion
      )
        return;
      this.workItemConfigMessage = '';
      this.workItemConfigError = (err as Error).message;
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

    const config = this.azdoConfigService.getConfigSnapshot();
    const project = this.normalizeText(this.form.value.azdoProject);

    if (!project) {
      this.testPlanOptions = [];
      this.testPlanCatalogState = 'idle';
      this.syncTestCaseRules();
      this.testPlansMessage = 'Selecciona un proyecto para cargar Test Plans.';
      this.testPlansError = '';
      return;
    }

    if (
      !config.organization.trim() ||
      !this.azdoConfigService.hasRuntimeCredential()
    ) {
      this.testPlanOptions = [];
      this.testPlanCatalogState = 'error';
      this.syncTestCaseRules();
      this.testPlansMessage = '';
      this.testPlansError =
        'Configura organización y Azure PAT para cargar Test Plans.';
      return;
    }

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
        config,
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
    } catch (err) {
      if (this.destroyed || requestVersion !== this.testPlanRequestVersion)
        return;
      this.testPlanOptions = [];
      this.testPlanCatalogState = 'error';
      this.syncTestCaseRules();
      this.testPlansMessage = '';
      this.testPlansError = (err as Error).message;
    } finally {
      if (requestVersion === this.testPlanRequestVersion)
        this.isLoadingTestPlans = false;
    }
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
    const normalizedType = resolveWorkItemType(config.workItemType);
    this.form.patchValue(
      { workItemType: normalizedType },
      { emitEvent: false },
    );

    if (!supportsTestCasesForWorkItemType(normalizedType)) {
      this.form.patchValue(
        {
          useTestCases: false,
          ai: { cantidadTestcases: 'fixed' },
          testSuite: { planId: null },
        },
        { emitEvent: false },
      );
    }
    this.syncTestCaseRules();

    this.syncDynamicControls(
      config.fields.filter((field) => shouldRenderDynamicWorkItemField(field)),
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
    if (!this.form) {
      return;
    }

    this.dynamicFieldConfigs = syncDynamicWorkItemControls(
      this.form,
      fields,
      BUILDER_DYNAMIC_CONTROL_PREFIX,
      this.pendingDynamicWorkItemFieldValues,
    );
  }

  private removeDynamicControls(): void {
    if (!this.form) {
      return;
    }

    removeDynamicWorkItemControls(this.form, BUILDER_DYNAMIC_CONTROL_PREFIX);
  }

  async resetTemplate(): Promise<void> {
    if (this.hasResettableContent()) {
      const confirmed = await this.confirmDialog.confirm({
        title: 'Reiniciar formulario',
        message:
          'Se eliminarán los datos ingresados y los resultados generados en este formulario.',
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

    this.performTemplateReset();
  }

  private performTemplateReset(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const defaults = payloadToFormValues(TEMPLATE_PAYLOAD);
    this.form.patchValue(
      {
        need: defaults.need,
        useTestCases: defaults.useTestCases ?? true,
        tcCount: defaults.tcCount,
        tcState: defaults.tcState,
        azdoProject: defaults.azdoProject,
        workItemType: DEFAULT_WORK_ITEM_TYPE,
        iterationPath: defaults.iterationPath,
        areaPath: defaults.areaPath,
        testSuite: { planId: normalizeTestPlanId(defaults.testSuite.planId) },
        ai: { cantidadTestcases: 'fixed' },
      },
      { emitEvent: false },
    );

    for (const field of this.dynamicFieldConfigs) {
      const control = this.form.get(this.dynamicControlName(field));

      if (!control) {
        continue;
      }

      control.setValue(field.control === 'checkbox' ? false : '', {
        emitEvent: false,
      });
    }

    this.pendingDynamicWorkItemFieldValues = {};
    this.prompt = '';
    this.jsonOut = null;
    this.generationContract = null;
    this.message = '';
    this.dynamicValidationMessages = {};
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.workspaceState.setPrompt('', 'builder');
    safeRemoveSessionItem(this.builderStorageKey);
    safeRemoveLocalItem(this.builderStorageKey);
    this.toastService.info('Formulario reiniciado.');
  }

  private hasResettableContent(): boolean {
    if (this.prompt.trim() || this.jsonOut !== null) {
      return true;
    }

    const defaults = payloadToFormValues(TEMPLATE_PAYLOAD);
    const current = this.form.getRawValue();
    const currentSnapshot = {
      need: this.normalizeText(current.need),
      useTestCases: !!current.useTestCases,
      tcCount: Number(current.tcCount ?? 0),
      tcState: this.normalizeText(current.tcState),
      azdoProject: this.normalizeText(current.azdoProject),
      workItemType: resolveWorkItemType(
        current.workItemType || DEFAULT_WORK_ITEM_TYPE,
      ),
      iterationPath: this.normalizeText(current.iterationPath),
      areaPath: this.normalizeText(current.areaPath),
      testPlanId: Number(current.testSuite?.planId ?? 0),
      aiCantidadTestcases: current.ai?.cantidadTestcases === 'ai',
      hasDynamicValues: this.dynamicFieldConfigs.some((field) => {
        const value = this.form.get(this.dynamicControlName(field))?.value;
        return field.control === 'checkbox'
          ? !!value
          : value !== null &&
              value !== undefined &&
              String(value).trim() !== '';
      }),
    };
    const defaultSnapshot = {
      need: defaults.need,
      useTestCases: defaults.useTestCases ?? true,
      tcCount: defaults.tcCount,
      tcState: defaults.tcState,
      azdoProject: defaults.azdoProject,
      workItemType: DEFAULT_WORK_ITEM_TYPE,
      iterationPath: defaults.iterationPath,
      areaPath: defaults.areaPath,
      testPlanId: defaults.testSuite.planId,
      aiCantidadTestcases: false,
      hasDynamicValues: false,
    };

    return JSON.stringify(currentSnapshot) !== JSON.stringify(defaultSnapshot);
  }

  dynamicControlName(field: WorkItemFieldConfig): string {
    return dynamicWorkItemControlName(field, BUILDER_DYNAMIC_CONTROL_PREFIX);
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

    this.updatePathOptions(this.normalizeText(this.form?.value.azdoProject));
  }

  private updatePathOptions(selectedProject?: string): void {
    if (!this.form) return;

    const project = this.normalizeText(
      selectedProject ?? this.form.value.azdoProject,
    );
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

    const currentAreaPath = normalizeAzdoPath(this.form.value.areaPath, 'area');
    const currentIterationPath = normalizeAzdoPath(
      this.form.value.iterationPath,
      'iteration',
    );
    const patch: { areaPath?: string; iterationPath?: string } = {};

    if (
      currentAreaPath &&
      !this.areaPathOptions.some((option) =>
        this.isSamePath(option, currentAreaPath, 'area'),
      )
    ) {
      patch.areaPath = '';
    }

    if (
      currentIterationPath &&
      !this.iterationPathOptions.some((option) =>
        this.isSamePath(option, currentIterationPath, 'iteration'),
      )
    ) {
      patch.iterationPath = '';
    }

    if (Object.keys(patch).length > 0) {
      this.form.patchValue(patch, { emitEvent: false });
    }
  }

  private buildContextKey(organization: string, correlationId: string): string {
    return `${organization.trim()}::${correlationId.trim()}`;
  }

  private buildWorkItemConfigKey(
    organization: string,
    project: string,
    workItemType: string,
  ): string {
    const correlationId =
      this.azdoConfigService.getContextSnapshot().correlationId;
    return `${organization.trim()}::${correlationId.trim()}::${project.trim().toLowerCase()}::${workItemType.trim().toLowerCase()}`;
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

  private isSamePath(left: string, right: string, kind: AzdoPathKind): boolean {
    return (
      normalizeAzdoPath(left, kind).toLowerCase() ===
      normalizeAzdoPath(right, kind).toLowerCase()
    );
  }

  private normalizePathCollection(
    values: string[],
    kind: AzdoPathKind,
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

  private normalizePathControl(kind: 'iteration' | 'area'): void {
    const controlName = kind === 'iteration' ? 'iterationPath' : 'areaPath';
    const rawValue = this.form?.value?.[controlName];
    const normalized = normalizeAzdoPath(rawValue, kind);

    if (!this.isSamePath(rawValue ?? '', normalized, kind)) {
      if (kind === 'iteration') {
        this.form.patchValue(
          { iterationPath: normalized },
          { emitEvent: false },
        );
      } else {
        this.form.patchValue({ areaPath: normalized }, { emitEvent: false });
      }
    }
  }

  private isTimeoutMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('demasiado en responder') ||
      normalized.includes('timeout')
    );
  }

  private isMetadataEmpty(metadata: AzdoMetadataResult): boolean {
    return (
      metadata.projects.length === 0 &&
      metadata.areaPaths.length === 0 &&
      metadata.iterationPaths.length === 0 &&
      (metadata.projectMetadata?.length ?? 0) === 0
    );
  }

  private getAiValidationContext() {
    const context = this.azdoConfigService.getContextSnapshot();
    return {
      organization: context.organization,
      runtimeCredentialAvailable: this.azdoConfigService.hasRuntimeCredential(),
      azdoProject: this.form?.value?.azdoProject,
      need: this.form?.value?.need,
      iterationPath: this.form?.value?.iterationPath,
      areaPath: this.form?.value?.areaPath,
      azdoMetadataLoaded: !this.isMetadataEmpty(
        this.azdoConfigService.getMetadataSnapshot(),
      ),
      workItemConfigLoaded: !!this.workItemConfig,
    };
  }

  private getMissingRequiredDynamicFields(): WorkItemFieldConfig[] {
    return getMissingRequiredDynamicWorkItemFields(
      this.form,
      this.dynamicFieldConfigs,
      BUILDER_DYNAMIC_CONTROL_PREFIX,
    );
  }

  private getFormValues(): FormValues;
  private getFormValues(strictTestPlan: false): BuilderPersistedFormValues;
  private getFormValues(
    strictTestPlan = true,
  ): FormValues | BuilderPersistedFormValues {
    const v = this.form.value;
    const defaults = payloadToFormValues(TEMPLATE_PAYLOAD);
    const workItemType = strictTestPlan
      ? requireSupportedWorkItemType(v.workItemType)
      : resolveWorkItemType(v.workItemType || DEFAULT_WORK_ITEM_TYPE);
    const dynamicWorkItemFields = collectSanitizedDynamicWorkItemFields(
      this.form,
      this.dynamicFieldConfigs,
      BUILDER_DYNAMIC_CONTROL_PREFIX,
      workItemType,
    ).workItem;

    const values: BuilderPersistedFormValues = {
      need: v.need ?? '',
      useTestCases: !!v.useTestCases,
      tcCount: v.tcCount ?? 2,
      tcState: this.normalizeTcState(v.tcState),
      azdoProject: v.azdoProject ?? '',
      workItemType,
      iterationPath: normalizeAzdoPath(v.iterationPath, 'iteration'),
      areaPath: normalizeAzdoPath(v.areaPath, 'area'),
      workItem: { ...defaults.workItem },
      dynamicWorkItemFields,
      workItemFieldConfigs: this.workItemConfig?.fields ?? [],
      testCases: defaults.testCases,
      testSuite: {
        planId: strictTestPlan
          ? mapTestPlanIdForPayload(
              this.useTestCases,
              v.testSuite?.planId,
              this.testPlanOptions,
            )
          : normalizeTestPlanId(v.testSuite?.planId),
      },
      aiFields: {
        cantidadTestcases: v.ai?.cantidadTestcases === 'ai',
      },
    };
    return strictTestPlan
      ? ({
          ...values,
          azdoOrg: this.azdoConfigService.getContextSnapshot().organization,
        } as FormValues)
      : values;
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
      this.getRequiredFormControl('testSuite.planId'),
      enabled,
      () => ({
        state: this.testPlanCatalogState,
        options: this.testPlanOptions,
      }),
    );
  }

  private normalizeTcState(value: unknown): string {
    return this.normalizeText(value);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
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

  private persistState(): void {
    const toStore: BuilderPersistedState = {
      formValues: this.getFormValues(false),
      prompt: this.prompt,
      jsonOut: this.jsonOut,
      message: this.message,
    };
    safeRemoveLocalItem(this.builderStorageKey);
    safeSetSessionItem(this.builderStorageKey, JSON.stringify(toStore));
  }

  private restoreState(): void {
    safeRemoveLocalItem(this.builderStorageKey);
    try {
      const raw = safeGetSessionItem(this.builderStorageKey);
      if (!raw) return;
      const persisted = JSON.parse(raw) as BuilderPersistedState;
      const fv = this.normalizePersistedFormValues(persisted.formValues);
      this.form.patchValue({
        need: fv.need,
        useTestCases: fv.useTestCases ?? true,
        tcCount: fv.tcCount,
        tcState: this.normalizeTcState(fv.tcState),
        azdoProject: fv.azdoProject,
        workItemType: resolveWorkItemType(
          fv.workItemType || DEFAULT_WORK_ITEM_TYPE,
        ),
        iterationPath: normalizeAzdoPath(fv.iterationPath, 'iteration'),
        areaPath: normalizeAzdoPath(fv.areaPath, 'area'),
        testSuite: { planId: normalizeTestPlanId(fv.testSuite.planId) },
        ai: {
          cantidadTestcases: fv.aiFields?.cantidadTestcases ? 'ai' : 'fixed',
        },
      });
      this.pendingDynamicWorkItemFieldValues = {
        ...(fv.dynamicWorkItemFields ?? {}),
      };
      this.prompt = persisted.prompt ?? '';
      this.jsonOut = (persisted.jsonOut as WorkItemPayload) ?? null;
      this.message = persisted.message ?? '';
    } catch {
      safeRemoveSessionItem(this.builderStorageKey);
    }
  }

  private normalizePersistedFormValues(
    rawInput: Partial<BuilderPersistedFormValues> | undefined,
  ): FormValues {
    const defaults = payloadToFormValues(TEMPLATE_PAYLOAD);
    const rawValues = (rawInput ?? {}) as Partial<FormValues> &
      Record<string, unknown>;
    const rawWorkItem = (rawValues.workItem ?? {}) as Partial<
      FormValues['workItem']
    >;
    const rawTestSuite = (rawValues.testSuite ?? {}) as Partial<
      FormValues['testSuite']
    >;
    const rawAiFields = (rawValues.aiFields ?? {}) as Partial<
      FormValues['aiFields']
    >;

    return {
      need: typeof rawValues.need === 'string' ? rawValues.need : defaults.need,
      useTestCases:
        typeof rawValues.useTestCases === 'boolean'
          ? rawValues.useTestCases
          : (defaults.useTestCases ?? true),
      tcCount: Number(rawValues.tcCount ?? defaults.tcCount),
      tcState: this.normalizeTcState(rawValues.tcState),
      azdoOrg: this.azdoConfigService.getContextSnapshot().organization,
      azdoProject:
        typeof rawValues.azdoProject === 'string'
          ? rawValues.azdoProject
          : defaults.azdoProject,
      iterationPath:
        typeof rawValues.iterationPath === 'string'
          ? rawValues.iterationPath
          : defaults.iterationPath,
      areaPath:
        typeof rawValues.areaPath === 'string'
          ? rawValues.areaPath
          : defaults.areaPath,
      workItemType:
        typeof rawValues.workItemType === 'string'
          ? rawValues.workItemType
          : DEFAULT_WORK_ITEM_TYPE,
      workItem: {
        ...defaults.workItem,
        priority: this.toPersistedStringOrNumber(
          rawWorkItem.priority,
          defaults.workItem.priority,
        ),
        storyPoints: this.toPersistedStringOrNumber(
          rawWorkItem.storyPoints,
          defaults.workItem.storyPoints ?? '',
        ),
        risk: String(rawWorkItem.risk ?? defaults.workItem.risk),
        startDate: String(rawWorkItem.startDate ?? defaults.workItem.startDate),
        finishDate: String(
          rawWorkItem.finishDate ?? defaults.workItem.finishDate,
        ),
        valueArea: String(rawWorkItem.valueArea ?? defaults.workItem.valueArea),
        tipoHU: String(rawWorkItem.tipoHU ?? defaults.workItem.tipoHU),
        frenteDeTrabajo: String(
          rawWorkItem.frenteDeTrabajo ?? defaults.workItem.frenteDeTrabajo,
        ),
        assignedTo: String(
          rawWorkItem.assignedTo ?? defaults.workItem.assignedTo,
        ),
      },
      dynamicWorkItemFields: this.toPersistedRecord(
        rawValues.dynamicWorkItemFields,
      ),
      testCases: defaults.testCases,
      testSuite: {
        planId: Number(
          rawTestSuite.planId ??
            rawValues['testSuite.planId'] ??
            defaults.testSuite.planId,
        ),
      },
      aiFields: {
        cantidadTestcases: !!(
          rawAiFields.cantidadTestcases ?? rawValues['ai.cantidadTestcases']
        ),
      },
    };
  }

  private toPersistedStringOrNumber(
    value: unknown,
    fallback: string | number,
  ): string | number {
    return typeof value === 'string' || typeof value === 'number'
      ? value
      : fallback;
  }

  private toPersistedRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }
}
