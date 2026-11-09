import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  RefinableWorkItemField,
  TcFields,
  TestCaseRefinementMode,
  TestCaseRefinementSelection,
} from '../../../models/types';
import { REFINEMENT_FIELD_LABELS } from '../../../utils/work-item-refinement';
import { RequiredFieldMarkerComponent } from '../ui/required-field-marker/required-field-marker.component';

export type WorkItemRefinementDialogSubmit =
  | {
      scope: 'content';
      selectedFields: RefinableWorkItemField[];
      instructions: string;
    }
  | {
      scope: 'testCases';
      mode: TestCaseRefinementMode;
      selectedTestCases: TestCaseRefinementSelection[];
      instructions: string;
    };

const MAX_INSTRUCTIONS_LENGTH = 2000;

function nonBlankValidator(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim() ? null : { required: true };
}

@Component({
  selector: 'app-work-item-refinement-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RequiredFieldMarkerComponent],
  templateUrl: './work-item-refinement-dialog.component.html',
})
export class WorkItemRefinementDialogComponent
  implements AfterViewInit, OnDestroy
{
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly returnFocusElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  private availableFieldKeys: RefinableWorkItemField[] = [];
  private testCaseItems: TcFields[] = [];
  private loadingState = false;
  private preparingState = false;
  private preparationErrorState = '';
  private readonly selectedTestCaseRefs = new Set<string>();

  @ViewChild('dialog') private dialogElement?: ElementRef<HTMLElement>;
  @ViewChild('initialFocus')
  private initialFocusElement?: ElementRef<HTMLButtonElement>;

  readonly maxInstructionsLength = MAX_INSTRUCTIONS_LENGTH;
  readonly fieldLabels = REFINEMENT_FIELD_LABELS;
  readonly contentSuggestions = [
    'Mas tecnico.',
    'Agregar mayor detalle.',
    'Mejorar criterios verificables.',
    'Eliminar ambiguedades.',
    'Resumir contenido.',
  ];
  readonly testCaseSuggestions = [
    'Hacer los pasos mas concretos.',
    'Mejorar resultados esperados.',
    'Eliminar ambiguedades.',
    'Cubrir el flujo principal.',
    'Reducir pasos redundantes.',
  ];

  readonly form = this.formBuilder.group({
    scope: this.formBuilder.control<'content' | 'testCases'>('content'),
    title: this.formBuilder.control(false),
    description: this.formBuilder.control(false),
    acceptanceCriteria: this.formBuilder.control(false),
    contentInstructions: this.formBuilder.control('', [
      nonBlankValidator,
      Validators.maxLength(MAX_INSTRUCTIONS_LENGTH),
    ]),
    testCaseMode: this.formBuilder.control<TestCaseRefinementMode>('improve'),
    testCaseInstructions: this.formBuilder.control('', [
      nonBlankValidator,
      Validators.maxLength(MAX_INSTRUCTIONS_LENGTH),
    ]),
    search: this.formBuilder.control(''),
  });

  @Input() set loading(value: boolean) {
    this.loadingState = value;
    this.updateFormDisabledState();
  }
  get loading(): boolean {
    return this.loadingState;
  }

  @Input() set preparing(value: boolean) {
    this.preparingState = value;
    this.updateFormDisabledState();
  }
  get preparing(): boolean {
    return this.preparingState;
  }

  @Input() set preparationError(value: string) {
    this.preparationErrorState = value ?? '';
    this.updateFormDisabledState();
  }
  get preparationError(): string {
    return this.preparationErrorState;
  }

  @Input() error = '';
  @Input() fallbackAvailable = false;
  @Input() usingFallback = false;
  @Input({ required: true }) set availableFields(
    value: RefinableWorkItemField[],
  ) {
    this.availableFieldKeys = [...new Set(value ?? [])];
    (
      ['title', 'description', 'acceptanceCriteria'] as RefinableWorkItemField[]
    ).forEach((field) => {
      this.form.controls[field].setValue(
        this.availableFieldKeys.includes(field),
        { emitEvent: false },
      );
    });
  }
  get availableFields(): RefinableWorkItemField[] {
    return this.availableFieldKeys;
  }

  @Input() set testCases(value: TcFields[]) {
    this.testCaseItems = value ?? [];
    if (
      this.testCaseItems.length === 0 &&
      this.form.controls.scope.value === 'testCases'
    ) {
      this.form.controls.scope.setValue('content');
    }
    for (const ref of [...this.selectedTestCaseRefs]) {
      if (!this.testCaseItems[this.positionFromRef(ref)])
        this.selectedTestCaseRefs.delete(ref);
    }
  }
  get testCases(): TcFields[] {
    return this.testCaseItems;
  }

  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly submitted =
    new EventEmitter<WorkItemRefinementDialogSubmit>();
  @Output() readonly retryRequested = new EventEmitter<void>();
  @Output() readonly fallbackRequested = new EventEmitter<void>();

  get scope(): 'content' | 'testCases' {
    return this.form.controls.scope.value;
  }
  get selectedTestCaseCount(): number {
    return this.selectedTestCaseRefs.size;
  }
  get filteredTestCases(): {
    testCase: TcFields;
    position: number;
    ref: string;
  }[] {
    const query = this.form.controls.search.value.trim().toLocaleLowerCase();
    return this.testCases
      .map((testCase, position) => ({
        testCase,
        position,
        ref: this.refFor(position),
      }))
      .filter(
        (item) =>
          !query ||
          String(item.testCase.title ?? '')
            .toLocaleLowerCase()
            .includes(query) ||
          `tc ${item.position + 1}`.includes(query),
      );
  }
  get currentInstructionsLength(): number {
    return this.instructionsControl.value.length;
  }
  get canSubmit(): boolean {
    if (this.isFormBlocked) return false;
    if (this.scope === 'content') {
      return (
        this.availableFields.some((field) => this.form.controls[field].value) &&
        this.form.controls.contentInstructions.valid
      );
    }
    return (
      this.selectedTestCaseCount > 0 &&
      this.form.controls.testCaseInstructions.valid
    );
  }
  get contextualSummary(): string {
    if (this.scope === 'content') {
      const count = this.availableFields.filter(
        (field) => this.form.controls[field].value,
      ).length;
      return `${count} ${count === 1 ? 'campo seleccionado' : 'campos seleccionados'}`;
    }
    const action =
      this.form.controls.testCaseMode.value === 'improve'
        ? 'Mejorar'
        : 'Regenerar';
    return `${action} ${this.selectedTestCaseCount} ${this.selectedTestCaseCount === 1 ? 'Test Case' : 'Test Cases'}`;
  }

  ngAfterViewInit(): void {
    setTimeout(() =>
      (
        this.initialFocusElement?.nativeElement ??
        this.dialogElement?.nativeElement
      )?.focus(),
    );
  }

  ngOnDestroy(): void {
    const target = this.returnFocusElement;
    setTimeout(() => {
      if (target?.isConnected) target.focus();
    });
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.loading) {
      event.preventDefault();
      this.cancelled.emit();
    } else if (event.key === 'Tab') {
      this.keepFocusInsideDialog(event);
    }
  }

  selectScope(scope: 'content' | 'testCases'): void {
    if (
      !this.isFormBlocked &&
      (scope === 'content' || this.testCases.length > 0)
    ) {
      this.form.controls.scope.setValue(scope);
    }
  }

  isSelected(ref: string): boolean {
    return this.selectedTestCaseRefs.has(ref);
  }
  toggleTestCase(ref: string): void {
    if (this.isFormBlocked) return;
    if (this.isSelected(ref)) {
      this.selectedTestCaseRefs.delete(ref);
    } else {
      this.selectedTestCaseRefs.add(ref);
    }
  }
  selectAllFiltered(): void {
    this.filteredTestCases.forEach((item) =>
      this.selectedTestCaseRefs.add(item.ref),
    );
  }
  clearSelection(): void {
    this.selectedTestCaseRefs.clear();
  }

  addSuggestion(suggestion: string): void {
    if (this.isFormBlocked) return;
    const control = this.instructionsControl;
    const current = control.value.trim();
    if (!current.includes(suggestion))
      control.setValue(current ? `${current} ${suggestion}` : suggestion);
    control.markAsDirty();
    control.markAsTouched();
  }

  cancelFromBackdrop(event: MouseEvent): void {
    if (!this.loading && event.target === event.currentTarget)
      this.cancelled.emit();
  }
  cancel(): void {
    if (!this.loading) this.cancelled.emit();
  }
  retry(): void {
    if (!this.loading && !this.preparing) this.retryRequested.emit();
  }
  continueWithFallback(): void {
    if (!this.loading && !this.preparing && this.fallbackAvailable)
      this.fallbackRequested.emit();
  }

  submit(): void {
    this.instructionsControl.markAsTouched();
    if (!this.canSubmit) return;
    const instructions = this.instructionsControl.value.trim();
    if (this.scope === 'content') {
      this.submitted.emit({
        scope: 'content',
        selectedFields: this.availableFields.filter(
          (field) => this.form.controls[field].value,
        ),
        instructions,
      });
      return;
    }
    const selectedTestCases = [...this.selectedTestCaseRefs]
      .map((ref) => {
        const position = this.positionFromRef(ref);
        const testCase = this.testCases[position];
        return testCase
          ? {
              ref,
              position,
              title: String(testCase.title ?? ''),
              steps: (testCase.steps ?? []).map((step) => ({ ...step })),
            }
          : null;
      })
      .filter((item): item is TestCaseRefinementSelection => item !== null)
      .sort((left, right) => left.position - right.position);
    this.submitted.emit({
      scope: 'testCases',
      mode: this.form.controls.testCaseMode.value,
      selectedTestCases,
      instructions,
    });
  }

  refFor(position: number): string {
    return `tc-${position + 1}`;
  }

  private get instructionsControl() {
    return this.scope === 'content'
      ? this.form.controls.contentInstructions
      : this.form.controls.testCaseInstructions;
  }
  private get isFormBlocked(): boolean {
    return this.loading || this.preparing || !!this.preparationError;
  }
  private positionFromRef(ref: string): number {
    return Number(ref.replace('tc-', '')) - 1;
  }
  private updateFormDisabledState(): void {
    if (this.isFormBlocked) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
  }
  private keepFocusInsideDialog(event: KeyboardEvent): void {
    const dialog = this.dialogElement?.nativeElement;
    if (!dialog) return;
    const elements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (elements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
