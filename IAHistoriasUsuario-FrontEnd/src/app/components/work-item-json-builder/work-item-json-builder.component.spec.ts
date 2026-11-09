import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { WorkItemJsonBuilderComponent } from './work-item-json-builder.component';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { WorkItemWorkspaceStateService } from '../../services/work-item-workspace-state.service';
import { ToastService } from '../../services/toast.service';
import { AiRequestValidationService } from '../../services/ai-request-validation.service';
import { AzdoConfigService } from '../../services/azdo-config.service';
import { ApiService } from '../../services/api.service';
import { WorkItemPromptBuilderService } from '../../services/work-item-prompt-builder.service';
import { FormValidationOrchestratorService } from '../../services/form-validation-orchestrator.service';
import {
  AzdoFlowContext,
  AzdoMetadataResult,
  WorkItemFieldConfig,
} from '../../models/types';
import { ApplicationConfigurationService } from '../../services/application-configuration.service';

describe('WorkItemJsonBuilderComponent', () => {
  let component: WorkItemJsonBuilderComponent;
  let contextSubject: BehaviorSubject<AzdoFlowContext>;
  let metadataSubject: BehaviorSubject<AzdoMetadataResult>;
  let api: jasmine.SpyObj<ApiService>;
  let azdo: jasmine.SpyObj<AzdoConfigService>;
  let workspace: jasmine.SpyObj<WorkItemWorkspaceStateService>;
  let toast: jasmine.SpyObj<ToastService>;
  let aiValidation: AiRequestValidationService;
  let confirmDialog: jasmine.SpyObj<ConfirmDialogService>;
  let workItemPromptBuilder: WorkItemPromptBuilderService;
  let router: jasmine.SpyObj<Router>;
  let hasPat: boolean;

  const metadata: AzdoMetadataResult = {
    projects: ['Proyecto A'],
    areaPaths: ['Proyecto A/Area/Global'],
    iterationPaths: ['Proyecto A/Iteration/Global'],
    projectMetadata: [
      {
        project: 'Proyecto A',
        areaPaths: ['Proyecto A/Area/Equipo 2', 'Proyecto A/Area/Equipo 1'],
        iterationPaths: [
          'Proyecto A/Iteration/Sprint 2',
          'Proyecto A/Iteration/Sprint 1',
        ],
      },
    ],
  };

  const fields: WorkItemFieldConfig[] = [
    {
      name: 'Custom Required',
      referenceName: 'Custom.Required',
      label: 'Requerido',
      type: 'string',
      required: true,
      control: 'select',
      options: ['Uno', 'Dos'],
    },
    {
      name: 'Custom Notes',
      referenceName: 'Custom.Notes',
      label: 'Notas',
      type: 'plaintext',
      required: false,
      control: 'textarea',
      options: [],
    },
    {
      name: 'Custom Flag',
      referenceName: 'Custom.Flag',
      label: 'Activo',
      type: 'boolean',
      required: false,
      control: 'checkbox',
      options: [],
    },
    {
      name: 'Custom Date',
      referenceName: 'Custom.StartDate',
      label: 'Fecha',
      type: 'datetime',
      required: false,
      control: 'datetime',
      options: [],
    },
    {
      name: 'Title',
      referenceName: 'System.Title',
      label: 'Title',
      type: 'string',
      required: true,
      control: 'input',
      options: [],
    },
    {
      name: 'State',
      referenceName: 'System.State',
      label: 'State',
      type: 'string',
      required: false,
      control: 'select',
      options: [],
    },
    {
      name: 'Description',
      referenceName: 'System.Description',
      label: 'Description',
      type: 'html',
      required: true,
      control: 'textarea',
      options: [],
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    contextSubject = new BehaviorSubject<AzdoFlowContext>({
      organization: 'MiOrganizacionDevOps',
      correlationId: 'corr-1',
    });
    metadataSubject = new BehaviorSubject<AzdoMetadataResult>(metadata);
    hasPat = true;
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'fetchWorkItemConfig',
      'fetchTestPlans',
    ]);
    api.fetchWorkItemConfig.and.callFake(
      (_project: string, workItemType: string) =>
        Promise.resolve({
          project: 'Proyecto A',
          workItemType,
          fields:
            workItemType === 'Test Case'
              ? [{ ...fields[5], options: ['Ready'] }]
              : fields,
        }),
    );
    api.fetchTestPlans.and.resolveTo({
      project: 'Proyecto A',
      testPlans: [{ id: 20, name: 'Plan Arquitectura' }],
    });
    azdo = jasmine.createSpyObj<AzdoConfigService>(
      'AzdoConfigService',
      [
        'getContextSnapshot',
        'getConfigSnapshot',
        'getMetadataSnapshot',
        'hasRuntimeCredential',
        'getOrganization',
      ],
      {
        context$: contextSubject.asObservable(),
        metadata$: metadataSubject.asObservable(),
      },
    );
    azdo.getContextSnapshot.and.callFake(() => contextSubject.value);
    azdo.getConfigSnapshot.and.callFake(() => ({
      organization: contextSubject.value.organization,
    }));
    azdo.getMetadataSnapshot.and.callFake(() => metadataSubject.value);
    azdo.hasRuntimeCredential.and.callFake(() => hasPat);
    azdo.getOrganization.and.callFake(() => contextSubject.value.organization);
    workspace = jasmine.createSpyObj<WorkItemWorkspaceStateService>(
      'WorkItemWorkspaceStateService',
      ['setPrompt', 'preparePreview'],
    );
    toast = jasmine.createSpyObj<ToastService>('ToastService', [
      'success',
      'error',
      'info',
    ]);
    aiValidation = new AiRequestValidationService({
      requireApiBaseUrl: () => 'https://localhost:7071/api',
    } as ApplicationConfigurationService);
    confirmDialog = jasmine.createSpyObj<ConfirmDialogService>(
      'ConfirmDialogService',
      ['confirm'],
    );
    confirmDialog.confirm.and.resolveTo(true);
    workItemPromptBuilder = new WorkItemPromptBuilderService();
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    component = new WorkItemJsonBuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      workItemPromptBuilder,
      router,
      new FormValidationOrchestratorService(document),
    );
    component.ngOnInit();
  });

  afterEach(() => {
    component.ngOnDestroy();
    localStorage.clear();
    sessionStorage.clear();
  });

  function createDynamicField(
    name: string,
    referenceName: string,
    required = false,
    control = 'input',
    options: string[] = [],
  ): WorkItemFieldConfig {
    return {
      name,
      referenceName,
      label: name,
      type: 'string',
      required,
      control,
      options,
    };
  }

  it('initializes Azure context, metadata and selector summaries', () => {
    expect(component.form.get('azdoOrg')).toBeNull();
    expect(component.warning).toBe('');
    expect(component.isAzdoConfigured).toBeTrue();
    expect(component.projectSelectOptions).toEqual([
      { value: 'Proyecto A', label: 'Proyecto A' },
    ]);
    expect(component.areaSelectOptions[0].label).toContain('Global');
    expect(component.iterationSelectOptions[0].label).toContain('Global');
    component.testPlanOptions = [{ id: 20, name: 'Plan Arquitectura' }];
    expect(component.testPlanSelectOptions).toEqual([
      {
        value: 20,
        label: '20 - Plan Arquitectura',
      },
    ]);
  });

  it('renders required markers and aria-required for IA fields', async () => {
    await TestBed.configureTestingModule({
      imports: [WorkItemJsonBuilderComponent],
      providers: [
        { provide: AzdoConfigService, useValue: azdo },
        { provide: ApiService, useValue: api },
        { provide: WorkItemWorkspaceStateService, useValue: workspace },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorkItemJsonBuilderComponent);
    const rendered = fixture.componentInstance;
    fixture.detectChanges();

    rendered.form.patchValue(
      { azdoProject: 'Proyecto A' },
      { emitEvent: false },
    );
    await rendered.refreshWorkItemConfig(true);
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css('app-required-field-marker')).length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      fixture.debugElement.query(By.css('app-work-item-destination-fields')),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.css('app-work-item-type-selector')),
    ).not.toBeNull();
    const locationText = fixture.nativeElement.textContent as string;
    expect(locationText).toContain(
      'Selecciona el destino y el tipo del Work Item.',
    );
    expect(locationText.indexOf('Proyecto Azure DevOps')).toBeLessThan(
      locationText.indexOf('Tipo de Work Item'),
    );
    expect(locationText.indexOf('Tipo de Work Item')).toBeLessThan(
      locationText.indexOf('Área del proyecto'),
    );
    expect(locationText.indexOf('Área del proyecto')).toBeLessThan(
      locationText.indexOf('Iteración / Sprint'),
    );
    expect(
      fixture.debugElement.query(By.css('app-test-case-generation-settings')),
    ).not.toBeNull();
    expect(
      (
        fixture.nativeElement.querySelector(
          '#work-item-json-source-work-item',
        ) as HTMLElement
      ).getAttribute('aria-required'),
    ).toBe('true');
    expect(
      (
        fixture.nativeElement.querySelector(
          '#work-item-json-azdo-project',
        ) as HTMLElement
      ).getAttribute('aria-required'),
    ).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Requerido');
    expect(fixture.nativeElement.textContent).toContain(
      'Generar vista previa',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'Revisar y generar vista previa',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Copiar prompt');
    expect(fixture.nativeElement.textContent).not.toContain(
      'Actualizar prompt y JSON',
    );
    expect(
      fixture.nativeElement.querySelector('.work-item-json-results-card'),
    ).toBeNull();
    expect(
      (
        fixture.nativeElement.querySelector(
          '.work-item-json-main-actions .btn-primary',
        ) as HTMLButtonElement
      ).disabled,
    ).toBeFalse();

    fixture.destroy();
  });

  it('keeps submit available, blocks IA and clears only corrected inline issues', () => {
    component.form.patchValue(
      {
        sourceWorkItemText: '',
        azdoProject: '',
        iterationPath: '',
        areaPath: '',
      },
      { emitEvent: false },
    );
    component.sendToAi();

    expect(component.validationIssues.map((issue) => issue.key)).toEqual([
      'sourceWorkItemText',
      'azdoProject',
      'iterationPath',
      'areaPath',
    ]);
    expect(workspace.preparePreview).not.toHaveBeenCalled();

    component.form.controls['sourceWorkItemText'].setValue(
      'Texto funcional corregido',
    );
    expect(component.validationMessage('sourceWorkItemText')).toBe('');
    expect(component.validationMessage('azdoProject')).toContain('proyecto');
  });

  it('updates project-specific paths and coordinates work item dropdown', () => {
    component.form.patchValue({ azdoProject: 'Proyecto A' });
    expect(component.areaPathOptions).toEqual([
      'Proyecto A\\Equipo 1',
      'Proyecto A\\Equipo 2',
    ]);
    expect(component.iterationPathOptions).toEqual([
      'Proyecto A\\Sprint 1',
      'Proyecto A\\Sprint 2',
    ]);

    component.destinationControls.workItemType.setValue('Feature');
    expect(component.form.value.workItemType).toBe('Feature');
    expect(component.destinationControls.workItemType.value).toBe('Feature');
    component.onDocumentClick();
  });

  it('loads and classifies dynamic work item fields', async () => {
    component.form.patchValue(
      { azdoProject: 'Proyecto A' },
      { emitEvent: false },
    );

    await component.refreshWorkItemConfig(true);

    expect(component.dynamicFieldConfigs.length).toBe(4);
    const required = component.dynamicFieldConfigs.find(
      (field) => field.name === 'Custom Required',
    )!;
    const notes = component.dynamicFieldConfigs.find(
      (field) => field.name === 'Custom Notes',
    )!;
    const flag = component.dynamicFieldConfigs.find(
      (field) => field.name === 'Custom Flag',
    )!;
    const date = component.dynamicFieldConfigs.find(
      (field) => field.name === 'Custom Date',
    )!;
    expect(component.useDynamicSelectControl(required)).toBeTrue();
    expect(component.isDynamicTextareaControl(notes)).toBeTrue();
    expect(component.isDynamicCheckboxControl(flag)).toBeTrue();
    expect(component.dynamicInputType(date)).toBe('datetime-local');
    expect(component.dynamicInputStep({ ...date, type: 'integer' })).toBe('1');
    expect(component.dynamicInputStep({ ...date, type: 'number' })).toBe('any');
    expect(component.dynamicInputStep(date)).toBeNull();
    expect(
      component.form
        .get(component.dynamicControlName(required))
        ?.hasError('required'),
    ).toBeTrue();
  });

  it('validates required data and generates prompt and JSON when complete', async () => {
    component.tcStateOptions = ['Ready'];
    component.form.patchValue({ tcState: 'Ready' }, { emitEvent: false });
    component.generateResults();
    expect(component.validationIssues.length).toBeGreaterThan(0);
    expect(component.canGeneratePrompt).toBeFalse();

    component.form.patchValue(
      {
        sourceWorkItemText: 'Work Item origen',
        azdoProject: 'Proyecto A',
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
        tcCount: 0,
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig(true);
    component.form
      .get(component.dynamicControlName(fields[0]))
      ?.setValue('Uno');
    component.generateResults();
    expect(component.error).toContain('cantidad válida');

    component.form.patchValue({ tcCount: 2 }, { emitEvent: false });
    component.testPlanOptions = [{ id: 20, name: 'Plan Arquitectura' }];
    component.testPlanCatalogState = 'ready';
    component.form.patchValue({ testSuitePlanId: 20 }, { emitEvent: false });
    component.generateResults();
    expect(component.prompt).toContain('Work Item origen');
    expect(component.jsonTemplate).not.toBeNull();
    expect(component.message).toContain('Propuesta preparada');
    expect(component.jsonTemplate).toEqual(
      jasmine.objectContaining({ azdoProject: 'Proyecto A' }),
    );
    expect(workspace.setPrompt).toHaveBeenCalledWith(
      component.prompt,
      'work-item-json-builder',
      component.systemPrompt,
    );
  });

  ['Epic', 'Feature', 'User Story'].forEach((workItemType) => {
    it(`collects selected dynamic fields for ${workItemType} in the JSON prompt builder`, async () => {
      const valueAreaField = createDynamicField(
        'Value Area',
        'Microsoft.VSTS.Common.ValueArea',
        true,
        'select',
        ['Negocio', 'Arquitectura'],
      );
      const priorityField = createDynamicField(
        'Priority',
        'Microsoft.VSTS.Common.Priority',
        false,
        'select',
        ['1', '2'],
      );
      api.fetchWorkItemConfig.and.resolveTo({
        project: 'Proyecto A',
        workItemType,
        fields: [fields[4], fields[6], valueAreaField, priorityField],
      });
      component.form.patchValue(
        {
          sourceWorkItemText: 'Work Item origen',
          azdoProject: 'Proyecto A',
          workItemType,
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          useTestCases: false,
        },
        { emitEvent: false },
      );
      await component.refreshWorkItemConfig(true);
      component.form
        .get(component.dynamicControlName(valueAreaField))
        ?.setValue('Negocio');
      component.form
        .get(component.dynamicControlName(priorityField))
        ?.setValue('2');

      component.generateResults();

      const template = component.jsonTemplate as {
        workItem: Record<string, unknown>;
      };
      expect(template.workItem['valueArea']).toBe('Negocio');
      expect(template.workItem['priority']).toBe('2');
      expect(component.prompt).toContain('"valueArea": "Negocio"');
      expect(component.prompt).toContain('"priority": "2"');
      expect(component.prompt).not.toContain('"valueArea": ""');
    });
  });

  it('keeps Business Value separate from Value Area in the JSON prompt builder', async () => {
    const businessValueField = createDynamicField(
      'Business Value',
      'Microsoft.VSTS.Common.BusinessValue',
      true,
    );
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'Proyecto A',
      workItemType: 'Epic',
      fields: [fields[4], fields[6], businessValueField],
    });
    component.form.patchValue(
      {
        sourceWorkItemText: 'Work Item origen',
        azdoProject: 'Proyecto A',
        workItemType: 'Epic',
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
        useTestCases: false,
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig(true);
    component.form
      .get(component.dynamicControlName(businessValueField))
      ?.setValue(10);

    component.generateResults();

    const template = component.jsonTemplate as {
      workItem: Record<string, unknown>;
    };
    expect(template.workItem['businessValue']).toBe(10);
    expect(template.workItem['valueArea']).toBeUndefined();
    expect(component.prompt).toContain('"businessValue": 10');
    expect(component.prompt).not.toContain('"valueArea"');
  });

  it('blocks before preview when required Value Area is empty in the JSON prompt builder', async () => {
    const valueAreaField = createDynamicField(
      'Value Area',
      'Microsoft.VSTS.Common.ValueArea',
      true,
      'select',
      ['Negocio'],
    );
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'Proyecto A',
      workItemType: 'Feature',
      fields: [fields[4], fields[6], valueAreaField],
    });
    component.form.patchValue(
      {
        sourceWorkItemText: 'Work Item origen',
        azdoProject: 'Proyecto A',
        workItemType: 'Feature',
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
        useTestCases: false,
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig(true);

    component.sendToAi();

    expect(workspace.preparePreview).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.error).toBe('');
    expect(
      component.dynamicValidationMessages['Microsoft.VSTS.Common.ValueArea'],
    ).toBe('Completa Value Area.');
  });

  it('omits restored dynamic values that are not in the active work item type configuration', async () => {
    component.ngOnDestroy();
    sessionStorage.setItem(
      'work-item.json-builder.state.v1',
      JSON.stringify({
        formValues: {
          sourceWorkItemText: 'Work Item origen',
          azdoProject: 'Proyecto A',
          workItemType: 'Epic',
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          useTestCases: true,
          tcCount: 3,
          tcState: 'Ready',
          aiCantidadTestcases: false,
          testSuitePlanId: 20,
          dynamicWorkItemFields: {
            'Custom Required': 'Uno',
            ObsoleteUserStoryField: 'stale',
          },
        },
        prompt: '',
      }),
    );
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'Proyecto A',
      workItemType: 'Epic',
      fields: [fields[4], fields[6], fields[0]],
    });
    component = new WorkItemJsonBuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      workItemPromptBuilder,
      router,
    );
    component.ngOnInit();

    await component.refreshWorkItemConfig(true);
    component.generateResults();

    expect(JSON.stringify(component.jsonTemplate)).toContain(
      '"required":"Uno"',
    );
    expect(JSON.stringify(component.jsonTemplate)).not.toContain(
      'ObsoleteUserStoryField',
    );
    expect(component.jsonTemplate).toEqual(
      jasmine.objectContaining({ workItemType: 'Epic' }),
    );
  });

  it('handles test case toggles, AI decision and manual counts', () => {
    component.testCaseControls.enabled.setValue(false);
    expect(component.useTestCases).toBeFalse();
    expect(component.form.getRawValue().testSuitePlanId).toBeNull();
    component.testCaseControls.enabled.setValue(true);
    component.testCaseControls.quantityMode.setValue('ai');
    expect(component.aiDecidesTestCaseCount).toBeTrue();
    expect(component.canEditManualTestCaseCount).toBeFalse();
    component.testCaseControls.quantityMode.setValue('fixed');
    component.testCaseControls.quantity.setValue(1);
    expect(component.form.value.tcCount).toBe(1);
    expect(component.testCaseControls.quantity.value).toBe(1);
    component.form.patchValue({ tcCount: 0 }, { emitEvent: false });
    component.testCaseControls.quantity.setValue(1);
    expect(component.form.value.tcCount).toBe(1);

    component.form.patchValue({ workItemType: 'Epic' }, { emitEvent: false });
    component.testCaseControls.enabled.setValue(true);
    expect(component.form.value.useTestCases).toBeTrue();
    expect(component.supportsTestCasesForSelectedType).toBeFalse();
  });

  it('navigates to preview only with a valid generated prompt', async () => {
    component.sendToAi();
    expect(router.navigate).not.toHaveBeenCalled();

    component.form.patchValue(
      {
        sourceWorkItemText: 'Work Item origen',
        azdoProject: 'Proyecto A',
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig();
    component.testPlanOptions = [{ id: 20, name: 'Plan Arquitectura' }];
    component.testPlanCatalogState = 'ready';
    component.form.patchValue({ testSuitePlanId: 20 }, { emitEvent: false });
    component.form
      .get(component.dynamicControlName(fields[0]))
      ?.setValue('Uno');
    await component.sendToAi();
    expect(workspace.preparePreview).toHaveBeenCalledWith(
      component.prompt,
      'work-item-json-builder',
      jasmine.objectContaining({
        workItemType: 'User Story',
        workItem: jasmine.objectContaining({ required: 'Uno' }),
      }),
      jasmine.any(Object),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/previsualizar-work-item']);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('handles missing, successful, cached and failed work item configuration', async () => {
    component.form.patchValue({ azdoProject: '' }, { emitEvent: false });
    await component.refreshWorkItemConfig();
    expect(component.workItemConfigMessage).toContain('Selecciona un proyecto');

    component.form.patchValue(
      { azdoProject: 'Proyecto A' },
      { emitEvent: false },
    );
    hasPat = false;
    await component.refreshWorkItemConfig();
    expect(component.workItemConfigError).toContain('PAT');

    hasPat = true;
    await component.refreshWorkItemConfig();
    await component.refreshWorkItemConfig();
    expect(api.fetchWorkItemConfig).toHaveBeenCalledTimes(2);

    api.fetchWorkItemConfig.and.rejectWith(new Error('config error'));
    await component.refreshWorkItemConfig(true);
    expect(component.workItemConfigError).toBe('config error');
    expect(component.dynamicFieldConfigs).toEqual([]);
  });

  it('loads and reports Test Plans for all response states', async () => {
    component.form.patchValue({ azdoProject: '' }, { emitEvent: false });
    await component.refreshTestPlans();
    expect(component.testPlansMessage).toContain('Selecciona un proyecto');

    component.form.patchValue(
      { azdoProject: 'Proyecto A' },
      { emitEvent: false },
    );
    hasPat = false;
    await component.refreshTestPlans();
    expect(component.testPlansError).toContain('PAT');

    hasPat = true;
    await component.refreshTestPlans(true);
    expect(component.testPlanOptions).toEqual([
      { id: 20, name: 'Plan Arquitectura' },
    ]);

    api.fetchTestPlans.and.resolveTo({ project: 'Proyecto A', testPlans: [] });
    await component.refreshTestPlans(true);
    expect(component.testPlansMessage).toContain('no devolvio');

    api.fetchTestPlans.and.rejectWith(new Error('plans error'));
    await component.refreshTestPlans(true);
    expect(component.testPlansError).toBe('plans error');
  });

  it('does not apply a Work Item or Test Case catalog response after destruction', async () => {
    let resolveWorkItem!: (value: {
      project: string;
      workItemType: string;
      fields: WorkItemFieldConfig[];
    }) => void;
    let resolveTestCase!: (value: {
      project: string;
      workItemType: string;
      fields: WorkItemFieldConfig[];
    }) => void;
    const workItemResponse = new Promise<{
      project: string;
      workItemType: string;
      fields: WorkItemFieldConfig[];
    }>((resolve) => {
      resolveWorkItem = resolve;
    });
    const testCaseResponse = new Promise<{
      project: string;
      workItemType: string;
      fields: WorkItemFieldConfig[];
    }>((resolve) => {
      resolveTestCase = resolve;
    });
    api.fetchWorkItemConfig.and.callFake((_project: string, type: string) =>
      type === 'Test Case' ? testCaseResponse : workItemResponse,
    );
    component.form.patchValue(
      { azdoProject: 'Proyecto A', workItemType: 'User Story' },
      { emitEvent: false },
    );

    const request = component.refreshWorkItemConfig(true);
    component.ngOnDestroy();
    resolveWorkItem({
      project: 'Proyecto A',
      workItemType: 'User Story',
      fields: [createDynamicField('Tardio', 'Custom.Late')],
    });
    resolveTestCase({
      project: 'Proyecto A',
      workItemType: 'Test Case',
      fields: [
        createDynamicField('State', 'System.State', false, 'select', [
          'Closed',
        ]),
      ],
    });
    await request;

    expect(component.dynamicFieldConfigs).toEqual([]);
    expect(component.tcStateOptions).toEqual([]);
  });

  it('preserves or clears entered state according to reset confirmation', async () => {
    component.form.patchValue(
      { sourceWorkItemText: 'Work Item en progreso' },
      { emitEvent: false },
    );
    component.prompt = 'prompt generado';
    component.jsonTemplate = {
      workItem: {
        title: '',
        description: '',
        acceptanceCriteria: '',
        priority: '',
        storyPoints: '',
        risk: '',
        startDate: '',
        finishDate: '',
        valueArea: '',
        tipoHU: '',
        frenteDeTrabajo: '',
        assignedTo: '',
      },
      azdoOrg: '',
      azdoProject: '',
      iterationPath: '',
      areaPath: '',
      workItemType: 'User Story',
    };
    confirmDialog.confirm.and.resolveTo(false);

    await component.resetForm();
    expect(component.form.value.sourceWorkItemText).toBe(
      'Work Item en progreso',
    );
    expect(component.prompt).toBe('prompt generado');

    confirmDialog.confirm.and.resolveTo(true);
    await component.resetForm();
    expect(component.form.value.sourceWorkItemText).toBe('');
    expect(component.form.value.azdoProject).toBe('');
    expect(component.prompt).toBe('');
    expect(component.jsonTemplate).toBeNull();
    expect(workspace.setPrompt).toHaveBeenCalledWith(
      '',
      'work-item-json-builder',
    );
    expect(toast.info).toHaveBeenCalledWith('Formulario reiniciado.');
  });

  it('persists a pending debounced state before destroy', () => {
    component.form.patchValue({ sourceWorkItemText: 'Work Item pendiente' });

    component.ngOnDestroy();

    const persisted = JSON.parse(
      sessionStorage.getItem('work-item.json-builder.state.v1') ?? '{}',
    );
    expect(persisted.formValues.sourceWorkItemText).toBe('Work Item pendiente');
    expect(persisted.formValues.aiCantidadTestcases).toBeFalse();
    expect(persisted.formValues.testSuitePlanId).toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(
        persisted.formValues,
        'ai.cantidadTestcases',
      ),
    ).toBeFalse();
  });

  it('does not rewrite old state after reset cancels pending save', async () => {
    component.form.patchValue({ sourceWorkItemText: 'Work Item anterior' });
    await component.resetForm();

    component.ngOnDestroy();

    expect(sessionStorage.getItem('work-item.json-builder.state.v1')).toBeNull();
    expect(localStorage.getItem('work-item.json-builder.state.v1')).toBeNull();
  });

  it('restores persisted state and removes corrupt state', () => {
    component.ngOnDestroy();
    sessionStorage.setItem(
      'work-item.json-builder.state.v1',
      JSON.stringify({
        formValues: {
          sourceWorkItemText: 'Work Item persistido',
          azdoProject: 'Proyecto A',
          workItemType: 'User Story',
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          useTestCases: true,
          tcCount: 4,
          tcState: 'Closed',
          aiCantidadTestcases: false,
          testSuitePlanId: 20,
          dynamicWorkItemFields: { Campo: 'valor' },
        },
        prompt: 'prompt persistido',
      }),
    );
    component = new WorkItemJsonBuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      workItemPromptBuilder,
      router,
    );
    component.ngOnInit();

    expect(component.form.value.sourceWorkItemText).toBe(
      'Work Item persistido',
    );
    expect(component.prompt).toBe('prompt persistido');
    expect(workspace.setPrompt).not.toHaveBeenCalledWith(
      'prompt persistido',
      'work-item-json-builder',
    );

    component.ngOnDestroy();
    sessionStorage.setItem('work-item.json-builder.state.v1', '{invalid');
    component = new WorkItemJsonBuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      workItemPromptBuilder,
      router,
    );
    component.ngOnInit();
    expect(sessionStorage.getItem('work-item.json-builder.state.v1')).toBeNull();
  });

  it('restores legacy persisted AI decision key without keeping dotted form controls', async () => {
    component.ngOnDestroy();
    sessionStorage.setItem(
      'work-item.json-builder.state.v1',
      JSON.stringify({
        formValues: {
          sourceWorkItemText: 'Work Item legacy',
          azdoProject: 'Proyecto A',
          workItemType: 'User Story',
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          useTestCases: true,
          tcCount: 4,
          tcState: 'Ready',
          'ai.cantidadTestcases': true,
          testSuitePlanId: 20,
          dynamicWorkItemFields: {},
        },
        prompt: '',
      }),
    );

    component = new WorkItemJsonBuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      workItemPromptBuilder,
      router,
    );
    component.ngOnInit();
    component.tcStateOptions = ['Ready'];
    component.testPlanOptions = [{ id: 20, name: 'Plan Arquitectura' }];
    component.testPlanCatalogState = 'ready';
    component.form.patchValue({ testSuitePlanId: 20 }, { emitEvent: false });
    await component.refreshWorkItemConfig(true);
    component.form
      .get(component.dynamicControlName(fields[0]))
      ?.setValue('Uno');
    component.generateResults();

    expect(component.aiDecidesTestCaseCount).toBeTrue();
    expect(component.form.get('ai.cantidadTestcases')?.value).toBe('ai');
    expect(component.form.contains('ai.cantidadTestcases')).toBeFalse();
    expect(component.jsonTemplate).toEqual(
      jasmine.objectContaining({ testCases: [] }),
    );
  });

  it('updates warning and clears generated state when Azure credentials disappear', () => {
    component.prompt = 'prompt';
    component.jsonTemplate = {
      workItem: {
        title: '',
        description: '',
        acceptanceCriteria: '',
        priority: '',
        storyPoints: '',
        risk: '',
        startDate: '',
        finishDate: '',
        valueArea: '',
        tipoHU: '',
        frenteDeTrabajo: '',
        assignedTo: '',
      },
      azdoOrg: '',
      azdoProject: '',
      iterationPath: '',
      areaPath: '',
      workItemType: 'User Story',
    };
    hasPat = false;
    contextSubject.next({
      organization: '',
      correlationId: 'corr-2',
    });

    expect(component.warning).toContain('Primero debes guardar');
    expect(component.prompt).toBe('');
    expect(component.jsonTemplate).toBeNull();
    expect(component.testPlanOptions).toEqual([]);
  });
});
