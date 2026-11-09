import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import {
  WorkItemTypeOption,
  getWorkItemTypeOption,
  supportsTestCasesForWorkItemType,
} from '../../../utils/work-item-type';
import { WorkItemDestinationControls } from '../../../models/work-item-generation-form';

let nextWorkItemTypeSelectorId = 0;

@Component({
  selector: 'app-work-item-type-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './work-item-type-selector.component.html',
})
export class WorkItemTypeSelectorComponent {
  @Input({ required: true }) controls!: WorkItemDestinationControls;
  @Input() options: WorkItemTypeOption[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Input() inputId = `work-item-type-${++nextWorkItemTypeSelectorId}`;

  isOpen = false;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  get control(): FormControl<string | null> {
    return this.controls.workItemType;
  }
  get selected(): WorkItemTypeOption {
    return getWorkItemTypeOption(this.control.value);
  }
  get supportsTestCases(): boolean {
    return supportsTestCasesForWorkItemType(this.control.value);
  }
  get listId(): string {
    return `${this.inputId}-options`;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen = false;
    }
  }

  toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.loading && !this.control.disabled) this.isOpen = !this.isOpen;
  }

  select(option: WorkItemTypeOption, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.control.setValue(option.value);
    this.control.markAsDirty();
    this.control.markAsTouched();
    this.isOpen = false;
  }
}
