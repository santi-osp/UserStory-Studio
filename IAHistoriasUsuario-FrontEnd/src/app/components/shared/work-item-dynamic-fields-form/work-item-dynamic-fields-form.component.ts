import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { WorkItemFieldConfig } from '../../../models/types';
import {
  dynamicWorkItemControlName,
  dynamicWorkItemInputStep,
  dynamicWorkItemInputType,
  isDynamicCheckboxField,
  isDynamicSelectField,
  isDynamicTextareaField,
} from '../../../utils/work-item-dynamic-fields';
import { SimpleSelectComponent } from '../simple-select/simple-select.component';
import { RequiredFieldMarkerComponent } from '../ui/required-field-marker/required-field-marker.component';
import { FieldValidationMessageComponent } from '../ui/field-validation-message/field-validation-message.component';

@Component({
  selector: 'app-work-item-dynamic-fields-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SimpleSelectComponent,
    RequiredFieldMarkerComponent,
    FieldValidationMessageComponent,
  ],
  template: `
    <div class="grid gap-4 md:grid-cols-2" [formGroup]="formGroup">
      @for (field of fields; track trackField(field)) {
        <div class="field-label">
          <span class="flex flex-wrap items-center gap-2">
            <span>{{ field.label }}</span>
            @if (field.required && showRequiredIndicator) {
              <app-required-field-marker></app-required-field-marker>
            }
          </span>

          @if (useSelectControl(field)) {
            <app-simple-select
              [formControlName]="dynamicControlName(field)"
              [options]="field.options"
              [required]="field.required"
              [inputId]="fieldDomId(field)"
              [invalid]="!!validationMessage(field)"
              [describedBy]="
                validationMessage(field) ? fieldErrorId(field) : ''
              "
              placeholder="Selecciona una opción"
              [ariaLabel]="'Mostrar opciones de ' + field.label"
            >
            </app-simple-select>
          } @else if (useTextareaControl(field)) {
            <textarea
              rows="4"
              class="field-input"
              [attr.id]="fieldDomId(field)"
              [attr.aria-required]="field.required ? 'true' : null"
              [attr.aria-invalid]="validationMessage(field) ? 'true' : null"
              [attr.aria-describedby]="
                validationMessage(field) ? fieldErrorId(field) : null
              "
              [formControlName]="dynamicControlName(field)"
            ></textarea>
          } @else if (useCheckboxControl(field)) {
            <span [ngClass]="checkboxFieldClass">
              <input
                type="checkbox"
                class="ia-checkbox"
                [attr.id]="fieldDomId(field)"
                [attr.aria-required]="field.required ? 'true' : null"
                [attr.aria-invalid]="validationMessage(field) ? 'true' : null"
                [attr.aria-describedby]="
                  validationMessage(field) ? fieldErrorId(field) : null
                "
                [formControlName]="dynamicControlName(field)"
              />
              <span class="text-xs font-normal text-ink/80"
                >Marcar valor verdadero</span
              >
            </span>
          } @else {
            <input
              class="field-input"
              [type]="inputType(field)"
              [attr.id]="fieldDomId(field)"
              [attr.step]="inputStep(field)"
              [attr.aria-required]="field.required ? 'true' : null"
              [attr.aria-invalid]="validationMessage(field) ? 'true' : null"
              [attr.aria-describedby]="
                validationMessage(field) ? fieldErrorId(field) : null
              "
              [formControlName]="dynamicControlName(field)"
            />
          }
          <app-field-validation-message
            [message]="validationMessage(field)"
            [messageId]="fieldErrorId(field)"
          ></app-field-validation-message>
        </div>
      }
    </div>
  `,
  styles: [':host { display: block; }'],
})
export class WorkItemDynamicFieldsFormComponent {
  @Input({ required: true }) formGroup!: FormGroup;
  @Input({ required: true }) fields: WorkItemFieldConfig[] = [];
  @Input({ required: true }) controlPrefix = '';
  @Input() checkboxFieldClass = '';
  @Input() validationMessages: Record<string, string> = {};
  @Input() showRequiredIndicator = true;

  dynamicControlName(field: WorkItemFieldConfig): string {
    return dynamicWorkItemControlName(field, this.controlPrefix);
  }

  useSelectControl(field: WorkItemFieldConfig): boolean {
    return isDynamicSelectField(field);
  }
  useTextareaControl(field: WorkItemFieldConfig): boolean {
    return isDynamicTextareaField(field);
  }
  useCheckboxControl(field: WorkItemFieldConfig): boolean {
    return isDynamicCheckboxField(field);
  }
  inputType(
    field: WorkItemFieldConfig,
  ): 'text' | 'number' | 'date' | 'datetime-local' {
    return dynamicWorkItemInputType(field);
  }
  inputStep(field: WorkItemFieldConfig): string | null {
    return dynamicWorkItemInputStep(field);
  }
  trackField(field: WorkItemFieldConfig): string {
    return field.referenceName || field.name || field.label;
  }
  validationMessage(field: WorkItemFieldConfig): string {
    return this.validationMessages[field.referenceName] ?? '';
  }

  fieldDomId(field: WorkItemFieldConfig): string {
    return `dynamic-field-${this.dynamicControlName(field).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  fieldErrorId(field: WorkItemFieldConfig): string {
    return `${this.fieldDomId(field)}-error`;
  }
}
