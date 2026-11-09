import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TestCaseEditorComponent } from './test-case-editor.component';

describe('TestCaseEditorComponent', () => {
  let fixture: ComponentFixture<TestCaseEditorComponent>;
  let component: TestCaseEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestCaseEditorComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(TestCaseEditorComponent);
    component = fixture.componentInstance;
    component.position = 0;
    component.allowedStates = ['Design', 'Ready'];
    component.testCase = {
      title: '',
      state: '',
      steps: [{ action: '', expected: '' }],
    };
    fixture.detectChanges();
  });

  it('hides required markers when Preview requests it', () => {
    component.showRequiredIndicators = false;
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('app-required-field-marker')),
    ).toBeNull();
  });

  it('retains native and ARIA required semantics when markers are hidden', () => {
    component.showRequiredIndicators = false;
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('[required]')).length).toBe(4);
    expect(
      fixture.debugElement.queryAll(By.css('[aria-required="true"]')).length,
    ).toBe(4);
  });

  it('shows title, state, action and expected errors after preflight', () => {
    component.showValidation = true;
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('El título es obligatorio.');
    expect(content).toContain('El estado es obligatorio.');
    expect(content).toContain('La acción es obligatoria.');
    expect(content).toContain('El resultado esperado es obligatorio.');
  });

  it('links every invalid field to its inline message', () => {
    component.showValidation = true;
    fixture.detectChanges();
    const invalid = fixture.debugElement.queryAll(
      By.css('[aria-invalid="true"]'),
    );
    expect(
      invalid.every((control) => !!control.attributes['aria-describedby']),
    ).toBeTrue();
  });

  it('validates state strictly against metadata options', () => {
    component.form.controls.state.setValue('Unknown');
    expect(component.form.controls.state.hasError('invalidState')).toBeTrue();
  });
});
