import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { BROWSER_STORAGE_KEYS } from '../../config/browser-storage-keys';
import { ExistingWorkItemSelection } from '../../models/existing-work-item-selector';
import {
  AzdoFlowContext,
  AzdoMetadataResult,
  EvaluateWorkItemResponse,
} from '../../models/types';
import { ApiService } from '../../services/api.service';
import { AzdoConfigService } from '../../services/azdo-config.service';
import { WorkItemEvaluationComponent } from './work-item-evaluation.component';

describe('WorkItemEvaluationComponent', () => {
  let fixture: ComponentFixture<WorkItemEvaluationComponent>;
  let component: WorkItemEvaluationComponent;
  let apiService: jasmine.SpyObj<ApiService>;
  let configService: jasmine.SpyObj<AzdoConfigService>;
  let contextSubject: BehaviorSubject<AzdoFlowContext>;
  let metadataSubject: BehaviorSubject<AzdoMetadataResult>;

  const metadata: AzdoMetadataResult = {
    projects: ['Proyecto A', 'Proyecto B'],
    areaPaths: [],
    iterationPaths: [],
    projectMetadata: [],
  };
  const selection: ExistingWorkItemSelection = {
    summary: {
      id: 321,
      type: 'User Story',
      title: 'Gestionar solicitudes',
      state: 'Active',
      areaPath: 'Proyecto A\\Area',
      iterationPath: 'Proyecto A\\Sprint 1',
      parentId: null,
      displayName: '321 - Gestionar solicitudes',
    },
    description: null,
    acceptanceCriteria: null,
    relations: [],
    metadata: { source: 'searchWorkItems' },
  };
  const result: EvaluateWorkItemResponse = {
    workItemId: 321,
    workItemUrl: 'https://dev.azure.com/example/_workitems/edit/321',
    title: 'Gestionar solicitudes',
    workItemType: 'User Story',
    state: 'Active',
    model: 'evaluation-model',
    evaluation: {
      summary: 'La historia requiere refinamiento.',
      qualityScore: 3,
      qualityLevel: 'Media',
      readiness: 'Parcial',
      mainFindings: ['Falta precisar el actor.'],
      risks: ['Puede generar interpretaciones distintas.'],
      ambiguities: [],
      missingInformation: [],
      acceptanceCriteriaFindings: [],
      edgeCases: ['Validar solicitudes duplicadas.'],
      dependencies: ['Servicio disponible.'],
      dataValidations: ['El identificador debe ser obligatorio.'],
      securityConsiderations: ['Confirmar permisos.'],
      observabilityConsiderations: ['Registrar eventos.'],
      recommendations: ['Definir escenarios alternos.'],
      refinementQuestions: [],
      suggestedAcceptanceCriteria: ['La solicitud queda registrada.'],
      improvedVersion: {
        suggestedTitle: 'Registrar solicitudes',
        suggestedDescription: 'Como usuario necesito registrar solicitudes.',
        suggestedAcceptanceCriteria: ['La solicitud debe quedar registrada.'],
      },
      refinementPriority: 'Alta',
      conclusion: 'Debe refinarse antes de desarrollo.',
    },
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    contextSubject = new BehaviorSubject<AzdoFlowContext>({
      organization: 'MiOrganizacionDevOps',
      correlationId: 'correlation-id',
    });
    metadataSubject = new BehaviorSubject(metadata);
    apiService = jasmine.createSpyObj<ApiService>('ApiService', [
      'fetchAzdoMetadata',
      'searchWorkItems',
      'evaluateWorkItem',
    ]);
    apiService.searchWorkItems.and.resolveTo({
      project: 'Proyecto A',
      count: 0,
      items: [],
    });
    configService = jasmine.createSpyObj<AzdoConfigService>(
      'AzdoConfigService',
      [
        'getMetadataSnapshot',
        'getContextSnapshot',
        'getConfigSnapshot',
        'getOrganization',
        'hasRuntimeCredential',
        'setMetadata',
      ],
      {
        metadata$: metadataSubject.asObservable(),
        context$: contextSubject.asObservable(),
      },
    );
    configService.getMetadataSnapshot.and.returnValue(metadata);
    configService.getContextSnapshot.and.callFake(() => contextSubject.value);
    configService.getConfigSnapshot.and.returnValue({
      organization: 'MiOrganizacionDevOps',
    });
    configService.getOrganization.and.returnValue('MiOrganizacionDevOps');
    configService.hasRuntimeCredential.and.returnValue(true);

    await TestBed.configureTestingModule({
      imports: [WorkItemEvaluationComponent],
      providers: [
        { provide: ApiService, useValue: apiService },
        { provide: AzdoConfigService, useValue: configService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(WorkItemEvaluationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('uses the shared selector and does not retain a legacy search form', () => {
    expect(
      fixture.debugElement.query(By.css('app-existing-work-item-selector')),
    ).not.toBeNull();
    expect(fixture.debugElement.query(By.css('form.evaluation-form'))).toBeNull();
    expect(apiService.searchWorkItems).not.toHaveBeenCalled();
  });

  it('preserves filters and typed selection as business state', () => {
    component.onFiltersChange({
      project: 'Proyecto A',
      areaPath: 'Proyecto A\\Area',
      iterationPath: 'Proyecto A\\Sprint 1',
      criterion: '321',
      searchMode: 'id-or-title',
      allowedTypes: [],
    });
    component.onSelectionChange(selection);

    expect(component.selectedWorkItemId).toBe(321);
    expect(component.canEvaluate).toBeTrue();
    expect(
      sessionStorage.getItem(BROWSER_STORAGE_KEYS.workItemEvaluationState),
    ).not.toContain('azurePat');
    expect(
      localStorage.getItem(BROWSER_STORAGE_KEYS.workItemEvaluationState),
    ).toBeNull();
  });

  it('calls the unchanged evaluation endpoint contract and renders result', async () => {
    apiService.evaluateWorkItem.and.resolveTo(result);
    component.onFiltersChange({
      project: 'Proyecto A',
      areaPath: '',
      iterationPath: '',
      criterion: '321',
      searchMode: 'id-or-title',
      allowedTypes: [],
    });
    component.onSelectionChange(selection);

    await component.evaluate();
    fixture.detectChanges();

    expect(apiService.evaluateWorkItem).toHaveBeenCalledWith({
      workItemId: 321,
      azdoProject: 'Proyecto A',
      prompt: jasmine.any(String),
      systemPrompt: jasmine.any(String),
      azdoContext: { organization: 'MiOrganizacionDevOps' },
    });
    expect(fixture.debugElement.query(By.css('.evaluation-result-card'))).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Gestionar solicitudes');
    expect(component.qualityScorePercent).toBe(60);
  });

  it('blocks duplicate evaluation and exposes loading state', async () => {
    let resolve!: (value: EvaluateWorkItemResponse) => void;
    apiService.evaluateWorkItem.and.returnValue(
      new Promise((value) => (resolve = value)),
    );
    component.selectorFilters = {
      project: 'Proyecto A',
      areaPath: '',
      iterationPath: '',
      criterion: '321',
      searchMode: 'id-or-title',
      allowedTypes: [],
    };
    component.selectedWorkItem = selection;
    const pending = component.evaluate();
    fixture.detectChanges();
    expect(component.isEvaluating).toBeTrue();
    expect(component.canEvaluate).toBeFalse();
    resolve(result);
    await pending;
  });

  it('keeps backend errors and required-context validation behavior', async () => {
    await component.evaluate();
    expect(apiService.evaluateWorkItem).not.toHaveBeenCalled();
    expect(component.error).toContain('proyecto Azure DevOps');

    component.selectorFilters = {
      project: 'Proyecto A',
      areaPath: '',
      iterationPath: '',
      criterion: '321',
      searchMode: 'id-or-title',
      allowedTypes: [],
    };
    component.selectedWorkItem = selection;
    apiService.evaluateWorkItem.and.rejectWith(new Error('Error del backend.'));
    await component.evaluate();
    expect(component.error).toBe('Error del backend.');
  });
});
