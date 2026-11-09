import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BuilderComponent } from './builder.component';
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
  WorkItemConfigResult,
  WorkItemFieldConfig,
} from '../../models/types';
import { ApplicationConfigurationService } from '../../services/application-configuration.service';

describe('BuilderComponent', () => {
  let component: BuilderComponent;
  let contextSubject: BehaviorSubject<AzdoFlowContext>;
  let metadataSubject: BehaviorSubject<AzdoMetadataResult>;
  let api: jasmine.SpyObj<ApiService>;
  let azdo: jasmine.SpyObj<AzdoConfigService>;
  let workspace: jasmine.SpyObj<WorkItemWorkspaceStateService>;
  let toast: jasmine.SpyObj<ToastService>;
  let aiValidation: AiRequestValidationService;
  let confirmDialog: jasmine.SpyObj<ConfirmDialogService>;
  let router: jasmine.SpyObj<Router>;
  let promptBuilder: WorkItemPromptBuilderService;
  let hasPat: boolean;

  const metadata: AzdoMetadataResult = {
    projects: ['Proyecto A'],
    areaPaths: ['Proyecto A/Area/Equipo global'],
    iterationPaths: ['Proyecto A/Iteration/Sprint global'],
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
      name: 'Story Points',
      referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints',
      label: 'Story Points',
      type: 'number',
      required: true,
      control: 'input',
      options: [],
    },
    {
      name: 'Priority',
      referenceName: 'Microsoft.VSTS.Common.Priority',
      label: 'Priority',
      type: 'integer',
      required: false,
      control: 'input',
      options: [],
    },
    {
      name: 'Custom Choice',
      referenceName: 'Custom.Choice',
      label: 'Elección',
      type: 'string',
      required: true,
      control: 'select',
      options: ['A', 'B'],
    },
    {
      name: 'Custom Notes',
      referenceName: 'Custom.Notes',
      label: 'Notas',
      type: 'html',
      required: false,
      control: 'textarea',
      options: [],
    },
    {
      name: 'Custom Enabled',
      referenceName: 'Custom.Enabled',
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
      'fetchAzdoMetadata',
      'fetchWorkItemConfig',
      'fetchTestPlans',
    ]);
    api.fetchAzdoMetadata.and.resolveTo(metadata);
    api.fetchWorkItemConfig.and.callFake(
      (_project: string, workItemType: string) =>
        Promise.resolve({
          project: 'Proyecto A',
          workItemType,
          fields:
            workItemType === 'Test Case'
              ? [
                  {
                    ...fields[6],
                    referenceName: 'System.State',
                    name: 'State',
                    label: 'State',
                    control: 'select',
                    options: ['Ready'],
                  },
                ]
              : fields,
        }),
    );
    api.fetchTestPlans.and.resolveTo({
      project: 'Proyecto A',
      testPlans: [{ id: 10, name: 'Plan QA' }],
    });
    azdo = jasmine.createSpyObj<AzdoConfigService>(
      'AzdoConfigService',
      [
        'getContextSnapshot',
        'getConfigSnapshot',
        'getMetadataSnapshot',
        'hasRuntimeCredential',
        'getOrganization',
        'clearMetadata',
        'setMetadata',
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
    azdo.setMetadata.and.callFake((value) => metadataSubject.next(value));
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
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    promptBuilder = new WorkItemPromptBuilderService();

    component = new BuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      promptBuilder,
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

  it('initializes metadata, selectors and path labels', () => {
    expect(component.form.get('azdoOrg')).toBeNull();
    expect(component.projectSelectOptions).toEqual([
      { value: 'Proyecto A', label: 'Proyecto A' },
    ]);
    expect(component.areaSelectOptions[0].label).toContain('Equipo global');
    expect(component.iterationSelectOptions[0].label).toContain(
      'Sprint global',
    );
    component.testPlanOptions = [{ id: 10, name: 'Plan QA' }];
    expect(component.testPlanSelectOptions).toEqual([
      { value: 10, label: '10 - Plan QA' },
    ]);
    expect(component.selectedWorkItemType.value).toBe('User Story');
    expect(component.supportsTestCasesForSelectedType).toBeTrue();
  });

  it('renders nested reactive form groups without runtime control errors', async () => {
    await TestBed.configureTestingModule({
      imports: [BuilderComponent],
      providers: [
        { provide: AzdoConfigService, useValue: azdo },
        { provide: ApiService, useValue: api },
        { provide: WorkItemWorkspaceStateService, useValue: workspace },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BuilderComponent);

    expect(() => fixture.detectChanges()).not.toThrow();

    fixture.destroy();
  });

  it('renders required markers and dynamic fields for the selected work item type', async () => {
    await TestBed.configureTestingModule({
      imports: [BuilderComponent],
      providers: [
        { provide: AzdoConfigService, useValue: azdo },
        { provide: ApiService, useValue: api },
        { provide: WorkItemWorkspaceStateService, useValue: workspace },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BuilderComponent);
    const rendered = fixture.componentInstance;
    fixture.detectChanges();

    rendered.form.patchValue(
      { azdoProject: 'Proyecto A' },
      { emitEvent: false },
    );
    await rendered.refreshWorkItemConfig(true);
    fixture.detectChanges();

    const markerElements = fixture.debugElement.queryAll(
      By.css('app-required-field-marker'),
    );
    expect(markerElements.length).toBeGreaterThanOrEqual(3);
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
    expect(locationText).toContain(
      'El proyecto determina las áreas, iteraciones, campos y Test Plans disponibles.',
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
        fixture.nativeElement.querySelector('#builder-need') as HTMLElement
      ).getAttribute('aria-required'),
    ).toBe('true');
    expect(
      (
        fixture.nativeElement.querySelector(
          '#builder-azdo-project',
        ) as HTMLElement
      ).getAttribute('aria-required'),
    ).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Elección');
    expect(fixture.nativeElement.textContent).toContain('Story Points');
    expect(fixture.nativeElement.textContent).toContain('Priority');
    expect(fixture.nativeElement.textContent).toContain(
      'Generar vista previa',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'Revisar y generar vista previa',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Copiar prompt');
    expect(fixture.nativeElement.textContent).not.toContain('Copiar JSON');
    expect(fixture.nativeElement.textContent).not.toContain('Descargar JSON');
    expect(
      fixture.nativeElement.querySelector('.builder-results-card'),
    ).toBeNull();
    expect(
      (
        fixture.nativeElement.querySelector(
          '.builder-main-actions .btn-primary',
        ) as HTMLButtonElement
      ).disabled,
    ).toBeFalse();

    fixture.destroy();
  });

  it('reports the precise missing Azure connection requirement', () => {
    contextSubject.next({ organization: '', correlationId: 'missing' });
    hasPat = false;
    expect(component.azureConnectionMessage).toBe(
      'Configura la organización y el Azure PAT para continuar.',
    );

    hasPat = true;
    expect(component.azureConnectionMessage).toBe(
      'Configura la organización de Azure DevOps para cargar la información.',
    );

    contextSubject.next({ organization: 'Org', correlationId: 'configured' });
    hasPat = false;
    expect(component.azureConnectionMessage).toBe(
      'Ingresa tu Azure PAT en Configuración Azure para actualizar la información.',
    );
  });

  it('reports core issues in visual order and clears only the corrected field', () => {
    component.form.patchValue(
      { need: '', azdoProject: '', iterationPath: '', areaPath: '' },
      { emitEvent: false },
    );
    component.sendToAi();

    expect(component.validationIssues.map((issue) => issue.key)).toEqual([
      'need',
      'azdoProject',
      'iterationPath',
      'areaPath',
    ]);
    expect(workspace.preparePreview).not.toHaveBeenCalled();

    component.form.controls['need'].setValue('Necesidad corregida');
    expect(component.validationMessage('need')).toBe('');
    expect(component.validationMessage('azdoProject')).toContain('proyecto');
  });

  it('updates project paths, normalizes selections and coordinates dropdowns', () => {
    component.form.patchValue(
      {
        areaPath: 'Proyecto A/Area/No existe',
        iterationPath: 'Proyecto A/Iteration/No existe',
      },
      { emitEvent: false },
    );
    component.form.patchValue({ azdoProject: 'Proyecto A' });

    expect(component.areaPathOptions).toEqual([
      'Proyecto A\\Equipo 1',
      'Proyecto A\\Equipo 2',
    ]);
    expect(component.iterationPathOptions).toEqual([
      'Proyecto A\\Sprint 1',
      'Proyecto A\\Sprint 2',
    ]);
    expect(component.form.value.areaPath).toBe('');
    expect(component.form.value.iterationPath).toBe('');

    component.destinationControls.workItemType.setValue('Epic');
    expect(component.form.value.workItemType).toBe('Epic');
    expect(component.useTestCases).toBeFalse();
    component.onDocumentClick();
  });

  it('loads all dynamic work item fields including Priority and Story Points', async () => {
    component.form.patchValue(
      { azdoProject: 'Proyecto A' },
      { emitEvent: false },
    );

    await component.refreshWorkItemConfig(true);

    expect(api.fetchWorkItemConfig).toHaveBeenCalled();
    expect(component.dynamicWorkItemFieldConfigs.length).toBe(6);
    const storyPoints = component.dynamicWorkItemFieldConfigs.find(
      (field) => field.name === 'Story Points',
    )!;
    const priority = component.dynamicWorkItemFieldConfigs.find(
      (field) => field.name === 'Priority',
    )!;
    const choice = component.dynamicWorkItemFieldConfigs.find(
      (field) => field.name === 'Custom Choice',
    )!;
    const notes = component.dynamicWorkItemFieldConfigs.find(
      (field) => field.name === 'Custom Notes',
    )!;
    const enabled = component.dynamicWorkItemFieldConfigs.find(
      (field) => field.name === 'Custom Enabled',
    )!;
    const date = component.dynamicWorkItemFieldConfigs.find(
      (field) => field.name === 'Custom Date',
    )!;
    expect(storyPoints).toBeDefined();
    expect(priority).toBeDefined();
    expect(choice.options.length).toBeGreaterThan(0);
    expect(notes.type).toBe('html');
    expect(enabled.type).toBe('boolean');
    expect(date.type).toBe('datetime');
  });

  it('removes dynamic fields from the previous work item type before generating output', async () => {
    const epicField: WorkItemFieldConfig = {
      name: 'Epic Business Value',
      referenceName: 'Microsoft.VSTS.Common.BusinessValue',
      label: 'Business Value',
      type: 'integer',
      required: true,
      control: 'input',
      options: [],
    };
    api.fetchWorkItemConfig.and.callFake(
      (_project: string, workItemType: string) =>
        Promise.resolve({
          project: 'Proyecto A',
          workItemType,
          fields:
            workItemType === 'Epic'
              ? [...fields.slice(6), epicField]
              : fields,
        }),
    );

    component.form.patchValue(
      {
        need: 'Necesidad',
        azdoProject: 'Proyecto A',
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
        workItemType: 'User Story',
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig(true);

    const oldCustomField = fields[2];
    const oldControlName = component.dynamicControlName(oldCustomField);
    component.form.get(oldControlName)?.setValue('A');

    component.form.patchValue({ workItemType: 'Epic' }, { emitEvent: false });
    await component.refreshWorkItemConfig(true);

    expect(component.form.get(oldControlName)).toBeNull();
    expect(
      component.dynamicWorkItemFieldConfigs.map((field) => field.name),
    ).toEqual(['Epic Business Value']);
    component.form.get(component.dynamicControlName(epicField))?.setValue(10);

    await component.onGenerate();

    expect(component.jsonOut?.workItem['Custom Choice']).toBeUndefined();
    expect(component.jsonOut?.workItem['businessValue'] as unknown).toBe(10);
    expect(component.jsonOut?.workItem['valueArea']).toBeUndefined();
    expect(component.jsonOut?.workItemType).toBe('Epic');
    expect(component.jsonOut?.testCases).toEqual([]);
  });

  it('generates valid output and validates required fields', async () => {
    component.form.patchValue(
      {
        need: 'Necesidad',
        azdoProject: 'Proyecto A',
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
        tcCount: 0,
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig(true);
    for (const field of component.dynamicWorkItemFieldConfigs.filter(
      (item) => item.required,
    )) {
      component.form
        .get(component.dynamicControlName(field))
        ?.setValue(field.options[0] ?? 1);
    }
    component.onGenerate();
    expect(component.message).toContain('cantidad válida');

    component.form.patchValue({ tcCount: 2 }, { emitEvent: false });
    await component.refreshWorkItemConfig();
    component.testPlanOptions = [{ id: 10, name: 'Plan QA' }];
    component.testPlanCatalogState = 'ready';
    component.form.patchValue(
      { testSuite: { planId: 10 } },
      { emitEvent: false },
    );
    const customField = component.dynamicWorkItemFieldConfigs.find(
      (f) => f.name === 'Custom Choice',
    )!;
    const storyPointsField = component.dynamicWorkItemFieldConfigs.find(
      (f) => f.name === 'Story Points',
    )!;
    component.form
      .get(component.dynamicControlName(customField))
      ?.setValue('A');
    component.form
      .get(component.dynamicControlName(storyPointsField))
      ?.setValue(3);
    await component.sendToAi();
    expect(component.prompt).toContain('Necesidad');
    expect(component.jsonOut).not.toBeNull();
    expect(component.builderMessageTone).toBe('success');
    expect(workspace.preparePreview).toHaveBeenCalledWith(
      component.prompt,
      'builder',
      component.jsonOut!,
      jasmine.any(Object),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/previsualizar-work-item']);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('blocks a duplicate generation while direct navigation is pending', async () => {
    component.form.patchValue(
      {
        need: 'Necesidad inicial',
        azdoProject: 'Proyecto A',
        workItemType: 'Epic',
        useTestCases: false,
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig(true);
    for (const field of component.dynamicWorkItemFieldConfigs.filter(
      (item) => item.required,
    )) {
      component.form
        .get(component.dynamicControlName(field))
        ?.setValue(field.options[0] ?? 1);
    }
    let resolveNavigation!: (value: boolean) => void;
    router.navigate.and.returnValue(
      new Promise((resolve) => (resolveNavigation = resolve)),
    );
    const first = component.sendToAi();
    const duplicate = component.sendToAi();

    expect(component.isSubmittingPreview).toBeTrue();
    expect(workspace.preparePreview).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledTimes(1);

    resolveNavigation(true);
    await Promise.all([first, duplicate]);
    expect(component.isSubmittingPreview).toBeFalse();
  });

  it('keeps required Value Area in builder output when Test Suite is selected', async () => {
    const valueAreaField: WorkItemFieldConfig = {
      name: 'Value Area',
      referenceName: 'Microsoft.VSTS.Common.ValueArea',
      label: 'Value Area',
      type: 'string',
      required: true,
      control: 'select',
      options: ['Negocio', 'Arquitectura'],
    };
    api.fetchWorkItemConfig.and.callFake(
      (_project: string, workItemType: string) =>
        Promise.resolve({
          project: 'Proyecto A',
          workItemType,
          fields:
            workItemType === 'Test Case'
              ? [
                  {
                    ...fields[6],
                    referenceName: 'System.State',
                    name: 'State',
                    label: 'State',
                    control: 'select',
                    options: ['Ready'],
                  },
                ]
              : [...fields, valueAreaField],
        }),
    );
    component.form.patchValue(
      {
        need: 'Necesidad',
        azdoProject: 'Proyecto A',
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
        tcCount: 2,
        testSuite: { planId: 10 },
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig();

    const customField = component.dynamicWorkItemFieldConfigs.find(
      (f) => f.name === 'Custom Choice',
    )!;
    const storyPointsField = component.dynamicWorkItemFieldConfigs.find(
      (f) => f.name === 'Story Points',
    )!;
    component.form
      .get(component.dynamicControlName(customField))
      ?.setValue('A');
    component.form
      .get(component.dynamicControlName(storyPointsField))
      ?.setValue(3);
    component.form
      .get(component.dynamicControlName(valueAreaField))
      ?.setValue('Negocio');
    component.testPlanOptions = [{ id: 10, name: 'Plan QA' }];
    component.testPlanCatalogState = 'ready';

    await component.sendToAi();

    expect(component.message).not.toContain('campos obligatorios');
    expect(component.jsonOut?.workItem.valueArea).toBe('Negocio');
    expect(component.prompt).toContain('"valueArea": "Negocio"');
    expect(component.prompt).not.toContain('"valueArea": ""');
    expect(component.prompt).toContain('- workItem.valueArea');
    expect(component.jsonOut?.testSuite.planId).toBe(10);
    expect(workspace.preparePreview).toHaveBeenCalledWith(
      component.prompt,
      'builder',
      component.jsonOut!,
      jasmine.any(Object),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/previsualizar-work-item']);
  });

  it('blocks User Story before OpenAI when required Value Area is empty with Test Suite selected', async () => {
    const valueAreaField: WorkItemFieldConfig = {
      name: 'Value Area',
      referenceName: 'Microsoft.VSTS.Common.ValueArea',
      label: 'Value Area',
      type: 'string',
      required: true,
      control: 'select',
      options: ['Negocio', 'Arquitectura'],
    };
    api.fetchWorkItemConfig.and.resolveTo({
      project: 'Proyecto A',
      workItemType: 'User Story',
      fields: [...fields.slice(6), valueAreaField],
    });
    component.form.patchValue(
      {
        need: 'Necesidad',
        azdoProject: 'Proyecto A',
        iterationPath: 'Proyecto A/Iteration/Sprint 1',
        areaPath: 'Proyecto A/Area/Equipo 1',
        tcCount: 2,
        testSuite: { planId: 10 },
      },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig();
    component.sendToAi();

    expect(workspace.preparePreview).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.message).toBe('');
    expect(
      component.dynamicValidationMessages['Microsoft.VSTS.Common.ValueArea'],
    ).toBe('Completa Value Area.');
    expect(component.validationIssues[0].referenceName).toBe(
      'Microsoft.VSTS.Common.ValueArea',
    );
  });

  ['Feature', 'Epic'].forEach((workItemType) => {
    it(`sends ${workItemType} base payload with Value Area to preview`, async () => {
      const valueAreaField: WorkItemFieldConfig = {
        name: 'Value Area',
        referenceName: 'Microsoft.VSTS.Common.ValueArea',
        label: 'Value Area',
        type: 'string',
        required: true,
        control: 'select',
        options: ['Negocio', 'Arquitectura'],
      };
      api.fetchWorkItemConfig.and.resolveTo({
        project: 'Proyecto A',
        workItemType,
        fields: [...fields.slice(6), valueAreaField],
      });
      component.form.patchValue(
        {
          need: 'Necesidad',
          azdoProject: 'Proyecto A',
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          workItemType,
          useTestCases: false,
          testSuite: { planId: 0 },
        },
        { emitEvent: false },
      );
      await component.refreshWorkItemConfig();
      component.form
        .get(component.dynamicControlName(valueAreaField))
        ?.setValue('Negocio');

      await component.sendToAi();

      const basePayload = workspace.preparePreview.calls.mostRecent().args[2];
      expect(basePayload?.workItemType).toBe(workItemType);
      expect(basePayload?.workItem.valueArea).toBe('Negocio');
      expect(component.prompt).toContain('"valueArea": "Negocio"');
      expect(component.prompt).not.toContain('"valueArea": ""');
      expect(component.prompt).toContain('- workItem.valueArea');
      expect(basePayload?.testCases).toEqual([]);
      expect(basePayload?.testSuite).toEqual({ planId: 0 });
    });

    it(`blocks ${workItemType} before OpenAI when required Value Area is empty`, async () => {
      const valueAreaField: WorkItemFieldConfig = {
        name: 'Value Area',
        referenceName: 'Microsoft.VSTS.Common.ValueArea',
        label: 'Value Area',
        type: 'string',
        required: true,
        control: 'select',
        options: ['Negocio', 'Arquitectura'],
      };
      api.fetchWorkItemConfig.and.resolveTo({
        project: 'Proyecto A',
        workItemType,
        fields: [...fields.slice(6), valueAreaField],
      });
      component.form.patchValue(
        {
          need: 'Necesidad',
          azdoProject: 'Proyecto A',
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          workItemType,
          useTestCases: false,
          testSuite: { planId: 0 },
        },
        { emitEvent: false },
      );
      await component.refreshWorkItemConfig();

      component.sendToAi();

      expect(workspace.preparePreview).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.message).toBe('');
      expect(
        component.dynamicValidationMessages['Microsoft.VSTS.Common.ValueArea'],
      ).toBe('Completa Value Area.');
    });

    it(`keeps ${workItemType} Business Value separate from Value Area`, async () => {
      const businessValueField: WorkItemFieldConfig = {
        name: 'Business Value',
        referenceName: 'Microsoft.VSTS.Common.BusinessValue',
        label: 'Business Value',
        type: 'string',
        required: true,
        control: 'select',
        options: ['Negocio', 'Arquitectura'],
      };
      api.fetchWorkItemConfig.and.resolveTo({
        project: 'Proyecto A',
        workItemType,
        fields: [...fields.slice(6), businessValueField],
      });
      component.form.patchValue(
        {
          need: 'Necesidad',
          azdoProject: 'Proyecto A',
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          workItemType,
          useTestCases: false,
          testSuite: { planId: 0 },
        },
        { emitEvent: false },
      );
      await component.refreshWorkItemConfig();
      component.form
        .get(component.dynamicControlName(businessValueField))
        ?.setValue('Negocio');

      await component.sendToAi();

      const basePayload = workspace.preparePreview.calls.mostRecent().args[2];
      expect(basePayload?.workItemType).toBe(workItemType);
      expect(basePayload?.workItem['businessValue']).toBe('Negocio');
      expect(basePayload?.workItem.valueArea).toBeUndefined();
      expect(basePayload?.workItem['Business Value']).toBeUndefined();
      expect(basePayload?.testCases).toEqual([]);
      expect(basePayload?.testSuite).toEqual({ planId: 0 });
    });
  });

  it('handles test case toggles and count normalization', () => {
    component.testCaseControls.enabled.setValue(false);
    expect(component.useTestCases).toBeFalse();
    expect(component.form.getRawValue().testSuite.planId).toBeNull();
    component.testCaseControls.enabled.setValue(true);
    component.testCaseControls.quantityMode.setValue('ai');
    expect(component.aiDecidesTestCaseCount).toBeTrue();
    expect(component.canEditManualTestCaseCount).toBeFalse();
    component.testCaseControls.quantityMode.setValue('fixed');
    component.tcStateOptions = ['Ready'];
    component.form.patchValue({ tcState: 'Ready' }, { emitEvent: false });
    component.form.patchValue({ tcCount: 0 }, { emitEvent: false });
    component.testCaseControls.quantity.setValue(1);
    expect(component.form.value.tcCount).toBe(1);
    expect(component.testCaseControls.state.value).toBe('Ready');
  });

  it('refreshes Azure metadata and reports empty and timeout responses', async () => {
    const empty: AzdoMetadataResult = {
      projects: [],
      areaPaths: [],
      iterationPaths: [],
      projectMetadata: [],
    };
    api.fetchAzdoMetadata.and.resolveTo(empty);

    await component.refreshAzdoData(true);
    expect(component.azdoDataWarning).toContain('sin información');
    expect(component.canRetryAzdoData).toBeFalse();

    api.fetchAzdoMetadata.and.rejectWith(new Error('timeout'));
    await component.refreshAzdoData(true);
    expect(component.azdoDataError).toBe('timeout');
    expect(component.canRetryAzdoData).toBeTrue();

    hasPat = false;
    await component.refreshAzdoData();
    expect(component.azdoDataError).toContain('Configuración Azure');
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
    expect(component.workItemConfigError).toContain('Azure PAT');

    hasPat = true;
    await component.refreshWorkItemConfig();
    await component.refreshWorkItemConfig();
    expect(api.fetchWorkItemConfig).toHaveBeenCalledTimes(2);

    api.fetchWorkItemConfig.and.rejectWith(new Error('config error'));
    await component.refreshWorkItemConfig(true);
    expect(component.workItemConfigError).toBe('config error');
    expect(component.dynamicWorkItemFieldConfigs).toEqual([]);
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
    expect(component.testPlansError).toContain('Azure PAT');

    hasPat = true;
    await component.refreshTestPlans(true);
    expect(component.testPlanOptions).toEqual([{ id: 10, name: 'Plan QA' }]);

    api.fetchTestPlans.and.resolveTo({ project: 'Proyecto A', testPlans: [] });
    await component.refreshTestPlans(true);
    expect(component.testPlansMessage).toContain('no devolvio');

    api.fetchTestPlans.and.rejectWith(new Error('plans error'));
    await component.refreshTestPlans(true);
    expect(component.testPlansError).toBe('plans error');
  });

  it('ignores a stale Test Plan response after the project changes', async () => {
    let resolveA!: (value: {
      project: string;
      testPlans: { id: number; name: string }[];
    }) => void;
    let resolveB!: (value: {
      project: string;
      testPlans: { id: number; name: string }[];
    }) => void;
    const responseA = new Promise<{
      project: string;
      testPlans: { id: number; name: string }[];
    }>((resolve) => {
      resolveA = resolve;
    });
    const responseB = new Promise<{
      project: string;
      testPlans: { id: number; name: string }[];
    }>((resolve) => {
      resolveB = resolve;
    });
    api.fetchTestPlans.and.callFake((project: string) =>
      project === 'Proyecto A' ? responseA : responseB,
    );

    component.form.patchValue(
      { azdoProject: 'Proyecto A' },
      { emitEvent: false },
    );
    const oldRequest = component.refreshTestPlans(true);
    component.form.patchValue(
      { azdoProject: 'Proyecto B' },
      { emitEvent: false },
    );
    const currentRequest = component.refreshTestPlans(true);
    resolveB({
      project: 'Proyecto B',
      testPlans: [{ id: 22, name: 'Plan B' }],
    });
    await currentRequest;
    resolveA({
      project: 'Proyecto A',
      testPlans: [{ id: 11, name: 'Plan A' }],
    });
    await oldRequest;

    expect(component.testPlanOptions).toEqual([{ id: 22, name: 'Plan B' }]);
    expect(component.testPlanCatalogState).toBe('ready');
  });

  it('preserves or clears the form according to reset confirmation', async () => {
    component.form.patchValue(
      { need: 'Necesidad en progreso' },
      { emitEvent: false },
    );
    component.prompt = 'prompt generado';
    confirmDialog.confirm.and.resolveTo(false);

    await component.resetTemplate();
    expect(component.form.value.need).toBe('Necesidad en progreso');
    expect(component.prompt).toBe('prompt generado');

    confirmDialog.confirm.and.resolveTo(true);
    await component.resetTemplate();
    expect(component.form.value.need).toBe('');
    expect(component.prompt).toBe('');
    expect(component.jsonOut).toBeNull();
    expect(workspace.setPrompt).toHaveBeenCalledWith('', 'builder');
    expect(toast.info).toHaveBeenCalledWith('Formulario reiniciado.');
  });

  it('persists a pending debounced state without workItem group', () => {
    component.form.patchValue({ need: 'Cambio pendiente' });

    component.ngOnDestroy();

    const persisted = JSON.parse(
      sessionStorage.getItem('work-item.builder.state.v1') ?? '{}',
    );
    expect(persisted.formValues.need).toBe('Cambio pendiente');
    expect(persisted.formValues.testSuite).toEqual({ planId: null });
    expect(persisted.formValues.aiFields).toEqual(
      jasmine.objectContaining({ cantidadTestcases: jasmine.any(Boolean) }),
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        persisted.formValues,
        'testSuite.planId',
      ),
    ).toBeFalse();
    expect(
      Object.prototype.hasOwnProperty.call(
        persisted.formValues,
        'ai.cantidadTestcases',
      ),
    ).toBeFalse();
  });

  it('does not rewrite old state after reset cancels pending save', async () => {
    component.form.patchValue({ need: 'Estado anterior' });
    await component.resetTemplate();

    component.ngOnDestroy();

    expect(sessionStorage.getItem('work-item.builder.state.v1')).toBeNull();
    expect(localStorage.getItem('work-item.builder.state.v1')).toBeNull();
  });

  it('restores persisted state and ignores corrupt storage', () => {
    component.ngOnDestroy();
    sessionStorage.setItem(
      'work-item.builder.state.v1',
      JSON.stringify({
        formValues: {
          need: 'Persistida',
          useTestCases: false,
          tcCount: 4,
          tcState: 'Closed',
          azdoOrg: 'org',
          azdoProject: 'Proyecto A',
          workItemType: 'User Story',
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          workItem: {
            title: '',
            description: '',
            acceptanceCriteria: '',
            priority: 1,
            storyPoints: 3,
            risk: '',
            startDate: '',
            finishDate: '',
            valueArea: '',
            tipoHU: '',
            frenteDeTrabajo: '',
            assignedTo: '',
          },
          dynamicWorkItemFields: { Campo: 'valor' },
          testCases: [],
          testSuite: { planId: 0 },
          aiFields: { cantidadTestcases: false },
        },
        prompt: 'prompt persistido',
        jsonOut: null,
        message: 'mensaje',
      }),
    );
    component = new BuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      promptBuilder,
      router,
    );
    component.ngOnInit();

    expect(component.form.value.need).toBe('Persistida');
    expect(component.prompt).toBe('prompt persistido');
    expect(workspace.setPrompt).not.toHaveBeenCalledWith(
      'prompt persistido',
      'builder',
    );

    component.ngOnDestroy();
    sessionStorage.setItem('work-item.builder.state.v1', '{invalid');
    component = new BuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      promptBuilder,
      router,
    );
    expect(() => component.ngOnInit()).not.toThrow();
  });

  it('ignores dotted work item state after the dynamic fields refactor', async () => {
    component.ngOnDestroy();
    sessionStorage.setItem(
      'work-item.builder.state.v1',
      JSON.stringify({
        formValues: {
          need: 'Legacy',
          useTestCases: true,
          tcCount: 2,
          tcState: 'Ready',
          azdoOrg: 'MiOrganizacionDevOps',
          azdoProject: 'Proyecto A',
          workItemType: 'User Story',
          iterationPath: 'Proyecto A/Iteration/Sprint 1',
          areaPath: 'Proyecto A/Area/Equipo 1',
          'workItem.priority': 2,
          'workItem.storyPoints': 8,
          'workItem.risk': '1 - High',
          'workItem.startDate': '2026-06-01',
          'workItem.finishDate': '2026-06-15',
          'workItem.valueArea': 'Negocio',
          'workItem.tipoHU': 'Funcional',
          'workItem.frenteDeTrabajo': 'QA',
          'workItem.assignedTo': 'legacy@example.com',
          dynamicWorkItemFields: {},
          testCases: [],
          'testSuite.planId': 10,
          'ai.cantidadTestcases': false,
        },
        prompt: '',
        jsonOut: null,
        message: '',
      }),
    );

    component = new BuilderComponent(
      new FormBuilder(),
      azdo,
      api,
      workspace,
      toast,
      confirmDialog,
      aiValidation,
      promptBuilder,
      router,
    );
    component.ngOnInit();
    component.tcStateOptions = ['Ready'];
    component.testPlanOptions = [{ id: 10, name: 'Plan QA' }];
    component.testPlanCatalogState = 'ready';
    component.form.patchValue(
      { testSuite: { planId: 10 } },
      { emitEvent: false },
    );
    await component.refreshWorkItemConfig(true);
    for (const field of component.dynamicWorkItemFieldConfigs.filter(
      (item) => item.required,
    )) {
      component.form
        .get(component.dynamicControlName(field))
        ?.setValue(field.options[0] ?? 1);
    }
    await component.onGenerate();

    expect(component.form.value.testSuite.planId).toBe(10);
    expect(component.jsonOut?.testSuite.planId).toBe(10);
  });
});
