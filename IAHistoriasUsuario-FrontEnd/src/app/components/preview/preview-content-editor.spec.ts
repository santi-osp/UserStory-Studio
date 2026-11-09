import { ViewportScroller } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PreviewComponent } from './preview.component';
import { WorkItemFieldConfig, WorkItemPayload } from '../../models/types';
import { ApiService } from '../../services/api.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { ToastService } from '../../services/toast.service';
import { WorkItemWorkspaceStateService } from '../../services/work-item-workspace-state.service';
import { AzdoConfigService } from '../../services/azdo-config.service';
import { WorkItemPromptContract } from '../../prompts/work-items';

describe('PreviewComponent content editor integration', () => {
  let fixture: ComponentFixture<PreviewComponent>;
  let component: PreviewComponent;
  let api: jasmine.SpyObj<ApiService>;
  let confirmDialog: jasmine.SpyObj<ConfirmDialogService>;

  const payload: WorkItemPayload = {
    azdoOrg: 'org',
    azdoProject: 'project',
    iterationPath: 'project\\sprint',
    areaPath: 'project\\area',
    workItemType: 'User Story',
    workItem: {
      title: 'Work Item',
      description: '<p>Descripción base</p>',
      acceptanceCriteria:
        '<p><strong>AC1 - Escenario: criterio base</strong></p><p>Dado un contexto válido, Cuando ocurre la acción, Entonces se obtiene el resultado esperado.</p>',
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
        title: 'TC 1 - Caso',
        state: 'Ready',
        steps: [{ action: 'Acción', expected: 'Resultado' }],
      },
    ],
    testSuite: { planId: 10 },
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'generate',
      'create',
      'createPrepared',
      'fetchWorkItemConfig',
      'getFreshWorkItemConfig',
    ]);
    api.create.and.resolveTo({
      huId: 1,
      huUrl: 'https://example.com/1',
      message: 'Creado',
    });
    api.createPrepared.and.resolveTo({
      huId: 1,
      huUrl: 'https://example.com/1',
      message: 'Creado',
    });
    api.fetchWorkItemConfig.and.callFake(
      (project: string, workItemType: string) =>
        Promise.resolve({
          project,
          workItemType,
          fields:
            workItemType === 'Test Case'
              ? [
                  {
                    ...field('Estado', 'System.State', true),
                    control: 'select',
                    options: ['Ready'],
                  },
                ]
              : [
                  field('Título', 'System.Title', true),
                  field('Descripción', 'System.Description', true),
                  ...(workItemType === 'User Story'
                    ? [
                        field(
                          'Criterios de aceptación',
                          'Microsoft.VSTS.Common.AcceptanceCriteria',
                        ),
                      ]
                    : []),
                  field('Prioridad', 'Microsoft.VSTS.Common.Priority'),
                  field('Riesgo', 'Microsoft.VSTS.Common.Risk'),
                  field('Asignado a', 'System.AssignedTo'),
                ],
        }),
    );
    api.getFreshWorkItemConfig.and.callFake(
      (project: string, workItemType: string) => ({
        project,
        workItemType,
        fields:
          workItemType === 'Test Case'
            ? [
                {
                  ...field('Estado', 'System.State', true),
                  control: 'select',
                  options: ['Ready'],
                },
              ]
            : [
                field('Título', 'System.Title', true),
                field('Descripción', 'System.Description', true),
                ...(workItemType === 'User Story'
                  ? [
                      field(
                        'Criterios de aceptación',
                        'Microsoft.VSTS.Common.AcceptanceCriteria',
                      ),
                    ]
                  : []),
                field('Prioridad', 'Microsoft.VSTS.Common.Priority'),
                field('Riesgo', 'Microsoft.VSTS.Common.Risk'),
                field('Asignado a', 'System.AssignedTo'),
              ],
      }),
    );

    confirmDialog = jasmine.createSpyObj<ConfirmDialogService>(
      'ConfirmDialogService',
      ['confirm'],
    );
    confirmDialog.confirm.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [PreviewComponent],
      providers: [
        { provide: ApiService, useValue: api },
        {
          provide: AzdoConfigService,
          useValue: {
            hasRuntimeCredential: () => true,
            getOrganization: () => 'org',
            getContextSnapshot: () => ({
              organization: 'org',
              correlationId: 'context-1',
            }),
          },
        },
        {
          provide: ToastService,
          useValue: jasmine.createSpyObj<ToastService>('ToastService', [
            'success',
            'info',
            'error',
            'warning',
          ]),
        },
        {
          provide: ConfirmDialogService,
          useValue: confirmDialog,
        },
        {
          provide: ViewportScroller,
          useValue: jasmine.createSpyObj<ViewportScroller>('ViewportScroller', [
            'scrollToPosition',
          ]),
        },
        WorkItemWorkspaceStateService,
        provideRouter([]),
      ],
    }).compileComponents();

    TestBed.inject(WorkItemWorkspaceStateService).setPrompt(
      '',
      'builder',
      'system prompt',
    );
    fixture = TestBed.createComponent(PreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

  function attachGenerationContext(value: WorkItemPayload): void {
    const allowed = Object.keys(value.workItem);
    const editable = ['title', 'description', 'acceptanceCriteria'];
    const generationState = component as unknown as {
      generationBasePayload: WorkItemPayload;
      generationContract: WorkItemPromptContract;
    };
    generationState.generationBasePayload = structuredClone(value);
    generationState.generationContract = {
      workItemType: 'User Story',
      metadataState: 'confirmed',
      metadata: [],
      allowedWorkItemFields: allowed,
      aiEditableWorkItemFields: editable,
      preservedWorkItemFields: allowed.filter((key) => !editable.includes(key)),
      prohibitedWorkItemFields: [],
      azureRequiredWorkItemFields: ['title', 'description'],
      generationRequiredWorkItemFields: editable,
      acceptanceCriteria: {
        supported: true,
        requiredByAzure: false,
        requiredForGeneration: true,
      },
      testCases: {
        supported: true,
        enabled: true,
        countMode: 'fixed',
        fixedCount: value.testCases.length,
        state: value.testCases[0].state,
        planId: value.testSuite.planId,
      },
      semanticProfile: {
        descriptionRules: [],
        acceptanceCriteriaRules: [],
        descriptionTemplate: '',
      },
      aiTemplate: {
        azdoOrg: value.azdoOrg,
        azdoProject: value.azdoProject,
        workItemType: 'User Story',
        iterationPath: value.iterationPath,
        areaPath: value.areaPath,
        workItem: structuredClone(value.workItem),
        testCases: structuredClone(value.testCases),
        testSuite: structuredClone(value.testSuite),
      },
    };
  }

  it('updates parsed and rawJson without changing test cases or controlled fields', () => {
    component.parsed = structuredClone(payload);
    const originalTestCases = structuredClone(component.parsed.testCases);
    const originalControlledFields = {
      priority: component.parsed.workItem.priority,
      risk: component.parsed.workItem.risk,
      assignedTo: component.parsed.workItem.assignedTo,
    };

    component.contentForm.controls.description.setValue(
      '<p style="color:red">Descripción <b>editada</b></p>',
    );
    component.contentForm.controls.acceptanceCriteria.setValue(
      '<ol><li>Criterio editable</li></ol>',
    );

    expect(component.parsed.workItem.description).toBe(
      '<p>Descripción <strong>editada</strong></p>',
    );
    expect(component.parsed.workItem.acceptanceCriteria).toBe(
      '<ol><li>Criterio editable</li></ol>',
    );
    expect(JSON.parse(component.rawJson).workItem).toEqual(
      jasmine.objectContaining({
        description: '<p>Descripción <strong>editada</strong></p>',
        acceptanceCriteria: '<ol><li>Criterio editable</li></ol>',
      }),
    );
    expect(component.parsed.testCases).toEqual(originalTestCases);
    expect(component.parsed.workItem).toEqual(
      jasmine.objectContaining(originalControlledFields),
    );
  });

  it('keeps acceptance criteria visible from the payload while metadata loads', () => {
    component.parsed = {
      ...structuredClone(payload),
      workItem: {
        ...structuredClone(payload.workItem),
        acceptanceCriteria: '',
      },
    };
    component.contentMetadataState = 'loading';

    expect(component.shouldDisplayAcceptanceCriteria).toBeTrue();
    expect(component.isAcceptanceCriteriaSupportedByMetadata).toBeFalse();
    expect(component.isAcceptanceCriteriaRequired).toBeFalse();
  });

  it('shows acceptance criteria when metadata confirms support', async () => {
    component.parsed = structuredClone(payload);

    await component.openRefinementDialog();

    expect(component.isAcceptanceCriteriaSupportedByMetadata).toBeTrue();
    expect(component.shouldDisplayAcceptanceCriteria).toBeTrue();
    expect(component.contentMetadataState).toBe('loaded');
  });

  it('shows the acceptance-criteria warning only for confirmed unsupported content', async () => {
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'project',
      workItemType: 'User Story',
      fields: [
        field('Titulo', 'System.Title'),
        field('Descripcion', 'System.Description'),
      ],
    });
    component.parsed = structuredClone(payload);
    await component.openRefinementDialog();
    component.contentForm.controls.acceptanceCriteria.setValue(
      '<p>Criterio verificable</p>',
    );

    expect(component.acceptanceCriteriaCapability).toBe('unsupported');
    expect(component.hasUnsupportedAcceptanceCriteriaContent).toBeTrue();

    component.contentMetadataState = 'error';
    expect(component.acceptanceCriteriaCapability).toBe('unknown');
    expect(component.hasUnsupportedAcceptanceCriteriaContent).toBeFalse();

    component.contentMetadataState = 'loaded';
    component.contentForm.controls.acceptanceCriteria.setValue('');
    expect(component.hasUnsupportedAcceptanceCriteriaContent).toBeFalse();
  });

  it('opens the refinement modal immediately and shows preparation inside it', async () => {
    let resolveConfig!: (value: {
      project: string;
      workItemType: string;
      fields: WorkItemFieldConfig[];
    }) => void;
    api.fetchWorkItemConfig.and.returnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );
    component.parsed = structuredClone(payload);

    const opening = component.openRefinementDialog();
    fixture.detectChanges();

    expect(component.showRefinementModal).toBeTrue();
    expect(component.isPreparingRefinement).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain(
      'Preparando el refinamiento',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Estamos comprobando los campos disponibles.',
    );

    resolveConfig({
      project: 'project',
      workItemType: 'User Story',
      fields: [
        field('Título', 'System.Title', true),
        field('Descripción', 'System.Description', true),
        field('Criterios', 'Microsoft.VSTS.Common.AcceptanceCriteria'),
      ],
    });
    await opening;

    expect(component.isPreparingRefinement).toBeFalse();
    expect(component.refinementFields).toEqual([
      'title',
      'description',
      'acceptanceCriteria',
    ]);
  });

  it('ignores a second open request while metadata is already loading', async () => {
    let resolveConfig!: (value: {
      project: string;
      workItemType: string;
      fields: WorkItemFieldConfig[];
    }) => void;
    api.fetchWorkItemConfig.and.returnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );
    component.parsed = structuredClone(payload);

    const firstOpening = component.openRefinementDialog();
    await component.openRefinementDialog();

    expect(api.fetchWorkItemConfig).toHaveBeenCalledTimes(1);
    resolveConfig({
      project: 'project',
      workItemType: 'User Story',
      fields: [],
    });
    await firstOpening;
  });

  it('treats legacy dynamic-only metadata as unknown and keeps a safe refinement fallback', async () => {
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'project',
      workItemType: 'User Story',
      fields: [field('Prioridad', 'Microsoft.VSTS.Common.Priority')],
    });
    component.parsed = structuredClone(payload);

    await component.openRefinementDialog();

    expect(component.acceptanceCriteriaCapability).toBe('unknown');
    expect(component.hasUnsupportedAcceptanceCriteriaContent).toBeFalse();
    expect(component.refinementFields).toEqual([
      'title',
      'description',
      'acceptanceCriteria',
    ]);
    expect(component.refinementUsingFallback).toBeTrue();
  });

  it('keeps the modal open on metadata error and permits retry or safe fallback', async () => {
    api.fetchWorkItemConfig.and.rejectWith(new Error('metadata unavailable'));
    component.parsed = structuredClone(payload);

    await component.openRefinementDialog();
    fixture.detectChanges();

    expect(component.showRefinementModal).toBeTrue();
    expect(component.acceptanceCriteriaCapability).toBe('unknown');
    expect(component.refinementPreparationError).toBe(
      'Puedes reintentar la consulta o continuar con los campos de contenido disponibles en esta versión.',
    );
    expect(component.refinementFields).toEqual([
      'title',
      'description',
      'acceptanceCriteria',
    ]);
    expect(fixture.nativeElement.textContent).toContain(
      'No fue posible comprobar todos los campos',
    );
    expect(fixture.nativeElement.textContent).toContain('Reintentar');
    expect(fixture.nativeElement.textContent).toContain('Continuar');

    component.continueRefinementWithFallback();

    expect(component.refinementPreparationError).toBe('');
    expect(component.refinementUsingFallback).toBeTrue();
  });

  it('explains why the refinement button is disabled', () => {
    component.parsed = structuredClone(payload);
    component.isCreating = true;
    fixture.detectChanges();

    expect(component.canOpenRefinement).toBeFalse();
    expect(component.refinementDisabledReason).toBe(
      'Espera a que termine la creación actual.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Espera a que termine la creación actual.',
    );
  });

  it('retries metadata in the same modal with a forced refresh', async () => {
    api.fetchWorkItemConfig.and.rejectWith(new Error('metadata unavailable'));
    component.parsed = structuredClone(payload);
    await component.openRefinementDialog();
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'project',
      workItemType: 'User Story',
      fields: [
        field('Título', 'System.Title', true),
        field('Descripción', 'System.Description', true),
        field('Criterios', 'Microsoft.VSTS.Common.AcceptanceCriteria'),
      ],
    });

    await component.retryRefinementMetadata();

    expect(component.showRefinementModal).toBeTrue();
    expect(component.refinementPreparationError).toBe('');
    expect(api.fetchWorkItemConfig.calls.mostRecent().args).toEqual([
      'project',
      'User Story',
      undefined,
      true,
    ]);
  });

  it('ignores a late metadata response after the modal closes', async () => {
    let resolveConfig!: (value: {
      project: string;
      workItemType: string;
      fields: WorkItemFieldConfig[];
    }) => void;
    api.fetchWorkItemConfig.and.returnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );
    component.parsed = structuredClone(payload);
    const opening = component.openRefinementDialog();

    component.closeRefinementModal();
    resolveConfig({
      project: 'project',
      workItemType: 'User Story',
      fields: [
        field('Título', 'System.Title'),
        field('Descripción', 'System.Description'),
      ],
    });
    await opening;

    expect(component.showRefinementModal).toBeFalse();
    expect(component.refinementFields).toEqual([]);
    expect(component.contentMetadataState).toBe('idle');
  });

  it('normalizes escaped generated HTML before displaying and serializing it', async () => {
    api.generate.and.resolveTo({
      json: JSON.stringify({
        ...payload,
        workItem: {
          ...payload.workItem,
          description: '&lt;p&gt;Descripción escapada&lt;/p&gt;',
        },
      }),
    });
    component.promptInput = 'prompt';
    attachGenerationContext(payload);

    await component.callBackendGenerate();

    expect(component.error).toBe('');
    expect(component.parsed?.workItem.description).toBe(
      '<p>Descripción escapada</p>',
    );
    expect(JSON.parse(component.rawJson).workItem.description).toBe(
      '<p>Descripción escapada</p>',
    );
  });

  it('builds refinement from the latest editable content', async () => {
    component.parsed = structuredClone(payload);
    component.contentForm.controls.description.setValue(
      '<p>Versión editable más reciente</p>',
    );
    await component.openRefinementDialog();
    api.generate.and.resolveTo({
      error: 'Detener después de inspeccionar el prompt.',
    });

    await component.generateRefinement({
      scope: 'content',
      selectedFields: ['description'],
      instructions: 'Hazla más concreta.',
    });

    const request = api.generate.calls.mostRecent().args[0];
    expect(request.prompt).toContain('Versión editable más reciente');
    expect(component.parsed.workItem.description).toBe(
      '<p>Versión editable más reciente</p>',
    );
  });

  it('preserves unsupported acceptance criteria in Preview but omits them from creation', async () => {
    component.parsed = {
      ...structuredClone(payload),
      workItemType: 'Epic',
      testCases: [],
      testSuite: { planId: 0 },
    };
    component.contentForm.setValue({
      title: component.parsed.workItem.title,
      description: component.parsed.workItem.description,
      acceptanceCriteria: component.parsed.workItem.acceptanceCriteria,
    });

    component.createInAzureDevOps();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await fixture.whenStable();
    await component.confirmPreparedCreation();

    const creationRequest = api.createPrepared.calls.mostRecent().args[0];
    expect(creationRequest.hu['acceptanceCriteria']).toBeUndefined();
    expect(component.parsed.workItem.acceptanceCriteria).toBe(
      payload.workItem.acceptanceCriteria,
    );
    expect(component.shouldDisplayAcceptanceCriteria).toBeFalse();
    expect(component.hasUnsupportedAcceptanceCriteriaContent).toBeTrue();
  });
});
