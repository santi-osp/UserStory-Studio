import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { PreviewComponent } from './preview.component';
import { ApiService } from '../../services/api.service';
import { WorkItemFieldConfig, WorkItemPayload } from '../../models/types';
import { WorkItemWorkspaceStateService } from '../../services/work-item-workspace-state.service';
import { PreviewHistoryService } from '../../services/preview-history.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { AzdoConfigService } from '../../services/azdo-config.service';
import {
  TEST_CASE_REFINEMENT_SUITE_TITLE,
  TEST_CASE_STATE_TRANSPORT_MARKER,
} from '../../prompts/work-items/refinement/refine-test-cases.prompt';
import { WorkItemPromptContract } from '../../prompts/work-items';
import { RichTextEditorComponent } from '../shared/rich-text-editor/rich-text-editor.component';
import { TestCaseEditorComponent } from '../shared/test-case-editor/test-case-editor.component';

describe('PreviewComponent', () => {
  let fixture: ComponentFixture<PreviewComponent>;
  let component: PreviewComponent;
  let api: jasmine.SpyObj<ApiService>;
  let workspaceState: WorkItemWorkspaceStateService;
  let previewHistory: PreviewHistoryService;
  let router: Router;
  let toastService: jasmine.SpyObj<ToastService>;
  let azdoConfigService: jasmine.SpyObj<AzdoConfigService>;
  let confirmDialog: jasmine.SpyObj<ConfirmDialogService>;

  const payload: WorkItemPayload = {
    azdoOrg: 'org',
    azdoProject: 'project',
    iterationPath: 'project\\sprint',
    areaPath: 'project\\area',
    workItemType: 'User Story',
    workItem: {
      title: 'Work Item',
      description: '<p>desc</p>',
      acceptanceCriteria:
        '<p><strong>AC1 - Escenario: consulta</strong><br>Dado un usuario Cuando consulta Entonces obtiene resultados</p>',
      priority: 1,
      risk: '2 - Medium',
      startDate: '',
      finishDate: '',
      valueArea: '',
      tipoHU: '',
      frenteDeTrabajo: '',
      assignedTo: 'user@example.com',
    },
    testCases: [
      {
        title: 'TC 1 - A',
        state: 'Ready',
        steps: [{ action: 'a', expected: 'e' }],
      },
      {
        title: 'TC 3 - B',
        state: 'Ready',
        steps: [{ action: 'a', expected: 'e' }],
      },
    ],
    testSuite: {
      planId: 0,
    },
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'generate',
      'generateTestCases',
      'create',
      'createPrepared',
      'fetchWorkItemConfig',
      'getFreshWorkItemConfig',
    ]);
    toastService = jasmine.createSpyObj<ToastService>('ToastService', [
      'success',
      'info',
      'error',
      'warning',
    ]);
    confirmDialog = jasmine.createSpyObj<ConfirmDialogService>(
      'ConfirmDialogService',
      ['confirm'],
    );
    confirmDialog.confirm.and.resolveTo(true);
    azdoConfigService = jasmine.createSpyObj<AzdoConfigService>(
      'AzdoConfigService',
      ['hasRuntimeCredential', 'getContextSnapshot', 'getOrganization'],
    );
    azdoConfigService.hasRuntimeCredential.and.returnValue(true);
    azdoConfigService.getOrganization.and.returnValue('org');
    azdoConfigService.getContextSnapshot.and.returnValue({
      organization: 'org',
      correlationId: 'context-1',
    });
    api.generate.and.resolveTo({
      json: JSON.stringify(payload),
      raw: JSON.stringify(payload),
    });
    api.generateTestCases.and.resolveTo({ json: '', raw: '' });
    api.create.and.resolveTo({
      huId: 1,
      huUrl: 'https://example/1',
      message: 'Creado',
    });
    api.createPrepared.and.resolveTo({
      huId: 1,
      huUrl: 'https://example/1',
      message: 'Creado',
    });
    api.fetchWorkItemConfig.and.callFake(
      (project: string, workItemType: string) =>
        Promise.resolve({
          project,
          workItemType: workItemType || 'User Story',
          fields: createWorkItemFields(workItemType || 'User Story'),
        }),
    );
    api.getFreshWorkItemConfig.and.callFake(
      (project: string, workItemType: string) => ({
        project,
        workItemType: workItemType || 'User Story',
        fields: createWorkItemFields(workItemType || 'User Story'),
      }),
    );
    await TestBed.configureTestingModule({
      imports: [PreviewComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ToastService, useValue: toastService },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: AzdoConfigService, useValue: azdoConfigService },
        WorkItemWorkspaceStateService,
        provideRouter([]),
      ],
    }).compileComponents();

    workspaceState = TestBed.inject(WorkItemWorkspaceStateService);
    workspaceState.setPrompt('', 'builder', 'system prompt de prueba');
    previewHistory = TestBed.inject(PreviewHistoryService);
    router = TestBed.inject(Router);
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(PreviewComponent);
    component = fixture.componentInstance;
    component.systemPromptInput = 'system prompt de prueba';
    fixture.detectChanges();
  }

  async function loadPreviewThroughGeneration(
    value: WorkItemPayload,
    responseValue: unknown = value,
  ): Promise<void> {
    const contract = buildPreviewContract(value);
    const generated = structuredClone(responseValue) as unknown as Record<
      string,
      unknown
    >;
    if (responseValue === value && !contract.testCases.enabled) {
      delete generated['testCases'];
      delete generated['testSuite'];
    }
    api.generate.and.resolveTo({
      json: JSON.stringify(generated),
      raw: JSON.stringify(generated),
    });
    attachGenerationContext(value, contract);
    component.promptInput = 'prompt de prueba';
    await component.callBackendGenerate();
    fixture.detectChanges();
  }

  function attachGenerationContext(
    value: WorkItemPayload,
    contract = buildPreviewContract(value),
  ): void {
    const generationState = component as unknown as {
      generationBasePayload: WorkItemPayload;
      generationContract: WorkItemPromptContract;
    };
    generationState.generationBasePayload = structuredClone(value);
    generationState.generationContract = contract;
  }

  function withoutTestCaseRoots(value: WorkItemPayload): Record<string, unknown> {
    const response = structuredClone(value) as unknown as Record<string, unknown>;
    delete response['testCases'];
    delete response['testSuite'];
    return response;
  }

  function buildPreviewContract(value: WorkItemPayload): WorkItemPromptContract {
    const workItemType = (value.workItemType || 'User Story') as
      | 'Epic'
      | 'Feature'
      | 'User Story';
    const allowed = Object.keys(value.workItem);
    const acceptanceSupported = Object.prototype.hasOwnProperty.call(
      value.workItem,
      'acceptanceCriteria',
    );
    const editable = [
      'title',
      'description',
      ...(acceptanceSupported ? ['acceptanceCriteria'] : []),
    ];
    const enabled = workItemType === 'User Story' && value.testCases.length > 0;
    return {
      workItemType,
      metadataState: 'confirmed',
      metadata: createWorkItemFields(workItemType),
      allowedWorkItemFields: allowed,
      aiEditableWorkItemFields: editable,
      preservedWorkItemFields: allowed.filter((key) => !editable.includes(key)),
      prohibitedWorkItemFields: acceptanceSupported ? [] : ['acceptanceCriteria'],
      azureRequiredWorkItemFields: ['title', 'description'],
      generationRequiredWorkItemFields: editable,
      acceptanceCriteria: {
        supported: acceptanceSupported,
        requiredByAzure: false,
        requiredForGeneration: acceptanceSupported,
      },
      testCases: {
        supported: workItemType === 'User Story',
        enabled,
        countMode: enabled ? 'fixed' : 'disabled',
        fixedCount: enabled ? value.testCases.length : 0,
        state: enabled ? value.testCases[0].state : '',
        planId: enabled ? value.testSuite.planId : 0,
      },
      semanticProfile: {
        descriptionRules: [],
        acceptanceCriteriaRules: [],
        descriptionTemplate: '',
      },
      aiTemplate: {
        azdoOrg: value.azdoOrg,
        azdoProject: value.azdoProject,
        workItemType,
        iterationPath: value.iterationPath,
        areaPath: value.areaPath,
        workItem: { ...value.workItem },
        ...(enabled
          ? {
              testCases: value.testCases,
              testSuite: value.testSuite,
            }
          : {}),
      },
    };
  }

  function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
  } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  async function nextAnimationFrame(): Promise<void> {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }

  async function prepareCreation(): Promise<void> {
    component.createInAzureDevOps();
    expect(component.creationDialogState?.phase).toBe('preparing');
    await nextAnimationFrame();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function createPreparedWorkItem(): Promise<void> {
    await prepareCreation();
    expect(component.creationDialogState?.phase).toBe('ready');
    await component.confirmPreparedCreation();
    fixture.detectChanges();
  }

  it('keeps Preview visible and blocks connected actions without a runtime PAT', async () => {
    azdoConfigService.hasRuntimeCredential.and.returnValue(false);
    createComponent();
    component.parsed = structuredClone(payload);
    component.historyItems = previewHistory.save(payload, 'designer');
    component.promptInput = 'prompt local';
    fixture.detectChanges();

    component.createInAzureDevOps();
    await nextAnimationFrame();
    await component.callBackendGenerate();

    expect(component.parsed?.workItem.title).toBe(payload.workItem.title);
    expect(component.historyItems.length).toBe(1);
    expect(api.createPrepared).not.toHaveBeenCalled();
    expect(api.generate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      'Ir a Configuración Azure',
    );
    expect(component.creationDialogState?.error).toContain('Azure PAT');
  });

  function field(
    name: string,
    referenceName: string,
    required = false,
  ): WorkItemFieldConfig {
    return {
      name,
      referenceName,
      label: name,
      type: 'string',
      required,
      control: 'input',
      options: [],
    };
  }

  function createWorkItemFields(workItemType: string): WorkItemFieldConfig[] {
    if (workItemType === 'Test Case') {
      return [
        {
          ...field('state', 'System.State', true),
          control: 'select',
          options: ['Design', 'Ready', 'Closed'],
        },
      ];
    }

    const common = [
      field('title', 'System.Title', true),
      field('description', 'System.Description', true),
      field('priority', 'Microsoft.VSTS.Common.Priority'),
      field('risk', 'Microsoft.VSTS.Common.Risk'),
      field('startDate', 'Microsoft.VSTS.Scheduling.StartDate'),
      field('finishDate', 'Microsoft.VSTS.Scheduling.FinishDate'),
      field('valueArea', 'Microsoft.VSTS.Common.ValueArea'),
      field('tipoHU', 'Custom.TipoHU'),
      field('frenteDeTrabajo', 'Custom.FrenteDeTrabajo'),
      field('assignedTo', 'System.AssignedTo'),
    ];

    if (workItemType === 'User Story') {
      return [
        ...common,
        field('acceptanceCriteria', 'Microsoft.VSTS.Common.AcceptanceCriteria'),
        field('storyPoints', 'Microsoft.VSTS.Scheduling.StoryPoints'),
      ];
    }

    return common;
  }

  function createRequiredValueAreaFields(
    workItemType: string,
  ): WorkItemFieldConfig[] {
    return createWorkItemFields(workItemType).map((item) =>
      item.referenceName === 'Microsoft.VSTS.Common.ValueArea'
        ? { ...item, name: 'Value Area', label: 'Value Area', required: true }
        : item,
    );
  }

  function createRequiredBusinessValueFields(
    workItemType: string,
  ): WorkItemFieldConfig[] {
    return [
      ...createWorkItemFields(workItemType).filter(
        (item) => item.referenceName !== 'Microsoft.VSTS.Common.ValueArea',
      ),
      field('Business Value', 'Microsoft.VSTS.Common.BusinessValue', true),
    ];
  }

  afterEach(() => {
    fixture?.destroy();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should generate preview from IA without creating in Azure DevOps', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);

    expect(api.generate).toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    expect(component.parsed?.testCases.map((item) => item.title)).toEqual([
      'TC 1 - A',
      'TC 2 - B',
    ]);
    expect(component.historyItems.length).toBe(1);
    expect(component.historyItems[0]).toEqual(
      jasmine.objectContaining({
        source: 'designer',
        versionType: 'generated',
        title: 'Work Item',
        project: 'project',
        workItemType: 'User Story',
        testCasesCount: 2,
      }),
    );
    expect(
      sessionStorage.getItem('work-item.preview.history.v2'),
    ).not.toBeNull();
  });

  it('should keep manual content and Test Case edits local without writing history', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    const historySave = spyOn(previewHistory, 'save').and.callThrough();

    component.contentForm.controls.title.setValue('Título editado localmente');
    component.contentForm.controls.description.setValue(
      '<p>Descripción local</p>',
    );
    component.contentForm.controls.acceptanceCriteria.setValue(
      '<p>AC local</p>',
    );
    component.updateTestCase(0, {
      testCase: {
        ...component.parsed!.testCases[0],
        title: 'Test Case editado',
      },
      kind: 'field',
    });
    component.testCaseStateOptions = ['Design', 'Ready'];
    await component.addTestCase();
    component.requestDeleteTestCase(0);

    expect(historySave).not.toHaveBeenCalled();
    expect(component.previewHasManualChanges).toBeTrue();
    expect(component.historyItems.length).toBe(1);
  });

  it('should save exactly one semantic version when accepting a refinement', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    const originalTestCases = structuredClone(component.parsed!.testCases);
    component.refinementCandidate = {
      scope: 'content',
      content: { title: 'Título refinado' },
      supportedFields: ['title'],
      selectedFields: ['title'],
      changedFields: ['title'],
      baseFingerprint: previewHistory.fingerprint(component.parsed!),
    };
    const historySave = spyOn(previewHistory, 'save').and.callThrough();

    component.acceptRefinement();

    expect(historySave).toHaveBeenCalledTimes(1);
    expect(component.historyItems[0]).toEqual(
      jasmine.objectContaining({
        versionType: 'refinementAccepted',
        refinementScope: 'content',
        source: 'designer',
      }),
    );
    expect(component.parsed?.workItem.title).toBe('Título refinado');
    expect(component.parsed?.testCases).toEqual(originalTestCases);
    expect(component.activeHistoryEntryId).toBe(component.historyItems[0].id);
    expect(component.previewHasManualChanges).toBeFalse();
  });

  it('should preserve the functional source when refining a restored version', async () => {
    const historyItem = previewHistory.save(payload, 'fromText')[0];
    createComponent();
    await component.restoreHistoryItem(historyItem);
    component.refinementCandidate = {
      scope: 'content',
      content: { description: '<p>Contenido refinado</p>' },
      supportedFields: ['description'],
      selectedFields: ['description'],
      changedFields: ['description'],
      baseFingerprint: previewHistory.fingerprint(component.parsed!),
    };

    component.acceptRefinement();

    expect(component.historyItems[0]).toEqual(
      jasmine.objectContaining({
        source: 'fromText',
        versionType: 'refinementAccepted',
        refinementScope: 'content',
      }),
    );
  });

  it('should discard a refinement without creating a history version', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    component.refinementCandidate = {
      scope: 'content',
      content: { title: 'Título descartado' },
      supportedFields: ['title'],
      selectedFields: ['title'],
      changedFields: ['title'],
      baseFingerprint: previewHistory.fingerprint(component.parsed!),
    };
    const historySave = spyOn(previewHistory, 'save').and.callThrough();

    component.discardRefinement();

    expect(historySave).not.toHaveBeenCalled();
    expect(component.refinementCandidate).toBeNull();
    expect(component.parsed?.workItem.title).toBe('Work Item');
  });

  it('should generate a Test Case candidate through the specialized endpoint without mutating Preview', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    const before = structuredClone(component.parsed!);
    component.showRefinementModal = true;
    api.generateTestCases.and.resolveTo({
      json: JSON.stringify({
        suiteTitle: TEST_CASE_REFINEMENT_SUITE_TITLE,
        testCases: [
          {
            title: '[tc-2] Pago mejorado',
            state: TEST_CASE_STATE_TRANSPORT_MARKER,
            steps: [{ action: 'Pagar', expected: 'Pago aprobado' }],
          },
        ],
      }),
    });

    await component.generateRefinement({
      scope: 'testCases',
      mode: 'improve',
      instructions: 'Hacer verificable',
      selectedTestCases: [
        {
          ref: 'tc-2',
          position: 1,
          title: before.testCases[1].title,
          steps: before.testCases[1].steps,
        },
      ],
    });

    expect(api.generateTestCases).toHaveBeenCalledTimes(1);
    expect(api.generate).toHaveBeenCalledTimes(1);
    expect(component.parsed).toEqual(before);
    expect(component.refinementCandidate).toEqual(
      jasmine.objectContaining({
        scope: 'testCases',
        selectedRefs: ['tc-2'],
      }),
    );
    const request = api.generateTestCases.calls.mostRecent().args[0];
    expect(request.prompt).not.toContain('Ready');
    expect(request.prompt).not.toContain(before.testCases[0].title);
  });

  it('should accept only proposed title and steps while preserving states, order, unknown fields and history semantics', async () => {
    createComponent();
    await loadPreviewThroughGeneration({
      ...payload,
      testCases: [
        { ...payload.testCases[0], localId: 'keep-a' },
        { ...payload.testCases[1], localId: 'keep-b' },
      ],
    });
    component.parsed!.testCases[1].state = 'Design';
    component.contentForm.controls.title.setValue('Cambio manual previo');
    const base = structuredClone(component.parsed!);
    component.refinementCandidate = {
      scope: 'testCases',
      mode: 'regenerate',
      selectedRefs: ['tc-2'],
      proposals: [
        {
          ref: 'tc-2',
          position: 1,
          title: 'Caso regenerado',
          steps: [{ action: 'Nueva accion', expected: 'Nuevo resultado' }],
        },
      ],
      baseFingerprint: previewHistory.fingerprint(base),
    };
    const historySave = spyOn(previewHistory, 'save').and.callThrough();

    component.acceptRefinement();

    expect(component.parsed?.workItem.title).toBe('Cambio manual previo');
    expect(component.parsed?.testCases[0]).toEqual(base.testCases[0]);
    expect(component.parsed?.testCases[1]).toEqual(
      jasmine.objectContaining({
        title: 'Caso regenerado',
        state: 'Design',
        localId: 'keep-b',
      }),
    );
    expect(component.parsed?.testCases[1].steps).toEqual([
      { action: 'Nueva accion', expected: 'Nuevo resultado' },
    ]);
    expect(historySave).toHaveBeenCalledTimes(1);
    expect(component.historyItems[0]).toEqual(
      jasmine.objectContaining({
        versionType: 'refinementAccepted',
        refinementScope: 'testCases',
      }),
    );
  });

  it('should discard a Test Case candidate without changing payload or history', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    const before = structuredClone(component.parsed!);
    component.refinementCandidate = {
      scope: 'testCases',
      mode: 'improve',
      selectedRefs: ['tc-1'],
      proposals: [
        {
          ref: 'tc-1',
          position: 0,
          title: 'Descartado',
          steps: [{ action: 'x', expected: 'y' }],
        },
      ],
      baseFingerprint: previewHistory.fingerprint(before),
    };
    const save = spyOn(previewHistory, 'save').and.callThrough();

    component.discardRefinement();

    expect(component.parsed).toEqual(before);
    expect(component.refinementCandidate).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('should render proposed cases inline while keeping unselected cases and original states visible', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    component.refinementCandidate = {
      scope: 'testCases',
      mode: 'improve',
      selectedRefs: ['tc-1'],
      proposals: [
        {
          ref: 'tc-1',
          position: 0,
          title: 'Caso propuesto',
          steps: [
            { action: 'Accion propuesta', expected: 'Resultado propuesto' },
          ],
        },
      ],
      baseFingerprint: previewHistory.fingerprint(component.parsed!),
    };
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(
      fixture.nativeElement.querySelector('.preview-test-case-proposal'),
    ).not.toBeNull();
    expect(text).toContain('Caso propuesto');
    expect(text).toContain('El estado se conservará sin cambios');
    expect(
      (
        fixture.nativeElement.querySelector(
          '#test-case-title-1',
        ) as HTMLInputElement
      ).value,
    ).toBe('TC 2 - B');
    expect(text).toContain('Ready');
  });

  it('should keep the modal open with a retryable error after an invalid specialized response', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    component.showRefinementModal = true;
    api.generateTestCases.and.resolveTo({ json: '{invalid' });

    await component.generateRefinement({
      scope: 'testCases',
      mode: 'regenerate',
      instructions: 'Regenerar',
      selectedTestCases: [
        {
          ref: 'tc-1',
          position: 0,
          title: 'A',
          steps: [{ action: 'a', expected: 'e' }],
        },
      ],
    });

    expect(component.showRefinementModal).toBeTrue();
    expect(component.refinementCandidate).toBeNull();
    expect(component.refinementError).toContain('propuesta valida');
  });

  it('should ignore stale Test Case responses and prevent double submit', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    component.showRefinementModal = true;
    const pending = deferred<{ json: string }>();
    api.generateTestCases.and.returnValue(pending.promise);
    const request = {
      scope: 'testCases' as const,
      mode: 'improve' as const,
      instructions: 'Mejorar',
      selectedTestCases: [
        {
          ref: 'tc-1',
          position: 0,
          title: 'A',
          steps: [{ action: 'a', expected: 'e' }],
        },
      ],
    };

    const first = component.generateRefinement(request);
    const second = component.generateRefinement(request);
    component.parsed = {
      ...component.parsed!,
      workItem: { ...component.parsed!.workItem, title: 'Cambio' },
    };
    pending.resolve({
      json: JSON.stringify({
        suiteTitle: TEST_CASE_REFINEMENT_SUITE_TITLE,
        testCases: [
          {
            title: '[tc-1] Mejorado',
            state: TEST_CASE_STATE_TRANSPORT_MARKER,
            steps: [{ action: 'A', expected: 'E' }],
          },
        ],
      }),
    });
    await Promise.all([first, second]);

    expect(api.generateTestCases).toHaveBeenCalledTimes(1);
    expect(component.refinementCandidate).toBeNull();
    expect(component.refinementError).toContain('version actual');
  });

  it('should render active, local-change and sticky action states', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.preview-sticky-actions'),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Visualizando ahora');
    expect(
      fixture.nativeElement.querySelector('.preview-refinement-action-card'),
    ).toBeNull();

    component.contentForm.controls.title.setValue('Cambio local visible');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Con cambios locales');
    expect(fixture.nativeElement.textContent).toContain('Base de la vista');
    expect(fixture.nativeElement.textContent).toContain(
      'Tienes cambios locales sobre esta versión',
    );
  });

  it('should select Ready case-insensitively, fall back safely and never invent a state', async () => {
    createComponent();
    component.parsed = structuredClone({ ...payload, testCases: [] });
    component.testCaseStateOptions = ['Design', 'Ready', 'Closed'];

    await component.addTestCase();
    expect(component.parsed.testCases[0].state).toBe('Ready');

    component.parsed = structuredClone({ ...payload, testCases: [] });
    component.testCaseStateOptions = ['Design', 'ready', 'Closed'];

    await component.addTestCase();
    expect(component.parsed.testCases[0].state).toBe('ready');

    component.parsed = structuredClone({ ...payload, testCases: [] });
    component.testCaseStateOptions = ['New', 'Closed'];
    await component.addTestCase();
    expect(component.parsed.testCases[0].state).toBe('New');

    component.parsed = structuredClone({ ...payload, testCases: [] });
    component.testCaseStateOptions = [];
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'project',
      workItemType: 'Test Case',
      fields: [
        {
          ...field('state', 'System.State', true),
          control: 'select',
          options: [],
        },
      ],
    });
    await component.addTestCase();
    expect(component.parsed.testCases[0].state).toBe('');
    expect(component.isValidTestCaseState('')).toBeFalse();
    expect(toastService.warning).toHaveBeenCalledWith(
      'Azure DevOps no devolvió estados válidos. El Test Case se conservó pendiente de selección.',
      { title: 'Completa el estado cuando esté disponible' },
    );
  });

  it('should restore required Value Area from builder payload when IA omits it with a selected Test Suite', async () => {
    const builderPayload: WorkItemPayload = {
      ...payload,
      workItem: {
        ...payload.workItem,
        title: 'Historia base',
        valueArea: 'Negocio',
        priority: 2,
      },
      testSuite: { planId: 10 },
    };
    const generatedPayload: WorkItemPayload = {
      ...payload,
      workItem: {
        ...payload.workItem,
        title: 'Historia',
        description: '<p>desc</p>',
        acceptanceCriteria: payload.workItem.acceptanceCriteria,
        valueArea: '',
        priority: '',
      },
      testSuite: { planId: 10 },
    };
    api.generate.and.resolveTo({
      json: JSON.stringify(generatedPayload),
      raw: JSON.stringify(generatedPayload),
    });
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'project',
      workItemType: 'User Story',
      fields: [
        field('Title', 'System.Title', true),
        field('Description', 'System.Description', true),
        field(
          'Acceptance Criteria',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ),
        field('Value Area', 'Microsoft.VSTS.Common.ValueArea', true),
        field('Priority', 'Microsoft.VSTS.Common.Priority'),
      ],
    });
    workspaceState.preparePreview(
      'prompt',
      'builder',
      builderPayload,
      buildPreviewContract(builderPayload),
    );
    createComponent();
    await fixture.whenStable();

    expect(component.error).toBe('');
    expect(component.parsed?.workItem.valueArea).toBe('Negocio');
    expect(component.parsed?.workItem.priority).toBe(2);
    expect(component.parsed?.workItem.title).toBe('Historia');
    expect(component.parsed?.testSuite).toEqual({ planId: 10 });
  });

  ['Feature', 'Epic'].forEach((workItemType) => {
    it(`should restore required Value Area for ${workItemType} from builder payload when IA omits it`, async () => {
      const builderPayload: WorkItemPayload = {
        ...payload,
        workItemType,
        workItem: {
          ...payload.workItem,
          valueArea: 'Negocio',
          priority: 2,
        },
        testCases: [],
        testSuite: { planId: 0 },
      };
      const generatedPayload: WorkItemPayload = {
        ...payload,
        workItemType,
        workItem: {
          ...payload.workItem,
          title: `${workItemType} generado`,
          description: '<p>desc generada</p>',
          valueArea: '',
          priority: '',
        },
        testCases: [],
        testSuite: { planId: 0 },
      };
      const generatedResponse = withoutTestCaseRoots(generatedPayload);
      api.generate.and.resolveTo({
        json: JSON.stringify(generatedResponse),
        raw: JSON.stringify(generatedResponse),
      });
      api.fetchWorkItemConfig.and.resolveTo({
        project: 'project',
        workItemType,
        fields: createRequiredValueAreaFields(workItemType),
      });
      workspaceState.preparePreview(
        'prompt',
        'builder',
        builderPayload,
        buildPreviewContract(builderPayload),
      );
      createComponent();
      await fixture.whenStable();

      expect(component.error).toBe('');
      expect(component.parsed?.workItem.valueArea).toBe('Negocio');
      expect(component.parsed?.workItem.priority).toBe(2);
      expect(component.parsed?.workItem['valueArea2']).toBeUndefined();
      expect(component.parsed?.workItem.title).toBe(`${workItemType} generado`);
      expect(component.parsed?.testCases).toEqual([]);
      expect(component.parsed?.testSuite).toEqual({ planId: 0 });
    });

    it(`should restore required Business Value for ${workItemType} without mapping it to valueArea`, async () => {
      const builderPayload: WorkItemPayload = {
        ...payload,
        workItemType,
        workItem: {
          ...payload.workItem,
          valueArea: '',
          businessValue: 'Negocio',
        },
        testCases: [],
        testSuite: { planId: 0 },
      };
      const generatedPayload: WorkItemPayload = {
        ...payload,
        workItemType,
        workItem: {
          ...payload.workItem,
          title: `${workItemType} generado`,
          description: '<p>desc generada</p>',
          valueArea: '',
        },
        testCases: [],
        testSuite: { planId: 0 },
      };
      const generatedResponse = withoutTestCaseRoots(generatedPayload);
      api.generate.and.resolveTo({
        json: JSON.stringify(generatedResponse),
        raw: JSON.stringify(generatedResponse),
      });
      api.fetchWorkItemConfig.and.resolveTo({
        project: 'project',
        workItemType,
        fields: createRequiredBusinessValueFields(workItemType),
      });
      workspaceState.preparePreview(
        'prompt',
        'builder',
        builderPayload,
        buildPreviewContract(builderPayload),
      );
      createComponent();
      await fixture.whenStable();

      expect(component.error).toBe('');
      expect(component.parsed?.workItem['businessValue']).toBe('Negocio');
      expect(component.parsed?.workItem.valueArea).toBeUndefined();
      expect(component.parsed?.workItem['Business Value']).toBeUndefined();
      expect(component.parsed?.workItem['valueArea2']).toBeUndefined();
      expect(component.parsed?.workItem.title).toBe(`${workItemType} generado`);
      expect(component.parsed?.testCases).toEqual([]);
      expect(component.parsed?.testSuite).toEqual({ planId: 0 });
    });
  });

  it('should preview User Story with required Value Area and no Test Suite', async () => {
    const generatedPayload: WorkItemPayload = {
      ...payload,
      workItem: {
        ...payload.workItem,
        title: 'Historia',
        description: '<p>desc</p>',
        acceptanceCriteria: payload.workItem.acceptanceCriteria,
        valueArea: 'Negocio',
      },
      testCases: [],
      testSuite: { planId: 0 },
    };
    api.generate.and.resolveTo({
      json: JSON.stringify(generatedPayload),
      raw: JSON.stringify(generatedPayload),
    });
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'project',
      workItemType: 'User Story',
      fields: [
        field('Title', 'System.Title', true),
        field('Description', 'System.Description', true),
        field(
          'Acceptance Criteria',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ),
        field('Value Area', 'Microsoft.VSTS.Common.ValueArea', true),
      ],
    });
    createComponent();
    await loadPreviewThroughGeneration(generatedPayload);

    expect(component.error).toBe('');
    expect(component.parsed?.workItem.valueArea).toBe('Negocio');
    expect(component.parsed?.testSuite).toEqual({ planId: 0 });
  });

  it('should block preview when required User Story Value Area is missing from IA and builder payload', async () => {
    const builderPayload: WorkItemPayload = {
      ...payload,
      workItem: {
        ...payload.workItem,
        valueArea: '',
      },
      testSuite: { planId: 10 },
    };
    const generatedPayload: WorkItemPayload = {
      ...payload,
      workItem: {
        ...payload.workItem,
        title: 'Historia',
        description: '<p>desc</p>',
        acceptanceCriteria: payload.workItem.acceptanceCriteria,
        valueArea: '',
      },
      testSuite: { planId: 10 },
    };
    api.generate.and.resolveTo({
      json: JSON.stringify(generatedPayload),
      raw: JSON.stringify(generatedPayload),
    });
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'project',
      workItemType: 'User Story',
      fields: [
        field('Title', 'System.Title', true),
        field('Description', 'System.Description', true),
        field(
          'Acceptance Criteria',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ),
        field('Value Area', 'Microsoft.VSTS.Common.ValueArea', true),
      ],
    });
    workspaceState.preparePreview(
      'prompt',
      'builder',
      builderPayload,
      buildPreviewContract(builderPayload),
    );
    createComponent();
    await fixture.whenStable();

    expect(component.parsed).toBeNull();
    expect(component.error).toContain(
      'Faltan campos obligatorios del tipo User Story: Value Area',
    );
  });

  ['Feature', 'Epic'].forEach((workItemType) => {
    it(`should block preview when required ${workItemType} Value Area is missing from IA and builder payload`, async () => {
      const builderPayload: WorkItemPayload = {
        ...payload,
        workItemType,
        workItem: {
          ...payload.workItem,
          valueArea: '',
        },
        testCases: [],
        testSuite: { planId: 0 },
      };
      const generatedPayload: WorkItemPayload = {
        ...payload,
        workItemType,
        workItem: {
          ...payload.workItem,
          title: `${workItemType} generado`,
          description: '<p>desc generada</p>',
          valueArea: '',
        },
        testCases: [],
        testSuite: { planId: 0 },
      };
      const generatedResponse = withoutTestCaseRoots(generatedPayload);
      api.generate.and.resolveTo({
        json: JSON.stringify(generatedResponse),
        raw: JSON.stringify(generatedResponse),
      });
      api.fetchWorkItemConfig.and.resolveTo({
        project: 'project',
        workItemType,
        fields: createRequiredValueAreaFields(workItemType),
      });
      workspaceState.preparePreview(
        'prompt',
        'builder',
        builderPayload,
        buildPreviewContract(builderPayload),
      );
      createComponent();
      await fixture.whenStable();

      expect(component.parsed).toBeNull();
      expect(component.error).toContain(
        `Faltan campos obligatorios del tipo ${workItemType}: Value Area`,
      );
    });
  });

  it('should block IA generation when the prompt is missing', async () => {
    createComponent();
    component.promptInput = '   ';

    await component.callBackendGenerate();

    expect(api.generate).not.toHaveBeenCalled();
    expect(component.error).toContain(
      'información necesaria para la generación',
    );
    expect(toastService.error).not.toHaveBeenCalled();
  });

  it('should not register failed or invalid generations', async () => {
    createComponent();
    attachGenerationContext(payload);
    component.promptInput = 'prompt inválido';
    api.generate.and.resolveTo({
      json: '{invalid',
      raw: 'respuesta incompleta',
    });
    const historySave = spyOn(previewHistory, 'save').and.callThrough();

    await component.callBackendGenerate();

    expect(historySave).not.toHaveBeenCalled();
    expect(component.historyItems).toEqual([]);
    expect(component.parsed).toBeNull();
    expect(component.activeHistoryEntryId).toBeNull();
    expect(sessionStorage.getItem('work-item.preview.history.v2')).toBeNull();
  });

  it('should keep the generation input internal in Preview', () => {
    workspaceState.setPrompt('prompt', 'builder');
    createComponent();

    expect(fixture.nativeElement.querySelector('#preview-prompt')).toBeNull();
    expect(fixture.nativeElement.textContent as string).not.toContain(
      'Prompt que se enviará',
    );
  });

  it('should preserve the builder flow and auto-generate after navigating to preview', async () => {
    workspaceState.preparePreview(
      'prompt',
      'builder',
      payload,
      buildPreviewContract(payload),
    );
    createComponent();
    await fixture.whenStable();

    expect(component.promptInput).toBe('prompt');
    expect(api.generate).toHaveBeenCalled();
    expect(component.parsed?.workItem.title).toBe('Work Item');
    expect(component.historyItems[0].source).toBe('designer');
  });

  it('should prioritize a pending generation over the latest stored version', async () => {
    previewHistory.save(
      {
        ...payload,
        workItem: { ...payload.workItem, title: 'Versión histórica' },
      },
      'designer',
    );
    workspaceState.preparePreview(
      'prompt',
      'builder',
      payload,
      buildPreviewContract(payload),
    );

    createComponent();
    await fixture.whenStable();

    expect(api.generate).toHaveBeenCalledTimes(1);
    expect(component.parsed?.workItem.title).toBe('Work Item');
    expect(component.historyItems[0].title).toBe('Work Item');
    expect(component.activeHistoryEntryId).toBe(component.historyItems[0].id);
  });

  it('should identify previews generated from the from-text flow', async () => {
    workspaceState.preparePreview(
      'prompt',
      'work-item-json-builder',
      payload,
      buildPreviewContract(payload),
    );
    createComponent();
    await fixture.whenStable();

    expect(component.historyItems[0].source).toBe('fromText');
  });

  it('should show a safe empty state when entering preview directly', () => {
    createComponent();

    const content = fixture.nativeElement.textContent as string;
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')).map(
      (link) => (link as HTMLAnchorElement).getAttribute('href'),
    );

    expect(content).toContain('Aún no hay un Work Item para previsualizar');
    expect(content).toContain('Diseñar Work Item');
    expect(content).toContain('Crear desde texto');
    expect(links).toContain('/disenar-work-item');
    expect(links).toContain('/crear-desde-texto');
    expect(api.generate).not.toHaveBeenCalled();
  });

  it('should ignore stale preview data after a page refresh', () => {
    localStorage.setItem(
      'work-item.preview.state.v1',
      JSON.stringify({
        promptInput: 'stale prompt',
        parsed: payload,
      }),
    );

    createComponent();

    expect(component.hasWorkspaceData).toBeFalse();
    expect(component.promptInput).toBe('');
    expect(component.parsed).toBeNull();
    expect(api.generate).not.toHaveBeenCalled();
  });

  it('should restore and create a preview from session history using the current create flow', async () => {
    const readyPayload: WorkItemPayload = {
      ...payload,
      testSuite: { planId: 10 },
    };
    const [historyItem] = previewHistory.save(readyPayload, 'fromText');
    createComponent();

    await component.restoreHistoryItem(historyItem);
    fixture.detectChanges();
    await nextAnimationFrame();
    await fixture.whenStable();
    expect(component.parsed?.workItem.title).toBe('Work Item');
    expect(component.parsed?.testCases.map((item) => item.title)).toEqual([
      'TC 1 - A',
      'TC 3 - B',
    ]);
    expect(component.parsed?.testSuite.planId).toBe(10);
    expect(toastService.info).toHaveBeenCalledWith(
      'Visualizando la versión: Work Item.',
    );

    const historySave = spyOn(previewHistory, 'save').and.callThrough();
    await createPreparedWorkItem();
    expect(historySave).not.toHaveBeenCalled();
    expect(api.createPrepared).toHaveBeenCalledWith(
      jasmine.objectContaining({
        azdoProject: 'project',
        testSuite: { planId: 10 },
      }),
      { organization: 'org' },
    );
    expect(toastService.success).toHaveBeenCalledWith('Creado', {
      title: 'Creación completada',
    });
  });

  it('should apply the local snapshot immediately while both metadata requests remain pending', async () => {
    const restoredPayload: WorkItemPayload = {
      ...structuredClone(payload),
      workItem: {
        ...structuredClone(payload.workItem),
        title: 'Versión local restaurada',
        description: '<p>Descripción local</p>',
        acceptanceCriteria: '<ul><li>AC local</li></ul>',
      },
      testCases: [
        {
          title: 'Caso personalizado',
          state: 'Ready',
          steps: [{ action: 'Acción local', expected: 'Resultado local' }],
        },
      ],
      testSuite: { planId: 10 },
    };
    previewHistory.save(
      {
        ...restoredPayload,
        workItem: { ...restoredPayload.workItem, title: 'Otra versión' },
      },
      'designer',
    );
    const historyItem = previewHistory.save(restoredPayload, 'fromText')[0];
    const workItemMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    const testCaseMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    api.fetchWorkItemConfig.and.callFake((_project, workItemType) =>
      workItemType === 'Test Case'
        ? testCaseMetadata.promise
        : workItemMetadata.promise,
    );
    createComponent();
    const historySave = spyOn(previewHistory, 'save').and.callThrough();
    const titleChanges = jasmine.createSpy('titleChanges');
    const descriptionChanges = jasmine.createSpy('descriptionChanges');
    component.contentForm.controls.title.valueChanges.subscribe(titleChanges);
    component.contentForm.controls.description.valueChanges.subscribe(
      descriptionChanges,
    );

    const restored = await component.restoreHistoryItem(historyItem);
    fixture.detectChanges();

    expect(restored).toBeTrue();
    expect(api.fetchWorkItemConfig).not.toHaveBeenCalled();
    expect(component.parsed?.workItem).toEqual(
      jasmine.objectContaining({
        title: 'Versión local restaurada',
        description: '<p>Descripción local</p>',
        acceptanceCriteria: '<ul><li>AC local</li></ul>',
      }),
    );
    expect(component.parsed?.testCases).toEqual(restoredPayload.testCases);
    expect(component.rawJson).toContain('Versión local restaurada');
    expect(component.rawJson).toContain('Caso personalizado');
    expect(component.contentForm.getRawValue()).toEqual(
      jasmine.objectContaining({
        title: 'Versión local restaurada',
        description: '<p>Descripción local</p>',
        acceptanceCriteria: '<ul><li>AC local</li></ul>',
      }),
    );
    expect(component.contentForm.pristine).toBeTrue();
    expect(component.contentForm.untouched).toBeTrue();
    expect(titleChanges).not.toHaveBeenCalled();
    expect(descriptionChanges).not.toHaveBeenCalled();
    expect(historySave).not.toHaveBeenCalled();
    expect(component.historyRestoreState.phase).toBe('refreshingMetadata');
    expect(fixture.nativeElement.textContent).toContain('Work Item restaurado');

    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('.preview-history-card'),
    ) as HTMLElement[];
    const activeCard = cards.find((card) =>
      card.textContent?.includes('Versión local restaurada'),
    ) as HTMLElement;
    const otherCard = cards.find((card) =>
      card.textContent?.includes('Otra versión'),
    ) as HTMLElement;
    expect(
      activeCard.querySelector('.preview-restore-button-spinner'),
    ).not.toBeNull();
    expect(activeCard.textContent).toContain('Abriendo versión');
    expect(
      (activeCard.querySelector('.btn-secondary') as HTMLButtonElement)
        .disabled,
    ).toBeTrue();
    expect(
      (otherCard.querySelector('.btn-secondary') as HTMLButtonElement).disabled,
    ).toBeTrue();

    await nextAnimationFrame();
    expect(api.fetchWorkItemConfig.calls.count()).toBe(2);
    expect(
      api.fetchWorkItemConfig.calls.allArgs().map((args) => args[1]),
    ).toEqual(['User Story', 'Test Case']);

    component.contentForm.controls.title.setValue('Editada durante metadata');
    expect(component.parsed?.workItem.title).toBe('Editada durante metadata');

    workItemMetadata.resolve({
      project: 'project',
      workItemType: 'User Story',
      fields: createWorkItemFields('User Story'),
    });
    testCaseMetadata.resolve({
      project: 'project',
      workItemType: 'Test Case',
      fields: createWorkItemFields('Test Case'),
    });
    await Promise.all([workItemMetadata.promise, testCaseMetadata.promise]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.historyRestoreState.phase).toBe('completed');
    expect(component.parsed?.workItem.title).toBe('Editada durante metadata');
    expect(component.parsed?.testCases[0].title).toBe('Caso personalizado');
    expect(fixture.nativeElement.textContent).toContain(
      'Restauración completada',
    );
  });

  it('should keep the restored snapshot on metadata failure and retry through the current cache', async () => {
    const [historyItem] = previewHistory.save(
      {
        ...structuredClone(payload),
        testSuite: { planId: 10 },
      },
      'fromText',
    );
    api.fetchWorkItemConfig.and.rejectWith(new Error('metadata unavailable'));
    createComponent();

    await component.restoreHistoryItem(historyItem);
    fixture.detectChanges();
    await nextAnimationFrame();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.parsed?.workItem.title).toBe('Work Item');
    expect(component.historyRestoreState.phase).toBe('metadataWarning');
    expect(fixture.nativeElement.textContent).toContain(
      'Versión restaurada con configuración pendiente',
    );
    expect(fixture.nativeElement.textContent).toContain('Reintentar metadata');
    const createButton = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find(
      (button) =>
        (button as HTMLButtonElement).textContent?.trim() ===
        'Crear en Azure DevOps',
    ) as HTMLButtonElement;
    expect(createButton.disabled).toBeTrue();

    api.fetchWorkItemConfig.and.callFake((project, workItemType) => {
      const resolvedType = workItemType || 'User Story';
      return Promise.resolve({
        project,
        workItemType: resolvedType,
        fields: createWorkItemFields(resolvedType),
      });
    });
    api.fetchWorkItemConfig.calls.reset();
    await component.retryHistoryRestoreMetadata();
    fixture.detectChanges();

    expect(api.fetchWorkItemConfig.calls.allArgs()).toEqual([
      ['project', 'User Story', undefined, true],
      ['project', 'Test Case', undefined, true],
    ]);
    expect(component.historyRestoreState.phase).toBe('completed');
    expect(component.parsed?.workItem.title).toBe('Work Item');
  });

  it('should preserve an unavailable historical Test Case state and report it explicitly', async () => {
    const restoredPayload = structuredClone(payload);
    restoredPayload.testCases[0].state = 'Historical State';
    restoredPayload.testSuite = { planId: 10 };
    const [historyItem] = previewHistory.save(restoredPayload, 'fromText');
    createComponent();

    await component.restoreHistoryItem(historyItem);
    fixture.detectChanges();
    await nextAnimationFrame();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.parsed?.testCases[0].state).toBe('Historical State');
    expect(component.historyRestoreState.phase).toBe('metadataWarning');
    expect(component.historyRestoreState.detail).toContain(
      'Estados históricos no disponibles actualmente: Historical State.',
    );
    expect(fixture.nativeElement.textContent).toContain('Historical State');
  });

  it('should treat incomplete cached content metadata as pending without hiding restored AC', async () => {
    const [historyItem] = previewHistory.save(
      structuredClone(payload),
      'fromText',
    );
    api.fetchWorkItemConfig.and.callFake((project, workItemType) =>
      Promise.resolve({
        project,
        workItemType: workItemType || 'User Story',
        fields:
          workItemType === 'Test Case'
            ? createWorkItemFields('Test Case')
            : [field('Priority', 'Microsoft.VSTS.Common.Priority')],
      }),
    );
    createComponent();

    await component.restoreHistoryItem(historyItem);
    fixture.detectChanges();
    await nextAnimationFrame();
    await fixture.whenStable();

    expect(component.historyRestoreState.phase).toBe('metadataWarning');
    expect(component.acceptanceCriteriaCapability).toBe('unknown');
    expect(component.parsed?.workItem.acceptanceCriteria).toBe(
      payload.workItem.acceptanceCriteria,
    );
    expect(component.historyRestoreState.canRetryMetadata).toBeTrue();
  });

  it('should ignore stale metadata when a newer history restoration supersedes it', async () => {
    const firstWorkItemMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    const firstTestCaseMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    const secondWorkItemMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    const firstItem = previewHistory.save(
      {
        ...structuredClone(payload),
        azdoProject: 'project-one',
        workItem: {
          ...structuredClone(payload.workItem),
          title: 'Primera versión',
        },
      },
      'designer',
    )[0];
    const secondItem = previewHistory.save(
      {
        ...structuredClone(payload),
        azdoProject: 'project-two',
        workItemType: 'Epic',
        workItem: {
          ...structuredClone(payload.workItem),
          title: 'Segunda versión',
        },
        testCases: [],
        testSuite: { planId: 0 },
      },
      'fromText',
    )[0];
    api.fetchWorkItemConfig.and.callFake((project, workItemType) => {
      if (project === 'project-one' && workItemType === 'Test Case') {
        return firstTestCaseMetadata.promise;
      }
      if (project === 'project-one') {
        return firstWorkItemMetadata.promise;
      }
      return secondWorkItemMetadata.promise;
    });
    confirmDialog.confirm.and.resolveTo(true);
    createComponent();

    await component.restoreHistoryItem(firstItem);
    fixture.detectChanges();
    await nextAnimationFrame();
    await component.restoreHistoryItem(secondItem);
    fixture.detectChanges();
    await nextAnimationFrame();

    firstWorkItemMetadata.resolve({
      project: 'project-one',
      workItemType: 'User Story',
      fields: createWorkItemFields('User Story'),
    });
    firstTestCaseMetadata.resolve({
      project: 'project-one',
      workItemType: 'Test Case',
      fields: createWorkItemFields('Test Case'),
    });
    await Promise.all([
      firstWorkItemMetadata.promise,
      firstTestCaseMetadata.promise,
    ]);
    await Promise.resolve();

    expect(component.parsed?.workItem.title).toBe('Segunda versión');
    expect(component.contentMetadataState).toBe('loading');
    expect(component.acceptanceCriteriaCapability).toBe('unknown');
    expect(component.historyRestoreState.entryId).toBe(secondItem.id);

    secondWorkItemMetadata.resolve({
      project: 'project-two',
      workItemType: 'Epic',
      fields: createWorkItemFields('Epic'),
    });
    await secondWorkItemMetadata.promise;
    await fixture.whenStable();

    expect(component.historyRestoreState.phase).toBe('completed');
    expect(component.acceptanceCriteriaCapability).toBe('unsupported');
    expect(component.parsed?.workItem.title).toBe('Segunda versión');
  });

  it('should keep the current Preview and focus a local error when the snapshot is corrupt', async () => {
    const [historyItem] = previewHistory.save(
      {
        ...structuredClone(payload),
        workItem: {
          ...structuredClone(payload.workItem),
          title: 'Entrada corrupta',
        },
      },
      'fromText',
    );
    const corruptHistoryItem = { ...historyItem, normalizedJson: '{' };
    createComponent();
    await loadPreviewThroughGeneration(payload);
    component.historyItems = component.historyItems.map((item) =>
      item.id === historyItem.id ? corruptHistoryItem : item,
    );
    confirmDialog.confirm.and.resolveTo(true);
    const requestCount = api.fetchWorkItemConfig.calls.count();
    const scrollIntoView = spyOn(HTMLElement.prototype, 'scrollIntoView');

    const restored = await component.restoreHistoryItem(corruptHistoryItem);
    fixture.detectChanges();
    const errorElement = fixture.nativeElement.querySelector(
      `#history-restore-error-${historyItem.id}`,
    ) as HTMLElement;
    const focus = spyOn(errorElement, 'focus');
    await nextAnimationFrame();

    expect(restored).toBeFalse();
    expect(component.parsed?.workItem.title).toBe('Work Item');
    expect(component.historyRestoreState.phase).toBe('failed');
    expect(errorElement.textContent).toContain(
      'No fue posible restaurar esta versión',
    );
    expect(focus).toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(api.fetchWorkItemConfig.calls.count()).toBe(requestCount);
  });

  it('should navigate before metadata completes and respect reduced motion without focusing the title', async () => {
    const [historyItem] = previewHistory.save(
      structuredClone(payload),
      'fromText',
    );
    const workItemMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    const testCaseMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    api.fetchWorkItemConfig.and.callFake((_project, workItemType) =>
      workItemType === 'Test Case'
        ? testCaseMetadata.promise
        : workItemMetadata.promise,
    );
    spyOn(window, 'matchMedia').and.returnValue({
      matches: true,
    } as MediaQueryList);
    const scrollIntoView = spyOn(HTMLElement.prototype, 'scrollIntoView');
    createComponent();

    await component.restoreHistoryItem(historyItem);
    fixture.detectChanges();
    const anchor = fixture.nativeElement.querySelector(
      '#preview-work-item-start',
    ) as HTMLElement;
    const title = fixture.nativeElement.querySelector(
      '#preview-work-item-title',
    ) as HTMLInputElement;
    const anchorFocus = spyOn(anchor, 'focus');
    const titleFocus = spyOn(title, 'focus');
    await nextAnimationFrame();

    expect(component.historyRestoreState.phase).toBe('refreshingMetadata');
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    });
    expect(anchorFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(titleFocus).not.toHaveBeenCalled();

    workItemMetadata.resolve({
      project: 'project',
      workItemType: 'User Story',
      fields: createWorkItemFields('User Story'),
    });
    testCaseMetadata.resolve({
      project: 'project',
      workItemType: 'Test Case',
      fields: createWorkItemFields('Test Case'),
    });
  });

  it('should not start two restorations for the same entry while metadata is pending', async () => {
    const [historyItem] = previewHistory.save(
      structuredClone(payload),
      'fromText',
    );
    const workItemMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    const testCaseMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    api.fetchWorkItemConfig.and.callFake((_project, workItemType) =>
      workItemType === 'Test Case'
        ? testCaseMetadata.promise
        : workItemMetadata.promise,
    );
    createComponent();

    expect(await component.restoreHistoryItem(historyItem)).toBeTrue();
    expect(await component.restoreHistoryItem(historyItem)).toBeFalse();
    fixture.detectChanges();
    await nextAnimationFrame();
    expect(api.fetchWorkItemConfig.calls.count()).toBe(2);

    workItemMetadata.resolve({
      project: 'project',
      workItemType: 'User Story',
      fields: createWorkItemFields('User Story'),
    });
    testCaseMetadata.resolve({
      project: 'project',
      workItemType: 'Test Case',
      fields: createWorkItemFields('Test Case'),
    });
  });

  it('should remove a non-active history item without changing the current view', async () => {
    const first = previewHistory.save(payload, 'designer')[0];
    previewHistory.save(
      {
        ...payload,
        workItem: { ...payload.workItem, title: 'Work Item 2' },
      },
      'fromText',
    );
    createComponent();

    await component.removeHistoryItem(first.id);
    expect(component.historyItems.map((item) => item.title)).toEqual([
      'Work Item 2',
    ]);
    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(toastService.success).toHaveBeenCalledWith(
      'Versión eliminada: Work Item.',
    );
  });

  it('should protect local changes when deleting the active base and select a coherent fallback', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    await loadPreviewThroughGeneration({
      ...payload,
      workItem: { ...payload.workItem, title: 'Versión activa' },
    });
    const activeId = component.activeHistoryEntryId as string;
    component.contentForm.controls.title.setValue('Cambio local');
    confirmDialog.confirm.and.resolveTo(false);

    await component.removeHistoryItem(activeId);

    expect(component.historyItems.length).toBe(2);
    expect(component.parsed?.workItem.title).toBe('Cambio local');
    expect(component.activeHistoryEntryId).toBe(activeId);

    confirmDialog.confirm.and.resolveTo(true);
    await component.removeHistoryItem(activeId);
    await fixture.whenStable();

    expect(component.historyItems.length).toBe(1);
    expect(component.parsed?.workItem.title).toBe('Work Item');
    expect(component.activeHistoryEntryId).toBe(component.historyItems[0].id);
    expect(component.previewHasManualChanges).toBeFalse();

    await component.removeHistoryItem(component.historyItems[0].id);
    expect(component.historyItems).toEqual([]);
    expect(component.parsed).toBeNull();
    expect(component.activeHistoryEntryId).toBeNull();
  });

  it('should keep the confirmation modal when clearing the complete history', async () => {
    previewHistory.save(payload, 'designer');
    createComponent();

    confirmDialog.confirm.and.resolveTo(false);
    await component.clearHistory();
    expect(component.historyItems.length).toBe(1);
    expect(confirmDialog.confirm).toHaveBeenCalledWith(
      jasmine.objectContaining({
        title: 'Limpiar historial de previsualizaciones',
        confirmLabel: 'Limpiar historial',
        type: 'danger',
      }),
    );

    confirmDialog.confirm.and.resolveTo(true);
    await component.clearHistory();
    expect(component.historyItems).toEqual([]);
    expect(sessionStorage.getItem('work-item.preview.history.v2')).toBeNull();
    expect(toastService.success).toHaveBeenCalledWith(
      'Historial de esta sesión limpiado.',
    );
  });

  it('should automatically load the latest valid history entry', async () => {
    previewHistory.save(payload, 'designer');
    createComponent();
    await nextAnimationFrame();
    await fixture.whenStable();

    expect(component.historyItems.length).toBe(1);
    expect(component.parsed?.workItem.title).toBe('Work Item');
    expect(component.activeHistoryEntryId).toBe(component.historyItems[0].id);
    expect(component.status).not.toContain('Última versión disponible');
  });

  it('should hide visual required markers throughout Preview while retaining constraints', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css('app-required-field-marker')),
    ).toBeNull();
    expect(
      fixture.nativeElement
        .querySelector('#preview-work-item-title')
        .hasAttribute('required'),
    ).toBeTrue();
    expect(
      fixture.nativeElement
        .querySelector('#preview-work-item-title')
        .getAttribute('aria-required'),
    ).toBe('true');
  });

  it('should use auto-grow rich text editors only in Preview', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    fixture.detectChanges();

    const editors = fixture.debugElement.queryAll(
      By.directive(RichTextEditorComponent),
    );
    expect(editors.length).toBeGreaterThanOrEqual(1);
    expect(
      editors.every(
        (editor) => editor.componentInstance.layoutMode === 'auto-grow',
      ),
    ).toBeTrue();
    expect(
      editors.every(
        (editor) => editor.componentInstance.showRequiredIndicator === false,
      ),
    ).toBeTrue();
  });

  it('should render Description and Acceptance Criteria in one ordered content card', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    fixture.detectChanges();

    const contentCards = fixture.debugElement.queryAll(
      By.css('.preview-content-card'),
    );
    const columns = contentCards[0].queryAll(By.css('.preview-html-card'));
    const ids = columns.map(
      (column) =>
        column.query(By.directive(RichTextEditorComponent)).componentInstance
          .inputId,
    );

    expect(contentCards.length).toBe(1);
    expect(columns.length).toBe(2);
    expect(ids).toEqual([
      'preview-work-item-description',
      'preview-work-item-acceptance-criteria',
    ]);
    expect(fixture.nativeElement.textContent).toContain(
      'Contenido del Work Item',
    );
  });

  it('should hide only Test Case required indicators in Preview', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);
    fixture.detectChanges();

    const editors = fixture.debugElement.queryAll(
      By.directive(TestCaseEditorComponent),
    );
    expect(editors.length).toBeGreaterThan(0);
    expect(
      editors.every(
        (editor) => editor.componentInstance.showRequiredIndicators === false,
      ),
    ).toBeTrue();
    expect(
      fixture.nativeElement.querySelectorAll('[aria-required="true"]').length,
    ).toBeGreaterThan(0);
  });

  it('should not expose prompt or JSON controls in Preview', () => {
    createComponent();
    component.parsed = payload;
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent as string;

    expect(content).not.toContain('Copiar JSON');
    expect(content).not.toContain('Descargar JSON');
    expect(content).not.toContain('Modificar prompt');
    expect(fixture.nativeElement.querySelector('#preview-prompt')).toBeNull();
  });

  it('should delete and undo a test case without rewriting user-controlled titles', () => {
    createComponent();
    component.parsed = {
      ...payload,
      testCases: [
        {
          title: 'TC 1 - A',
          state: 'Ready',
          steps: [{ action: 'a', expected: 'e' }],
        },
        {
          title: 'TC 2 - B',
          state: 'Ready',
          steps: [{ action: 'b', expected: 'e' }],
        },
        {
          title: 'TC 3 - C',
          state: 'Ready',
          steps: [{ action: 'c', expected: 'e' }],
        },
      ],
    };

    component.requestDeleteTestCase(1);
    expect(component.parsed?.testCases.map((item) => item.title)).toEqual([
      'TC 1 - A',
      'TC 3 - C',
    ]);
    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain(
      'Eliminar Test Case',
    );
    const options = toastService.success.calls.mostRecent().args[1];
    expect(options).toEqual(
      jasmine.objectContaining({
        duration: 8000,
        action: jasmine.objectContaining({ label: 'Deshacer' }),
      }),
    );

    component.parsed.workItem = {
      ...component.parsed.workItem,
      description: '<p>Descripción editada después de eliminar</p>',
    };
    component.parsed.testCases[0] = {
      ...component.parsed.testCases[0],
      steps: [{ action: 'a', expected: 'Resultado editado' }],
    };
    options?.action?.callback();
    expect(component.parsed?.testCases.map((item) => item.title)).toEqual([
      'TC 1 - A',
      'TC 2 - B',
      'TC 3 - C',
    ]);
    expect(component.parsed?.workItem.description).toContain(
      'Descripción editada',
    );
    expect(component.parsed?.testCases[0].steps[0].expected).toBe(
      'Resultado editado',
    );
    expect(toastService.info).toHaveBeenCalledWith('Test Case restaurado.');
  });

  it('should block creating test cases without Test Plan', async () => {
    createComponent();
    await loadPreviewThroughGeneration(payload);

    await prepareCreation();
    expect(component.creationDialogState?.phase).toBe('invalid');
    expect(component.creationDialogState?.error).toContain('Test Plan');
    expect(api.createPrepared).not.toHaveBeenCalled();

    expect(confirmDialog.confirm).not.toHaveBeenCalled();
  });

  it('should create Epic without sending test cases', async () => {
    createComponent();
    await loadPreviewThroughGeneration({
      ...payload,
      workItemType: 'Epic',
      testCases: [],
      testSuite: { planId: 0 },
    });

    await createPreparedWorkItem();

    expect(component.creationDialogState?.phase).toBe('result');
    expect(api.createPrepared).toHaveBeenCalledWith(
      jasmine.objectContaining({
        workItemType: 'Epic',
        testCases: [],
        testSuite: { planId: 0 },
      }),
      { organization: 'org' },
    );
  });

  it('should reject an Epic response with forbidden fields and Test Cases before Preview', async () => {
    createComponent();
    const epicBase: WorkItemPayload = {
      ...payload,
      workItemType: 'Epic',
      workItem: {
        title: payload.workItem.title,
        description: payload.workItem.description,
        priority: payload.workItem.priority,
        risk: payload.workItem.risk,
        assignedTo: payload.workItem.assignedTo,
      } as WorkItemPayload['workItem'],
      testCases: [],
      testSuite: { planId: 0 },
    };
    await loadPreviewThroughGeneration(epicBase, {
      ...epicBase,
      workItem: {
        ...epicBase.workItem,
        acceptanceCriteria: '<ul><li>No permitido</li></ul>',
        valueArea2: 'Architectural',
      },
      testCases: [
        {
          title: 'TC 1 - A',
          state: 'Ready',
          steps: [{ action: 'a', expected: 'e' }],
        },
      ],
      testSuite: { planId: 999 },
    });

    expect(component.parsed).toBeNull();
    expect(component.error).toContain('incumple el contrato');
    expect(api.createPrepared).not.toHaveBeenCalled();
  });

  it('should open immediately and not create when the modal is closed', async () => {
    createComponent();
    await loadPreviewThroughGeneration({
      ...payload,
      workItemType: 'Epic',
      testCases: [],
      testSuite: { planId: 0 },
    });
    api.fetchWorkItemConfig.calls.reset();
    component.createInAzureDevOps();
    expect(component.creationDialogState?.phase).toBe('preparing');
    expect(api.fetchWorkItemConfig).not.toHaveBeenCalled();
    component.closeCreationDialog();

    expect(component.creationDialogState).toBeNull();
    expect(api.createPrepared).not.toHaveBeenCalled();
  });

  it('should start both metadata requests after the modal render and prevent duplicate clicks', async () => {
    createComponent();
    await loadPreviewThroughGeneration({
      ...payload,
      testSuite: { planId: 10 },
    });
    const workItemMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    const testCaseMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    api.fetchWorkItemConfig.and.callFake((_project, workItemType) =>
      workItemType === 'Test Case'
        ? testCaseMetadata.promise
        : workItemMetadata.promise,
    );
    api.fetchWorkItemConfig.calls.reset();

    component.createInAzureDevOps();
    component.createInAzureDevOps();
    expect(component.creationDialogState?.phase).toBe('preparing');
    expect(api.fetchWorkItemConfig).not.toHaveBeenCalled();

    await nextAnimationFrame();
    expect(api.fetchWorkItemConfig.calls.allArgs()).toEqual([
      ['project', 'User Story', undefined, false],
      ['project', 'Test Case', undefined, false],
    ]);

    workItemMetadata.resolve({
      project: 'project',
      workItemType: 'User Story',
      fields: createWorkItemFields('User Story'),
    });
    testCaseMetadata.resolve({
      project: 'project',
      workItemType: 'Test Case',
      fields: createWorkItemFields('Test Case'),
    });
    await fixture.whenStable();
    expect(component.creationDialogState?.phase).toBe('ready');
  });

  it('should ignore a late preflight after the modal is closed and the payload changes', async () => {
    createComponent();
    await loadPreviewThroughGeneration({
      ...payload,
      testSuite: { planId: 10 },
    });
    const oldMetadata =
      deferred<Awaited<ReturnType<ApiService['fetchWorkItemConfig']>>>();
    api.fetchWorkItemConfig.and.returnValue(oldMetadata.promise);

    component.createInAzureDevOps();
    await nextAnimationFrame();
    component.closeCreationDialog(false);
    component['generationBasePayload'] = null;
    component.parsed = {
      ...structuredClone(component.parsed!),
      azdoProject: 'new-project',
    };
    api.fetchWorkItemConfig.and.callFake((project, workItemType) => {
      const resolvedType = workItemType || 'User Story';
      return Promise.resolve({
        project,
        workItemType: resolvedType,
        fields: createWorkItemFields(resolvedType),
      });
    });
    component.createInAzureDevOps();
    await nextAnimationFrame();
    await fixture.whenStable();
    expect(component.creationDialogState?.summary.project).toBe('new-project');

    oldMetadata.resolve({
      project: 'project',
      workItemType: 'User Story',
      fields: createWorkItemFields('User Story'),
    });
    await oldMetadata.promise;
    expect(component.creationDialogState?.summary.project).toBe('new-project');
  });

  it('should confirm the prepared request once without repeating preflight', async () => {
    createComponent();
    await loadPreviewThroughGeneration({
      ...payload,
      testSuite: { planId: 10 },
    });
    await prepareCreation();
    const metadataCalls = api.fetchWorkItemConfig.calls.count();

    const firstConfirmation = component.confirmPreparedCreation();
    const secondConfirmation = component.confirmPreparedCreation();
    await Promise.all([firstConfirmation, secondConfirmation]);

    expect(api.fetchWorkItemConfig.calls.count()).toBe(metadataCalls);
    expect(api.createPrepared).toHaveBeenCalledTimes(1);
  });

  it('should warn about possible duplicates before retrying an ambiguous create error', async () => {
    createComponent();
    await loadPreviewThroughGeneration({
      ...payload,
      workItemType: 'Epic',
      testCases: [],
      testSuite: { planId: 0 },
    });
    confirmDialog.confirm.calls.reset();
    const networkError = Object.assign(
      new Error('No fue posible conectar con el servicio.'),
      {
        status: 0,
      },
    );
    api.createPrepared.and.rejectWith(networkError);

    await createPreparedWorkItem();
    component.closeCreationDialog(false);
    api.createPrepared.and.resolveTo({
      huId: 2,
      huUrl: 'https://example/2',
      message: 'Creado después del reintento',
    });
    await prepareCreation();

    expect(component.creationDialogState?.ambiguousRetry).toBeTrue();
    expect(component.creationDialogState?.warnings.join(' ')).toContain(
      'evitar duplicados',
    );
    await component.confirmPreparedCreation();
    expect(api.createPrepared).toHaveBeenCalledTimes(2);
  });

  it('should preserve a modified preview when replacement is cancelled', async () => {
    const [historyItem] = previewHistory.save(
      {
        ...payload,
        workItem: { ...payload.workItem, title: 'Otro Work Item' },
      },
      'fromText',
    );
    createComponent();
    await loadPreviewThroughGeneration(payload);
    component.requestDeleteTestCase(0);
    confirmDialog.confirm.and.resolveTo(false);

    const restored = await component.restoreHistoryItem(historyItem);

    expect(restored).toBeFalse();
    expect(component.parsed?.workItem.title).toBe('Work Item');
    expect(confirmDialog.confirm).toHaveBeenCalledWith(
      jasmine.objectContaining({
        title: 'Restaurar esta versión',
        confirmLabel: 'Restaurar versión',
      }),
    );
    expect(component.historyRestoreState.phase).toBe('idle');
  });

  it('should wait for confirmation before showing restore loading and clean state on cancel', async () => {
    const [historyItem] = previewHistory.save(
      {
        ...structuredClone(payload),
        workItem: {
          ...structuredClone(payload.workItem),
          title: 'Versión por restaurar',
        },
      },
      'fromText',
    );
    const confirmation = deferred<boolean>();
    createComponent();
    await loadPreviewThroughGeneration(payload);
    component.contentForm.controls.title.setValue('Cambio manual');
    confirmDialog.confirm.and.returnValue(confirmation.promise);
    fixture.detectChanges();
    const restoreButton = Array.from(
      fixture.nativeElement.querySelectorAll('.preview-history-card button'),
    ).find((button) =>
      (button as HTMLButtonElement).textContent?.includes('Ver versión'),
    ) as HTMLButtonElement;
    restoreButton.focus();
    const focus = spyOn(restoreButton, 'focus');

    const restoration = component.restoreHistoryItem(historyItem);
    fixture.detectChanges();

    expect(component.historyRestoreState.phase).toBe('confirming');
    expect(restoreButton.textContent).not.toContain('Abriendo versión');
    expect(
      fixture.nativeElement.querySelector('.preview-restore-button-spinner'),
    ).toBeNull();

    confirmation.resolve(false);
    expect(await restoration).toBeFalse();
    fixture.detectChanges();
    await nextAnimationFrame();

    expect(component.historyRestoreState.phase).toBe('idle');
    expect(component.parsed?.workItem.title).toBe('Cambio manual');
    expect(focus).toHaveBeenCalled();
  });

  it('should navigate to the restored Work Item after replacing the current preview', async () => {
    const [historyItem] = previewHistory.save(
      {
        ...payload,
        workItem: { ...payload.workItem, title: 'Otro Work Item' },
      },
      'fromText',
    );
    createComponent();
    await loadPreviewThroughGeneration(payload);
    component.contentForm.controls.title.setValue(
      'Cambio local antes de abrir otra versión',
    );
    confirmDialog.confirm.and.resolveTo(true);
    const scrollIntoView = spyOn(HTMLElement.prototype, 'scrollIntoView');
    const focus = spyOn(HTMLElement.prototype, 'focus');

    const restored = await component.restoreHistoryItem(historyItem);
    fixture.detectChanges();
    await nextAnimationFrame();

    expect(restored).toBeTrue();
    expect(component.parsed?.workItem.title).toBe('Otro Work Item');
    expect(confirmDialog.confirm).toHaveBeenCalledWith(
      jasmine.objectContaining({
        confirmLabel: 'Restaurar versión',
      }),
    );
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('should ignore an invalid deletion and navigate back to assign a Test Plan', async () => {
    workspaceState.setPrompt('prompt', 'work-item-json-builder');
    const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);
    createComponent();

    component.parsed = payload;
    component.requestDeleteTestCase(99);

    expect(component.parsed.testCases.length).toBe(2);
    expect(toastService.success).not.toHaveBeenCalled();

    await prepareCreation();
    component.closeCreationDialog();

    expect(component.creationDialogState).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/crear-desde-texto']);
  });
});
