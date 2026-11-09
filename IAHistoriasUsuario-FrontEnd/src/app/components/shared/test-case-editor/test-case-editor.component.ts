import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { TcFields, TcStep } from '../../../models/types';
import { RequiredFieldMarkerComponent } from '../ui/required-field-marker/required-field-marker.component';

type TestCaseStepForm = FormGroup<{
  action: FormControl<string>;
  expected: FormControl<string>;
}>;

type TestCaseForm = FormGroup<{
  title: FormControl<string>;
  state: FormControl<string>;
  steps: FormArray<TestCaseStepForm>;
}>;

export interface TestCaseEditorChange {
  testCase: TcFields;
  kind: 'field' | 'step-added' | 'step-removed';
}

function nonBlankValidator(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim() ? null : { required: true };
}

@Component({
  selector: 'app-test-case-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RequiredFieldMarkerComponent],
  templateUrl: './test-case-editor.component.html',
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
    `,
  ],
})
export class TestCaseEditorComponent implements OnDestroy {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly stateInMetadataValidator: ValidatorFn = (control) => {
    const state = String(control.value ?? '').trim();
    return !state || this.allowedStates.includes(state)
      ? null
      : { invalidState: true };
  };
  private readonly formChanges: Subscription;
  private syncingInput = false;
  private isDisabled = false;
  private metadataStates: string[] = [];

  @Input({ required: true }) set testCase(value: TcFields) {
    if (!value || this.sameTestCase(value, this.form.getRawValue())) {
      return;
    }

    this.syncForm(value);
  }

  @Input({ required: true }) position = 0;
  @Input() showValidation = false;
  @Input() showRequiredIndicators = true;

  @Input({ required: true }) set allowedStates(value: string[]) {
    this.metadataStates = [
      ...new Set(
        (value ?? []).map((state) => String(state).trim()).filter(Boolean),
      ),
    ];
    this.form.controls.state.updateValueAndValidity({ emitEvent: false });
  }

  get allowedStates(): string[] {
    return this.metadataStates;
  }

  @Input() set disabled(value: boolean) {
    this.isDisabled = value;
    if (value) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
  }

  get disabled(): boolean {
    return this.isDisabled;
  }

  @Output() readonly changed = new EventEmitter<TestCaseEditorChange>();
  @Output() readonly deleteRequested = new EventEmitter<void>();

  readonly form: TestCaseForm = this.formBuilder.group({
    title: this.formBuilder.control('', nonBlankValidator),
    state: this.formBuilder.control('', [
      nonBlankValidator,
      this.stateInMetadataValidator,
    ]),
    steps: this.formBuilder.array<TestCaseStepForm>(
      [],
      [Validators.required, Validators.minLength(1)],
    ),
  });

  constructor() {
    this.formChanges = this.form.valueChanges.subscribe(() => {
      if (!this.syncingInput) {
        this.emitChange('field');
      }
    });
  }

  ngOnDestroy(): void {
    this.formChanges.unsubscribe();
  }

  get steps(): FormArray<TestCaseStepForm> {
    return this.form.controls.steps;
  }

  addStep(): void {
    if (this.disabled) {
      return;
    }

    this.steps.push(this.createStepForm(), { emitEvent: false });
    this.form.markAsDirty();
    this.emitChange('step-added');
  }

  removeStep(stepIndex: number): void {
    if (
      this.disabled ||
      this.steps.length <= 1 ||
      stepIndex < 0 ||
      stepIndex >= this.steps.length
    ) {
      return;
    }

    this.steps.removeAt(stepIndex, { emitEvent: false });
    this.form.markAsDirty();
    this.emitChange('step-removed');
  }

  requestDelete(): void {
    if (!this.disabled) {
      this.deleteRequested.emit();
    }
  }

  isInvalid(control: AbstractControl): boolean {
    return (
      control.invalid &&
      (this.showValidation || control.dirty || control.touched)
    );
  }

  private syncForm(testCase: TcFields): void {
    this.syncingInput = true;
    this.form.controls.title.setValue(String(testCase.title ?? ''), {
      emitEvent: false,
    });
    this.form.controls.state.setValue(String(testCase.state ?? ''), {
      emitEvent: false,
    });
    this.steps.clear({ emitEvent: false });

    const steps =
      Array.isArray(testCase.steps) && testCase.steps.length > 0
        ? testCase.steps
        : [{ action: '', expected: '' }];
    steps.forEach((step) =>
      this.steps.push(this.createStepForm(step), { emitEvent: false }),
    );
    this.form.updateValueAndValidity({ emitEvent: false });

    if (this.disabled) {
      this.form.disable({ emitEvent: false });
    }
    this.syncingInput = false;
  }

  private createStepForm(
    step: TcStep = { action: '', expected: '' },
  ): TestCaseStepForm {
    return this.formBuilder.group({
      action: this.formBuilder.control(
        String(step.action ?? ''),
        nonBlankValidator,
      ),
      expected: this.formBuilder.control(
        String(step.expected ?? ''),
        nonBlankValidator,
      ),
    });
  }

  private emitChange(kind: TestCaseEditorChange['kind']): void {
    const value = this.form.getRawValue();
    this.changed.emit({
      kind,
      testCase: {
        title: value.title,
        state: value.state,
        steps: value.steps.map((step) => ({
          action: step.action,
          expected: step.expected,
        })),
      },
    });
  }

  private sameTestCase(left: TcFields, right: TcFields): boolean {
    return (
      left.title === right.title &&
      left.state === right.state &&
      left.steps.length === right.steps.length &&
      left.steps.every(
        (step, index) =>
          step.action === right.steps[index]?.action &&
          step.expected === right.steps[index]?.expected,
      )
    );
  }
}
