import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormValidationIssue } from '../models/form-validation';
import { FormValidationOrchestratorService } from './form-validation-orchestrator.service';

describe('FormValidationOrchestratorService', () => {
  let service: FormValidationOrchestratorService;
  const issue = (
    overrides: Partial<FormValidationIssue> = {},
  ): FormValidationIssue => ({
    key: 'project',
    type: 'required',
    message: 'Selecciona un proyecto.',
    controlId: 'project-control',
    order: 20,
    section: 'azure',
    source: 'ai-preflight',
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FormValidationOrchestratorService);
  });

  it('maps ordinary issues by functional key', () => {
    expect(service.mapByIdentity([issue()])).toEqual({
      project: 'Selecciona un proyecto.',
    });
  });

  it('maps dynamic issues by exact referenceName', () => {
    expect(
      service.mapByIdentity([
        issue({ key: 'dynamic', referenceName: 'Custom.ValueArea' }),
      ]),
    ).toEqual({ 'dynamic:Custom.ValueArea': 'Selecciona un proyecto.' });
  });

  it('groups issues by section', () => {
    expect(
      service.groupBySection([issue(), issue({ section: 'content' })])['azure']
        .length,
    ).toBe(1);
  });

  it('sorts each grouped section by visual order', () => {
    const grouped = service.groupBySection([
      issue({ order: 30 }),
      issue({ key: 'area', order: 10 }),
    ]);
    expect(grouped['azure'].map((item) => item.order)).toEqual([10, 30]);
  });

  it('marks every form control as touched on an attempted submit', () => {
    const form = new FormGroup({
      name: new FormControl('', Validators.required),
    });
    service.markAttempt(form);
    expect(form.controls.name.touched).toBeTrue();
  });

  it('clears only the corrected ordinary field', () => {
    expect(
      service
        .clearIssue([issue(), issue({ key: 'area' })], 'project')
        .map((item) => item.key),
    ).toEqual(['area']);
  });

  it('clears only the matching dynamic referenceName', () => {
    const issues = [
      issue({ key: 'dynamic', referenceName: 'A' }),
      issue({ key: 'dynamic', referenceName: 'B' }),
    ];
    expect(service.clearIssue(issues, 'dynamic', 'A')[0].referenceName).toBe(
      'B',
    );
  });

  it('focuses the first issue in actual visual order', fakeAsync(() => {
    const element = document.createElement('input');
    element.id = 'first-control';
    document.body.appendChild(element);
    const scroll = spyOn(element, 'scrollIntoView');
    const focus = spyOn(element, 'focus');
    service.focusFirst([
      issue({ controlId: 'later', order: 30 }),
      issue({ controlId: element.id, order: 10 }),
    ]);
    tick(16);
    expect(scroll).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    element.remove();
  }));

  it('does nothing when there are no issues', () => {
    expect(() => service.focusFirst([])).not.toThrow();
  });

  it('does not throw when the exact control id is no longer rendered', fakeAsync(() => {
    service.focusFirst([issue({ controlId: 'missing-control' })]);
    tick(16);
    expect().nothing();
  }));
});
