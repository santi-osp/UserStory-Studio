import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ConfirmDialogService } from '../../../../services/confirm-dialog.service';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let service: ConfirmDialogService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmDialogComponent);
    service = TestBed.inject(ConfirmDialogService);
    fixture.detectChanges();
  });

  it('should render an accessible dialog and focus the safe action', fakeAsync(() => {
    void service.confirm({
      title: 'Eliminar PAT guardado',
      message: 'Se eliminará la credencial.',
      details: [{ label: 'Proyecto', value: 'Proyecto A' }],
      type: 'danger',
      confirmLabel: 'Eliminar PAT',
      cancelLabel: 'Conservar PAT',
    });
    fixture.detectChanges();
    tick();

    const dialog = fixture.debugElement.query(By.css('[role="dialog"]'));
    const buttons = fixture.debugElement.queryAll(
      By.css('.confirm-dialog-actions button'),
    );

    expect(dialog.attributes['aria-modal']).toBe('true');
    expect(dialog.attributes['aria-labelledby']).toBe('confirm-dialog-title');
    expect(fixture.nativeElement.textContent).toContain('Proyecto A');
    expect(document.activeElement).toBe(buttons[0].nativeElement);
  }));

  it('should cancel with Escape', fakeAsync(() => {
    let result: boolean | undefined;
    service
      .confirm({ title: 'Confirmar', message: 'Mensaje' })
      .then((value) => {
        result = value;
      });
    fixture.detectChanges();
    tick();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    tick();

    expect(result).toBeFalse();
    expect(fixture.debugElement.query(By.css('[role="dialog"]'))).toBeNull();
  }));

  it('should keep keyboard focus inside the dialog', fakeAsync(() => {
    void service.confirm({ title: 'Confirmar', message: 'Mensaje' });
    fixture.detectChanges();
    tick();
    const buttons = fixture.debugElement
      .queryAll(By.css('.confirm-dialog-actions button'))
      .map((element) => element.nativeElement as HTMLButtonElement);

    buttons[1].focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(buttons[0]);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }),
    );
    expect(document.activeElement).toBe(buttons[1]);
  }));
});
