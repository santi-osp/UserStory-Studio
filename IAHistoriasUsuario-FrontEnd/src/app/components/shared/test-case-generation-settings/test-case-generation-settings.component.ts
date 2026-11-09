import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  CatalogLoadState,
  TestCaseGenerationControls,
} from '../../../models/work-item-generation-form';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../searchable-select/searchable-select.component';
import { SimpleSelectComponent } from '../simple-select/simple-select.component';
import { FeedbackMessageComponent } from '../ui/feedback-message/feedback-message.component';
import { FieldValidationMessageComponent } from '../ui/field-validation-message/field-validation-message.component';
import { RequiredFieldMarkerComponent } from '../ui/required-field-marker/required-field-marker.component';

@Component({
  selector: 'app-test-case-generation-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SearchableSelectComponent,
    SimpleSelectComponent,
    FeedbackMessageComponent,
    FieldValidationMessageComponent,
    RequiredFieldMarkerComponent,
  ],
  templateUrl: './test-case-generation-settings.component.html',
})
export class TestCaseGenerationSettingsComponent {
  @Input({ required: true }) controls!: TestCaseGenerationControls;
  @Input() compatible = true;
  @Input() stateOptions: string[] = [];
  @Input() testPlanOptions: SearchableSelectOption[] = [];
  @Input() catalogState: CatalogLoadState = 'idle';
  @Input() catalogMessage = '';
  @Input() catalogError = '';
  @Input() idPrefix = 'test-case-settings';
  @Input() submitAttempted = false;
  @Output() retryTestPlans = new EventEmitter<void>();

  get enabled(): boolean {
    return this.compatible && !!this.controls?.enabled.value;
  }
  get aiDecides(): boolean {
    return this.controls?.quantityMode.value === 'ai';
  }
  get testPlanId(): string {
    return `${this.idPrefix}-test-plan`;
  }
  get stateId(): string {
    return `${this.idPrefix}-state`;
  }
  get countId(): string {
    return `${this.idPrefix}-count`;
  }

  get showTestPlanError(): boolean {
    return (
      this.enabled &&
      (this.submitAttempted || this.controls.testPlanId.touched) &&
      this.controls.testPlanId.invalid &&
      this.catalogState !== 'loading' &&
      this.catalogState !== 'idle'
    );
  }

  get testPlanError(): string {
    if (!this.showTestPlanError) return '';
    if (this.catalogState === 'empty')
      return 'No hay Test Plans disponibles en este proyecto.';
    if (this.catalogState === 'error')
      return 'No fue posible validar los Test Plans. Reintenta la consulta.';
    return 'Selecciona un Test Plan disponible para el proyecto actual.';
  }

  setEnabled(enabled: boolean): void {
    if (enabled && !this.compatible) return;
    this.controls.enabled.setValue(enabled);
    this.controls.enabled.markAsDirty();
    this.controls.enabled.markAsTouched();
  }

  setAiDecision(aiDecides: boolean): void {
    if (!this.enabled) return;
    this.controls.quantityMode.setValue(aiDecides ? 'ai' : 'fixed');
    this.controls.quantityMode.markAsDirty();
    this.controls.quantityMode.markAsTouched();
  }

  normalizeQuantity(): void {
    if (!this.enabled || this.aiDecides) return;
    const value = Math.max(
      1,
      Math.min(50, Math.floor(Number(this.controls.quantity.value) || 0)),
    );
    this.controls.quantity.setValue(value);
  }
}
