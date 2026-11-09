import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { SimpleSelectComponent } from '../simple-select/simple-select.component';
import { TestCaseGenerationSettingsComponent } from './test-case-generation-settings.component';
import { TestCaseGenerationControls } from '../../../models/work-item-generation-form';

describe('TestCaseGenerationSettingsComponent', () => {
  let fixture: ComponentFixture<TestCaseGenerationSettingsComponent>;
  let controls: TestCaseGenerationControls;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestCaseGenerationSettingsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(TestCaseGenerationSettingsComponent);
    controls = {
      enabled: new FormControl<boolean | null>(true),
      quantityMode: new FormControl<'fixed' | 'ai'>('fixed', {
        nonNullable: true,
      }),
      quantity: new FormControl<number | null>(2),
      state: new FormControl<string | null>('Ready'),
      testPlanId: new FormControl<number | null>(null),
    };
    Object.assign(fixture.componentInstance, {
      controls,
      stateOptions: ['Ready', 'Closed'],
      testPlanOptions: [{ value: 10, label: '10 - Plan QA' }],
      catalogState: 'ready',
    });
    fixture.detectChanges();
  });

  it('groups activation, quantity, metadata state and mandatory Test Plan', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Cantidad fija');
    expect(text).toContain('Ready');
    expect(text).toContain('Test Plan asociado');
    const select = fixture.debugElement.query(
      By.directive(SearchableSelectComponent),
    ).componentInstance as SearchableSelectComponent;
    expect(select.clearable).toBeFalse();
    expect(select.required).toBeTrue();
  });

  it('supports AI quantity mode and hides settings when disabled', () => {
    fixture.componentInstance.setAiDecision(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('La IA definir');
    fixture.componentInstance.setEnabled(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no se solicitan');
  });

  it('distinguishes loading, empty and error states and exposes retry', () => {
    fixture.componentInstance.catalogState = 'empty';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay Test Plans');
    fixture.componentInstance.catalogState = 'error';
    fixture.componentInstance.catalogError = 'Error remoto';
    fixture.detectChanges();
    const emit = spyOn(fixture.componentInstance.retryTestPlans, 'emit');
    (
      fixture.nativeElement.querySelector('.btn-muted') as HTMLButtonElement
    ).click();
    expect(emit).toHaveBeenCalled();
  });

  it('refuses activation for an incompatible type', () => {
    controls.enabled.setValue(false);
    fixture.componentInstance.compatible = false;
    fixture.componentInstance.setEnabled(true);
    expect(controls.enabled.value).toBeFalse();
  });

  it('writes explicit fixed and ai quantity modes', () => {
    fixture.componentInstance.setAiDecision(true);
    expect(controls.quantityMode.value).toBe('ai');
    fixture.componentInstance.setAiDecision(false);
    expect(controls.quantityMode.value).toBe('fixed');
  });

  it('normalizes manual quantity to the supported range', () => {
    controls.quantity.setValue(0);
    fixture.componentInstance.normalizeQuantity();
    expect(controls.quantity.value).toBe(1);
    controls.quantity.setValue(99);
    fixture.componentInstance.normalizeQuantity();
    expect(controls.quantity.value).toBe(50);
  });

  it('does not normalize quantity in AI mode', () => {
    controls.quantityMode.setValue('ai');
    controls.quantity.setValue(0);
    fixture.componentInstance.normalizeQuantity();
    expect(controls.quantity.value).toBe(0);
  });

  it('renders state options supplied by metadata including Ready preference', () => {
    const select = fixture.debugElement.query(
      By.directive(SimpleSelectComponent),
    ).componentInstance as SimpleSelectComponent;
    expect(select.normalizedOptions.map((option) => option.value)).toEqual([
      'Ready',
      'Closed',
    ]);
    expect(controls.state.value).toBe('Ready');
  });

  it('supports a metadata fallback without inventing Ready', () => {
    fixture.componentInstance.stateOptions = ['Design'];
    controls.state.setValue('Design');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Design');
    expect(controls.state.value).toBe('Design');
  });

  it('supports an empty state catalog', () => {
    fixture.componentInstance.stateOptions = [];
    fixture.detectChanges();
    expect(fixture.componentInstance.stateOptions).toEqual([]);
  });

  it('shows Test Plan validation only after interaction', () => {
    controls.testPlanId.setErrors({ required: true });
    fixture.detectChanges();
    expect(fixture.componentInstance.showTestPlanError).toBeFalse();
    controls.testPlanId.markAsTouched();
    fixture.detectChanges();
    expect(fixture.componentInstance.showTestPlanError).toBeTrue();
  });

  it('keeps Test Plan non-clearable and accessible', () => {
    const select = fixture.debugElement.query(
      By.directive(SearchableSelectComponent),
    ).componentInstance as SearchableSelectComponent;
    expect(select.clearable).toBeFalse();
    expect(select.required).toBeTrue();
    expect(select.inputId).toContain('test-plan');
  });

  it('marks activation and mode controls dirty and touched', () => {
    fixture.componentInstance.setEnabled(false);
    expect(controls.enabled.dirty).toBeTrue();
    expect(controls.enabled.touched).toBeTrue();
    controls.enabled.setValue(true);
    fixture.componentInstance.setAiDecision(true);
    expect(controls.quantityMode.dirty).toBeTrue();
    expect(controls.quantityMode.touched).toBeTrue();
  });

  it('does not expose a premature Test Plan error while loading', () => {
    fixture.componentInstance.catalogState = 'loading';
    fixture.componentInstance.submitAttempted = true;
    controls.testPlanId.setErrors({ required: true });
    fixture.detectChanges();
    expect(fixture.componentInstance.showTestPlanError).toBeFalse();
  });

  it('uses submit attempt to expose an active invalid Test Plan', () => {
    fixture.componentInstance.submitAttempted = true;
    controls.testPlanId.setErrors({ required: true });
    fixture.detectChanges();
    expect(fixture.componentInstance.testPlanError).toContain(
      'Selecciona un Test Plan',
    );
  });
});
