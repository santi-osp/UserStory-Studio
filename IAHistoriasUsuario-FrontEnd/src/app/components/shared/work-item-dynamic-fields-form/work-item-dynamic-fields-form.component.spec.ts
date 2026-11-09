import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { WorkItemFieldConfig } from '../../../models/types';
import { dynamicWorkItemControlName } from '../../../utils/work-item-dynamic-fields';
import { WorkItemDynamicFieldsFormComponent } from './work-item-dynamic-fields-form.component';

describe('WorkItemDynamicFieldsFormComponent', () => {
  let fixture: ComponentFixture<WorkItemDynamicFieldsFormComponent>;
  const field: WorkItemFieldConfig = {
    name: 'Value Area',
    referenceName: 'Microsoft.VSTS.Common.ValueArea',
    label: 'Value Area',
    type: 'string',
    required: true,
    control: 'select',
    options: ['Negocio'],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkItemDynamicFieldsFormComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WorkItemDynamicFieldsFormComponent);
    const controlName = dynamicWorkItemControlName(field, 'dynamic');
    fixture.componentInstance.formGroup = new FormGroup({
      [controlName]: new FormControl(''),
    });
    fixture.componentInstance.fields = [field];
    fixture.componentInstance.controlPrefix = 'dynamic';
  });

  it('renders one accessible inline Value Area error with recovery guidance', () => {
    fixture.componentInstance.validationMessages = {
      'Microsoft.VSTS.Common.ValueArea': 'Completa Value Area.',
    };
    fixture.detectChanges();

    const error = fixture.debugElement.query(
      By.css('.field-validation-message'),
    );
    const input = fixture.debugElement.query(By.css('[aria-invalid="true"]'));
    expect(error.attributes['role']).toBe('alert');
    expect(error.nativeElement.textContent).toContain('Completa Value Area.');
    expect(input.attributes['aria-describedby']).toBe(error.attributes['id']);
    expect(fixture.debugElement.queryAll(By.css('[role="alert"]')).length).toBe(
      1,
    );
  });

  it('identifies messages only by exact referenceName', () => {
    fixture.componentInstance.validationMessages = {
      'Value Area': 'No debe mostrarse',
    };
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[role="alert"]'))).toBeNull();
  });

  it('can hide only the visual required marker while retaining required semantics', () => {
    fixture.componentInstance.showRequiredIndicator = false;
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('app-required-field-marker')),
    ).toBeNull();
    expect(
      fixture.debugElement.query(By.css('[aria-required="true"]')),
    ).not.toBeNull();
  });

  it('does not announce an error before the consumer reports validation', () => {
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[role="alert"]'))).toBeNull();
    expect(
      fixture.debugElement.query(By.css('[aria-invalid="true"]')),
    ).toBeNull();
  });
});
