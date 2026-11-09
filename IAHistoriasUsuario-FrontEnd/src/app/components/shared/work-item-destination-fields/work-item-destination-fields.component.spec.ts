import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { WorkItemDestinationFieldsComponent } from './work-item-destination-fields.component';
import { WorkItemDestinationControls } from '../../../models/work-item-generation-form';

describe('WorkItemDestinationFieldsComponent', () => {
  let fixture: ComponentFixture<WorkItemDestinationFieldsComponent>;
  let controls: WorkItemDestinationControls;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkItemDestinationFieldsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WorkItemDestinationFieldsComponent);
    controls = {
      project: new FormControl<string | null>(''),
      areaPath: new FormControl<string | null>(''),
      iterationPath: new FormControl<string | null>(''),
      workItemType: new FormControl<string | null>('User Story'),
    };
    Object.assign(fixture.componentInstance, {
      controls,
      projectOptions: [{ value: 'Proyecto A', label: 'Proyecto A' }],
      areaPathOptions: [{ value: 'Proyecto A\\Equipo', label: 'Equipo' }],
      iterationPathOptions: [
        { value: 'Proyecto A\\Sprint 1', label: 'Sprint 1' },
      ],
    });
    fixture.detectChanges();
  });

  it('renders the three destination fields with visible labels and no organization or PAT input', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Proyecto Azure DevOps');
    expect(text).toContain('Iteraci');
    expect(text).toContain('rea del proyecto');
    expect(text).toContain(
      'El proyecto determina las áreas, iteraciones, campos y Test Plans disponibles.',
    );
    expect(text).not.toContain('PAT');
    expect(text).not.toContain('Organizaci');
    expect(
      fixture.debugElement.queryAll(By.directive(SearchableSelectComponent))
        .length,
    ).toBe(3);
  });

  it('associates validation messages and disables dependent fields while loading', () => {
    fixture.componentInstance.projectError =
      'Selecciona un proyecto de Azure DevOps.';
    fixture.componentInstance.loading = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Selecciona un proyecto',
    );
    expect(
      (fixture.nativeElement.querySelector('fieldset') as HTMLFieldSetElement)
        .disabled,
    ).toBeTrue();
  });

  it('renders project, area and iteration catalog options', () => {
    const selects = fixture.debugElement.queryAll(
      By.directive(SearchableSelectComponent),
    );
    const byId = new Map(
      selects.map((item) => [
        item.componentInstance.inputId,
        item.componentInstance as SearchableSelectComponent,
      ]),
    );
    expect(byId.get('work-item-azdo-project')?.options[0].value).toBe(
      'Proyecto A',
    );
    expect(byId.get('work-item-area-path')?.options[0].label).toBe('Equipo');
    expect(byId.get('work-item-iteration-path')?.options[0].label).toBe(
      'Sprint 1',
    );
  });

  it('uses unique accessible ids and required metadata', () => {
    const selects = fixture.debugElement.queryAll(
      By.directive(SearchableSelectComponent),
    );
    expect(
      new Set(selects.map((item) => item.componentInstance.inputId)).size,
    ).toBe(3);
    expect(selects.every((item) => item.componentInstance.required)).toBeTrue();
  });

  it('shows independent validation messages', () => {
    Object.assign(fixture.componentInstance, {
      projectError: 'Proyecto requerido',
      areaError: 'Area requerida',
      iterationError: 'Iteracion requerida',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Proyecto requerido');
    expect(fixture.nativeElement.textContent).toContain('Area requerida');
    expect(fixture.nativeElement.textContent).toContain('Iteracion requerida');
  });

  it('keeps the supplied controls as the single source of truth', () => {
    controls.project.setValue('Proyecto B');
    controls.areaPath.setValue(null);
    controls.iterationPath.setValue(null);
    expect(fixture.componentInstance.controls.project.value).toBe('Proyecto B');
    expect(fixture.componentInstance.controls.areaPath.value).toBeNull();
    expect(fixture.componentInstance.controls.iterationPath.value).toBeNull();
  });

  it('supports optional required markers', () => {
    Object.assign(fixture.componentInstance, {
      projectRequired: false,
      areaRequired: false,
      iterationRequired: false,
    });
    fixture.detectChanges();
    const selects = fixture.debugElement.queryAll(
      By.directive(SearchableSelectComponent),
    );
    expect(
      selects.every((item) => !item.componentInstance.required),
    ).toBeTrue();
  });

  it('forwards loading to every catalog without exposing credentials', () => {
    fixture.componentInstance.loading = true;
    fixture.detectChanges();
    expect(
      fixture.debugElement
        .queryAll(By.directive(SearchableSelectComponent))
        .every((item) => item.componentInstance.loading),
    ).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('input[type="password"]'),
    ).toBeNull();
  });

  it('renders empty catalogs without fabricating destination values', () => {
    Object.assign(fixture.componentInstance, {
      projectOptions: [],
      areaPathOptions: [],
      iterationPathOptions: [],
    });
    fixture.detectChanges();
    expect(controls.project.value).toBe('');
    expect(controls.areaPath.value).toBe('');
    expect(controls.iterationPath.value).toBe('');
  });

  it('allows manual destination entry for each searchable field', () => {
    const selects = fixture.debugElement.queryAll(
      By.directive(SearchableSelectComponent),
    );
    expect(
      selects.every((item) => item.componentInstance.allowManualEntry),
    ).toBeTrue();
  });

  it('derives deterministic ids from the caller prefix', () => {
    fixture.componentInstance.idPrefix = 'json';
    fixture.detectChanges();
    expect(fixture.componentInstance.projectId).toBe('json-azdo-project');
    expect(fixture.componentInstance.areaId).toBe('json-area-path');
    expect(fixture.componentInstance.iterationId).toBe('json-iteration-path');
  });

  it('forwards focus to the requested shared searchable control', () => {
    const select = fixture.debugElement.queryAll(
      By.directive(SearchableSelectComponent),
    )[0].componentInstance as SearchableSelectComponent;
    expect(() => select.focus()).not.toThrow();
  });
});
