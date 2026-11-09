import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { SearchableSelectComponent } from './searchable-select.component';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <app-searchable-select
      [formControl]="control"
      [options]="options"
      [allowManualEntry]="allowManualEntry"
      [loading]="loading"
      [errorText]="errorText"
      [required]="required"
      [invalid]="invalid"
      [describedBy]="describedBy"
      [clearable]="clearable"
      inputId="host-select"
      placeholder="Buscar"
    >
    </app-searchable-select>
  `,
})
class HostComponent {
  control = new FormControl<string | number | null>('');
  allowManualEntry = false;
  loading = false;
  required = false;
  invalid = false;
  describedBy = '';
  errorText = '';
  clearable = true;
  options = [
    { value: 'one@example.com', label: 'one@example.com' },
    { value: 123, label: '123 - Plan QA', meta: 'Proyecto QA' },
  ];
}

describe('SearchableSelectComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should select an option and write only its value', () => {
    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const option = fixture.debugElement.queryAll(
      By.css('.path-picker-option'),
    )[0].nativeElement as HTMLButtonElement;
    option.dispatchEvent(new MouseEvent('mousedown'));
    fixture.detectChanges();

    expect(host.control.value).toBe('one@example.com');
  });

  it('should select a result with the keyboard', () => {
    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const option = fixture.debugElement.queryAll(
      By.css('.path-picker-option'),
    )[0].nativeElement as HTMLButtonElement;
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(host.control.value).toBe('one@example.com');
  });

  it('should allow manual text when fallback is enabled', () => {
    host.allowManualEntry = true;
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.value = 'manual@example.com';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(host.control.value).toBe('manual@example.com');
  });

  it('should clear to empty value', () => {
    host.control.setValue(123);
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const clearButton = fixture.debugElement.query(
      By.css('.path-picker-option'),
    ).nativeElement as HTMLButtonElement;
    clearButton.dispatchEvent(new MouseEvent('mousedown'));
    fixture.detectChanges();

    expect(host.control.value).toBe('');
  });

  it('preserves selection and hides the clear action when clearable is false', () => {
    host.control.setValue(123);
    host.clearable = false;
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const options = fixture.debugElement.queryAll(
      By.css('.path-picker-option'),
    );
    expect(
      options.some((option) =>
        option.nativeElement.textContent.includes('Limpiar selecciÃ³n'),
      ),
    ).toBeFalse();

    host.control.setValue(null);
    fixture.detectChanges();
    expect(host.control.value).toBeNull();
  });

  it('should filter options by value, label or metadata', () => {
    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    input.value = 'proyecto';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const options = fixture.debugElement.queryAll(
      By.css('.path-picker-option'),
    );

    expect(options.length).toBe(2);
    expect(options[1].nativeElement.textContent).toContain('123 - Plan QA');
  });

  it('should render optional metadata', () => {
    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const meta = fixture.debugElement.query(By.css('.path-picker-sub'))
      .nativeElement as HTMLElement;

    expect(meta.textContent).toContain('Proyecto QA');
  });

  it('should expose aria-required when configured as required', () => {
    host.required = true;
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;

    expect(input.getAttribute('aria-required')).toBe('true');
  });

  it('should keep the list closed when disabled', () => {
    host.control.disable();
    fixture.detectChanges();

    const select = fixture.debugElement.query(
      By.directive(SearchableSelectComponent),
    ).componentInstance as SearchableSelectComponent;
    select.onFocus();

    expect(select.isOpen).toBeFalse();
  });

  it('exposes inline validation semantics and a public focus mechanism', () => {
    host.invalid = true;
    host.describedBy = 'project-error';
    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    const focus = spyOn(input, 'focus');
    const select = fixture.debugElement.query(
      By.directive(SearchableSelectComponent),
    ).componentInstance as SearchableSelectComponent;
    select.focus();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('project-error');
    expect(focus).toHaveBeenCalled();
  });

  it('should close when clicking outside', () => {
    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const select = fixture.debugElement.query(
      By.directive(SearchableSelectComponent),
    ).componentInstance as SearchableSelectComponent;
    select.onDocumentClick({ target: document.body } as unknown as MouseEvent);

    expect(select.isOpen).toBeFalse();
  });

  it('should show loading, error and empty states', () => {
    host.loading = true;
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input'))
      .nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Cargando opciones');

    host.loading = false;
    host.errorText = 'No fue posible cargar opciones.';
    host.options = [];
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'No fue posible cargar opciones.',
    );
    expect(fixture.nativeElement.textContent).toContain('Sin resultados');
  });

  it('accepts a programmatic clear using the configured null empty value', () => {
    const select = fixture.debugElement.query(
      By.directive(SearchableSelectComponent),
    ).componentInstance as SearchableSelectComponent;
    select.emptyValue = null;
    select.writeValue(1);
    select.writeValue(null);
    expect(select.value).toBeNull();
    expect(select.displayValue).toBe('');
  });

  it('reconciles display text when options change after a value is written', () => {
    const select = fixture.debugElement.query(
      By.directive(SearchableSelectComponent),
    ).componentInstance as SearchableSelectComponent;
    select.writeValue(7);
    expect(select.displayValue).toBe('7');
    select.options = [{ value: 7, label: 'Plan siete' }];
    expect(select.displayValue).toBe('Plan siete');
  });
});
