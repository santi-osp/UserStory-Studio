import {
  ComponentFixture,
  fakeAsync,
  flushMicrotasks,
  TestBed,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { UI_TIMINGS } from '../../../config/ui-timings';
import { AzdoFlowContext, AzdoMetadataResult } from '../../../models/types';
import { ApiService } from '../../../services/api.service';
import { AzdoConfigService } from '../../../services/azdo-config.service';
import { ExistingWorkItemSelectorComponent } from './existing-work-item-selector.component';

describe('ExistingWorkItemSelectorComponent', () => {
  let fixture: ComponentFixture<ExistingWorkItemSelectorComponent>;
  let component: ExistingWorkItemSelectorComponent;
  let api: jasmine.SpyObj<ApiService>;
  let config: jasmine.SpyObj<AzdoConfigService>;
  let context: BehaviorSubject<AzdoFlowContext>;
  let metadata: BehaviorSubject<AzdoMetadataResult>;

  const resultItem = {
    id: 321,
    title: 'Gestionar solicitudes',
    state: 'Active',
    areaPath: 'Proyecto A\\Equipo',
    iterationPath: 'Proyecto A\\Sprint 1',
    workItemType: 'User Story',
    displayName: '321 - Gestionar solicitudes',
  };

  beforeEach(async () => {
    context = new BehaviorSubject({
      organization: 'ExampleOrg',
      correlationId: 'cid-1',
    });
    metadata = new BehaviorSubject<AzdoMetadataResult>({
      projects: ['Proyecto A', 'Proyecto B'],
      areaPaths: ['Proyecto A\\Equipo'],
      iterationPaths: ['Proyecto A\\Sprint 1'],
      projectMetadata: [
        {
          project: 'Proyecto A',
          areaPaths: ['Proyecto A\\Equipo'],
          iterationPaths: ['Proyecto A\\Sprint 1'],
        },
      ],
    });
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'fetchAzdoMetadata',
      'searchWorkItems',
    ]);
    api.searchWorkItems.and.resolveTo({
      project: 'Proyecto A',
      count: 1,
      items: [resultItem],
    });
    api.fetchAzdoMetadata.and.resolveTo(metadata.value);
    config = jasmine.createSpyObj<AzdoConfigService>(
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
        metadata$: metadata.asObservable(),
        context$: context.asObservable(),
      },
    );
    config.getMetadataSnapshot.and.callFake(() => metadata.value);
    config.getContextSnapshot.and.callFake(() => context.value);
    config.getConfigSnapshot.and.returnValue({ organization: 'ExampleOrg' });
    config.getOrganization.and.returnValue('ExampleOrg');
    config.hasRuntimeCredential.and.returnValue(true);
    config.setMetadata.and.callFake((value) => metadata.next(value));

    await TestBed.configureTestingModule({
      imports: [ExistingWorkItemSelectorComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AzdoConfigService, useValue: config },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ExistingWorkItemSelectorComponent);
    component = fixture.componentInstance;
    component.projectRequired = true;
    component.selectionRequired = true;
    fixture.detectChanges();
  });

  it('renders accessible project, area, iteration and Work Item filters', () => {
    for (const id of [
      '#existing-work-item-project',
      '#existing-work-item-area',
      '#existing-work-item-iteration',
      '#existing-work-item-search',
    ]) {
      expect(fixture.debugElement.query(By.css(id))).not.toBeNull();
    }
    expect(
      fixture.debugElement.queryAll(By.css('app-required-field-marker')).length,
    ).toBe(2);
    expect(
      fixture.nativeElement
        .querySelector('#existing-work-item-project')
        .getAttribute('aria-required'),
    ).toBe('true');
  });

  it('preserves keyboard escape behavior and exposes busy state', () => {
    component.form.controls.project.setValue('Proyecto A');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '#existing-work-item-search',
    ) as HTMLInputElement;
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('true');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(
      fixture.nativeElement
        .querySelector('.existing-work-item-selector')
        .getAttribute('aria-busy'),
    ).toBe('false');
  });

  it('enables dependent filters only after a project is selected', () => {
    expect(component.form.controls.areaPath.disabled).toBeTrue();
    expect(component.form.controls.iterationPath.disabled).toBeTrue();
    expect(component.form.controls.selectedId.disabled).toBeTrue();
    component.form.controls.project.setValue('Proyecto A');
    expect(component.form.controls.areaPath.enabled).toBeTrue();
    expect(component.areaPathOptions).toEqual(['Proyecto A\\Equipo']);
  });

  it('does not search an empty criterion and validates non-positive IDs', fakeAsync(() => {
    component.form.controls.project.setValue('Proyecto A');
    component.onSearchChange('');
    tick(UI_TIMINGS.workItemSearchDebounceMs + 1);
    expect(api.searchWorkItems).not.toHaveBeenCalled();

    component.onSearchChange('0');
    tick(UI_TIMINGS.workItemSearchDebounceMs + 1);
    expect(api.searchWorkItems).not.toHaveBeenCalled();
    expect(component.criterionError).toContain('mayor que cero');
  }));

  it('searches by ID or title once, renders results and emits typed selection', fakeAsync(() => {
    const emitted = jasmine.createSpy('selection');
    component.selectionChange.subscribe(emitted);
    component.form.controls.project.setValue('Proyecto A');
    component.onSearchChange('Gestionar');
    tick(UI_TIMINGS.workItemSearchDebounceMs + 1);
    flushMicrotasks();
    fixture.detectChanges();

    expect(api.searchWorkItems).toHaveBeenCalledTimes(1);
    expect(api.searchWorkItems).toHaveBeenCalledWith(
      jasmine.objectContaining({
        azdoProject: 'Proyecto A',
        searchText: 'Gestionar',
      }),
    );
    expect(component.workItemOptions.length).toBe(1);

    component.form.controls.selectedId.setValue(321);
    expect(emitted).toHaveBeenCalledWith(
      jasmine.objectContaining({
        summary: jasmine.objectContaining({ id: 321, type: 'User Story' }),
      }),
    );
    expect(component.selectedWorkItem?.relations).toEqual([]);
  }));

  it('filters results by consumer-provided allowed types', fakeAsync(() => {
    component.allowedTypes = ['Bug'];
    component.form.controls.project.setValue('Proyecto A');
    component.onSearchChange('321');
    tick(UI_TIMINGS.workItemSearchDebounceMs + 1);
    flushMicrotasks();
    expect(component.workItemOptions).toEqual([]);
    expect(component.hasSearched).toBeTrue();
  }));

  it('shows empty, loading and recoverable error states without losing filters', fakeAsync(() => {
    let rejectSearch!: (reason: Error) => void;
    api.searchWorkItems.and.returnValue(
      new Promise((_resolve, reject) => (rejectSearch = reject)),
    );
    component.form.controls.project.setValue('Proyecto A');
    component.onSearchChange('solicitud');
    tick(UI_TIMINGS.workItemSearchDebounceMs + 1);
    expect(component.isSearching).toBeTrue();
    rejectSearch(new Error('Azure temporalmente no disponible'));
    flushMicrotasks();
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('.ui-feedback-error')),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Reintentar búsqueda');
    expect(component.form.controls.project.value).toBe('Proyecto A');

    api.searchWorkItems.and.resolveTo({
      project: 'Proyecto A',
      count: 0,
      items: [],
    });
    component.retrySearch();
    flushMicrotasks();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'No se encontraron Work Items con los filtros seleccionados.',
    );
  }));

  it('ignores stale responses after criteria or runtime context changes', fakeAsync(() => {
    let resolveFirst!: (value: Awaited<ReturnType<ApiService['searchWorkItems']>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<ApiService['searchWorkItems']>>) => void;
    api.searchWorkItems.and.returnValues(
      new Promise<Awaited<ReturnType<ApiService['searchWorkItems']>>>(
        (resolve) => (resolveFirst = resolve),
      ),
      new Promise<Awaited<ReturnType<ApiService['searchWorkItems']>>>(
        (resolve) => (resolveSecond = resolve),
      ),
    );
    component.form.controls.project.setValue('Proyecto A');
    component.onSearchChange('primera');
    tick(UI_TIMINGS.workItemSearchDebounceMs + 1);
    component.onSearchChange('segunda');
    tick(UI_TIMINGS.workItemSearchDebounceMs + 1);

    resolveFirst({ project: 'Proyecto A', count: 1, items: [resultItem] });
    flushMicrotasks();
    expect(component.workItemOptions).toEqual([]);
    resolveSecond({ project: 'Proyecto A', count: 1, items: [resultItem] });
    flushMicrotasks();
    expect(component.workItemOptions.length).toBe(1);

    context.next({ organization: 'OtherOrg', correlationId: 'cid-2' });
    expect(component.workItemOptions).toEqual([]);
    expect(component.selectedWorkItem).toBeNull();
  }));

  it('clears selection explicitly and invalidates pending work on destroy', fakeAsync(() => {
    const emitted = jasmine.createSpy('selection');
    component.selectionChange.subscribe(emitted);
    component.initialSelection = {
      summary: {
        id: 321,
        type: 'User Story',
        title: resultItem.title,
        state: resultItem.state,
        areaPath: resultItem.areaPath,
        iterationPath: resultItem.iterationPath,
        parentId: null,
        displayName: resultItem.displayName,
      },
      description: null,
      acceptanceCriteria: null,
      relations: [],
      metadata: {},
    };
    component.clearSelection();
    expect(emitted).toHaveBeenCalledWith(null);

    component.form.controls.project.setValue('Proyecto A');
    component.onSearchChange('321');
    component.ngOnDestroy();
    tick(UI_TIMINGS.workItemSearchDebounceMs + 1);
    expect(api.searchWorkItems).not.toHaveBeenCalled();
  }));
});
