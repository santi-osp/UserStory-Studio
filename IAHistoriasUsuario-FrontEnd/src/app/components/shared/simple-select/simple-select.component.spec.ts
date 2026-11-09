import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { DropdownCoordinatorService } from '../dropdown-coordinator.service';
import { SimpleSelectComponent } from './simple-select.component';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, SimpleSelectComponent],
  template: `
    <app-simple-select
      [formControl]="control"
      [options]="options"
      [clearable]="clearable"
      [emptyValue]="emptyValue"
      [required]="required"
      inputId="simple-host"
      placeholder="Selecciona"
    >
    </app-simple-select>
  `,
})
class SimpleSelectHostComponent {
  control = new FormControl<string | number | null>('');
  clearable = true;
  emptyValue: string | number | null = '';
  required = false;
  options: (string | number | { value: string | number; label: string })[] = [
    'Ready',
    2,
    { value: 'Closed', label: 'Cerrado' },
  ];
}

describe('SimpleSelectComponent', () => {
  let fixture: ComponentFixture<SimpleSelectHostComponent>;
  let host: SimpleSelectHostComponent;
  let component: SimpleSelectComponent;
  let coordinator: DropdownCoordinatorService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimpleSelectHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SimpleSelectHostComponent);
    host = fixture.componentInstance;
    coordinator = TestBed.inject(DropdownCoordinatorService);
    fixture.detectChanges();
    component = fixture.debugElement.query(
      By.directive(SimpleSelectComponent),
    ).componentInstance;
  });

  it('normalizes primitive options and displays the selected label', () => {
    expect(component.normalizedOptions).toEqual([
      { value: 'Ready', label: 'Ready' },
      { value: 2, label: '2' },
      { value: 'Closed', label: 'Cerrado' },
    ]);

    host.control.setValue('Closed');
    fixture.detectChanges();

    expect(component.displayValue).toBe('Cerrado');
    expect(fixture.nativeElement.textContent).toContain('Cerrado');
  });

  it('opens, selects an option and closes through the coordinator', () => {
    const change = jasmine.createSpy('change');
    const touched = jasmine.createSpy('touched');
    component.registerOnChange(change);
    component.registerOnTouched(touched);
    const event = new MouseEvent('click');
    spyOn(event, 'preventDefault');
    spyOn(event, 'stopPropagation');

    component.toggleOpen(event);
    expect(component.isOpen).toBeTrue();

    component.selectOption(component.normalizedOptions[1], event);

    expect(component.value).toBe(2);
    expect(change).toHaveBeenCalledWith(2);
    expect(touched).toHaveBeenCalled();
    expect(component.isOpen).toBeFalse();
  });

  it('clears to configured empty value and supports null writes', () => {
    const change = jasmine.createSpy('change');
    component.registerOnChange(change);
    component.emptyValue = null;
    component.writeValue(null);

    component.clearSelection(new MouseEvent('click'));

    expect(component.value).toBeNull();
    expect(component.displayValue).toBe('');
    expect(change).toHaveBeenCalledWith(null);
  });

  it('should expose aria-required when configured as required', () => {
    host.required = true;
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.field-input-button'))
      .nativeElement as HTMLButtonElement;

    expect(button.getAttribute('aria-required')).toBe('true');
  });

  it('does not open while disabled and toggles closed when already open', () => {
    component.setDisabledState(true);
    component.toggleOpen(new MouseEvent('click'));
    expect(component.isOpen).toBeFalse();

    component.setDisabledState(false);
    component.toggleOpen(new MouseEvent('click'));
    component.toggleOpen(new MouseEvent('click'));
    expect(component.isOpen).toBeFalse();
  });

  it('offers a public focus mechanism for validation orchestration', () => {
    const button = fixture.debugElement.query(By.css('.field-input-button'))
      .nativeElement as HTMLButtonElement;
    const focus = spyOn(button, 'focus');
    component.focus();
    expect(focus).toHaveBeenCalled();
  });

  it('closes on outside click but ignores clicks inside', () => {
    component.toggleOpen(new MouseEvent('click'));
    const button = fixture.debugElement.query(By.css('.field-input-button'))
      .nativeElement as HTMLElement;

    component.onDocumentClick({ target: button } as unknown as MouseEvent);
    expect(component.isOpen).toBeTrue();

    component.onDocumentClick({
      target: document.body,
    } as unknown as MouseEvent);
    expect(component.isOpen).toBeFalse();
  });

  it('closes when another dropdown opens and unsubscribes on destroy', () => {
    component.toggleOpen(new MouseEvent('click'));
    coordinator.open('another-dropdown');

    expect(component.isOpen).toBeFalse();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  it('renders clearable and empty states and compares numeric values by text', () => {
    host.options = [];
    fixture.detectChanges();
    component.toggleOpen(new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'No hay opciones disponibles',
    );

    host.options = [2];
    host.control.setValue('2');
    fixture.detectChanges();
    expect(component.isSelected({ value: 2, label: '2' })).toBeTrue();
  });
});
