import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DropdownCoordinatorService } from '../dropdown-coordinator.service';

export interface SearchableSelectOption {
  value: string | number;
  label: string;
  meta?: string;
}

let nextSearchableSelectId = 0;

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './searchable-select.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelectComponent),
      multi: true,
    },
  ],
})
export class SearchableSelectComponent
  implements ControlValueAccessor, OnDestroy
{
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;
  @Input() options: SearchableSelectOption[] = [];
  @Input() placeholder = 'Busca y selecciona una opción';
  @Input() emptyText = 'Sin resultados para la búsqueda.';
  @Input() hint = '';
  @Input() loading = false;
  @Input() loadingText = 'Cargando opciones...';
  @Input() errorText = '';
  @Input() allowManualEntry = false;
  @Input() disabled = false;
  @Input() clearLabel = 'Limpiar selección';
  @Input() emptyValue: string | number | null = '';
  @Input() clearable = true;
  @Input() optionLimit = 120;
  @Input() inputId = '';
  @Input() required = false;
  @Input() invalid = false;
  @Input() describedBy = '';
  @Output() searchChange = new EventEmitter<string>();
  @Output() opened = new EventEmitter<void>();

  isOpen = false;
  searchTerm = '';
  value: string | number | null = '';
  readonly dropdownId = `searchable-select-${++nextSearchableSelectId}`;

  private onChange: (value: string | number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private readonly dropdownSubscription: Subscription;

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

  get filteredOptions(): SearchableSelectOption[] {
    const query = this.searchTerm.trim().toLowerCase();
    const source = query
      ? this.options.filter(
          (option) =>
            option.label.toLowerCase().includes(query) ||
            String(option.value).toLowerCase().includes(query) ||
            (option.meta ?? '').toLowerCase().includes(query),
        )
      : this.options;

    return source.slice(0, this.optionLimit);
  }

  get displayValue(): string {
    const option = this.options.find((item) =>
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
    this.searchInput?.nativeElement.focus();
  }

  writeValue(value: string | number | null): void {
    this.value = value ?? this.emptyValue;
    this.searchTerm = this.displayValue;
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

  onFocus(): void {
    if (this.disabled) {
      return;
    }

    this.isOpen = true;
    this.dropdownCoordinator.open(this.dropdownId);
    this.searchTerm = '';
    this.opened.emit();
  }

  toggleOpen(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isOpen) {
      this.close();
      return;
    }

    this.onFocus();
  }

  onEscape(event: Event): void {
    event.preventDefault();
    this.close();
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const nextSearch = target?.value ?? '';
    this.searchTerm = nextSearch;
    this.searchChange.emit(nextSearch);
    this.isOpen = true;
    this.dropdownCoordinator.open(this.dropdownId);

    if (this.allowManualEntry) {
      this.setValue(nextSearch);
    }
  }

  selectOption(option: SearchableSelectOption, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.setValue(option.value);
    this.searchTerm = option.label;
    this.close();
  }

  clearSelection(event: Event): void {
    if (!this.clearable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.setValue(this.emptyValue);
    this.searchTerm = '';
    this.close();
  }

  isSelected(option: SearchableSelectOption): boolean {
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
    this.searchTerm = this.displayValue;
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
