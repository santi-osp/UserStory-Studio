import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  forwardRef,
  HostListener,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DropdownCoordinatorService } from '../dropdown-coordinator.service';

export interface SimpleSelectOption {
  value: string | number;
  label: string;
}

type SimpleSelectInputOption = SimpleSelectOption | string | number;

let nextSimpleSelectId = 0;

@Component({
  selector: 'app-simple-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './simple-select.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SimpleSelectComponent),
      multi: true,
    },
  ],
})
export class SimpleSelectComponent implements ControlValueAccessor, OnDestroy {
  @ViewChild('selectButton')
  private selectButton?: ElementRef<HTMLButtonElement>;
  @Input() placeholder = 'Selecciona una opcion';
  @Input() emptyValue: string | number | null = '';
  @Input() clearable = true;
  @Input() disabled = false;
  @Input() inputId = '';
  @Input() ariaLabel = 'Mostrar opciones';
  @Input() required = false;
  @Input() invalid = false;
  @Input() describedBy = '';
  @Input() set options(value: SimpleSelectInputOption[]) {
    this.normalizedOptions = (value ?? []).map((option) => {
      if (typeof option === 'string' || typeof option === 'number') {
        return { value: option, label: String(option) };
      }

      return option;
    });
  }

  normalizedOptions: SimpleSelectOption[] = [];
  value: string | number | null = '';
  isOpen = false;

  private readonly dropdownId = `simple-select-${++nextSimpleSelectId}`;
  private readonly dropdownSubscription: Subscription;
  private onChange: (value: string | number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private dropdownCoordinator: DropdownCoordinatorService,
  ) {
    this.dropdownSubscription =
      this.dropdownCoordinator.activeDropdownId$.subscribe((activeId) => {
        if (activeId !== this.dropdownId) {
          this.close(false);
        }
      });
  }

  ngOnDestroy(): void {
    this.dropdownSubscription.unsubscribe();
    this.dropdownCoordinator.close(this.dropdownId);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && this.elementRef.nativeElement.contains(target)) {
      return;
    }

    this.close();
  }

  get displayValue(): string {
    const option = this.normalizedOptions.find((item) =>
      this.isSameValue(item.value, this.value),
    );
    if (option) {
      return option.label;
    }

    return this.value === null || this.value === undefined
      ? ''
      : String(this.value);
  }

  focus(): void {
    this.selectButton?.nativeElement.focus();
  }

  writeValue(value: string | number | null): void {
    this.value = value ?? this.emptyValue;
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  toggleOpen(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.disabled) {
      return;
    }

    if (this.isOpen) {
      this.close();
      return;
    }

    this.isOpen = true;
    this.dropdownCoordinator.open(this.dropdownId);
  }

  selectOption(option: SimpleSelectOption, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.setValue(option.value);
    this.close();
  }

  clearSelection(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.setValue(this.emptyValue);
    this.close();
  }

  isSelected(option: SimpleSelectOption): boolean {
    return this.isSameValue(option.value, this.value);
  }

  private setValue(value: string | number | null): void {
    this.value = value;
    this.onChange(value);
    this.onTouched();
  }

  private close(syncCoordinator = true): void {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.onTouched();
    if (syncCoordinator) {
      this.dropdownCoordinator.close(this.dropdownId);
    }
  }

  private isSameValue(
    left: string | number | null,
    right: string | number | null,
  ): boolean {
    return String(left ?? '') === String(right ?? '');
  }
}
