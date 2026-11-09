import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../searchable-select/searchable-select.component';
import { FieldValidationMessageComponent } from '../ui/field-validation-message/field-validation-message.component';
import { RequiredFieldMarkerComponent } from '../ui/required-field-marker/required-field-marker.component';
import { WorkItemDestinationControls } from '../../../models/work-item-generation-form';

@Component({
  selector: 'app-work-item-destination-fields',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SearchableSelectComponent,
    FieldValidationMessageComponent,
    RequiredFieldMarkerComponent,
  ],
  templateUrl: './work-item-destination-fields.component.html',
})
export class WorkItemDestinationFieldsComponent {
  @Input({ required: true }) controls!: WorkItemDestinationControls;
  @Input() projectOptions: SearchableSelectOption[] = [];
  @Input() areaPathOptions: SearchableSelectOption[] = [];
  @Input() iterationPathOptions: SearchableSelectOption[] = [];
  @Input() idPrefix = 'work-item';
  @Input() projectRequired = true;
  @Input() areaRequired = true;
  @Input() iterationRequired = true;
  @Input() projectError = '';
  @Input() areaError = '';
  @Input() iterationError = '';
  @Input() loading = false;

  get projectId(): string {
    return `${this.idPrefix}-azdo-project`;
  }
  get areaId(): string {
    return `${this.idPrefix}-area-path`;
  }
  get iterationId(): string {
    return `${this.idPrefix}-iteration-path`;
  }
}
