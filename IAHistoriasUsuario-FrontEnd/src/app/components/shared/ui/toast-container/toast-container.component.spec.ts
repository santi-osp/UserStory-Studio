import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ToastService } from '../../../../services/toast.service';
import { ToastContainerComponent } from './toast-container.component';

describe('ToastContainerComponent', () => {
  let fixture: ComponentFixture<ToastContainerComponent>;
  let toastService: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ToastContainerComponent);
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  afterEach(() => toastService.clear());

  it('renders one isolated notification viewport', () => {
    const viewport = fixture.debugElement.query(By.css('.toast-viewport'));
    expect(viewport.attributes['aria-label']).toBe('Notificaciones');
    expect(
      fixture.debugElement.queryAll(By.css('.toast-viewport')).length,
    ).toBe(1);
    const style = getComputedStyle(viewport.nativeElement);
    expect(style.position).toBe('fixed');
    expect(style.overflowX).toBe('clip');
    expect(style.overflowY).toBe('clip');
    expect(style.pointerEvents).toBe('none');
  });

  it('renders every tonal type with an SVG icon while keeping one active toast', () => {
    const types = ['success', 'error', 'warning', 'info'] as const;
    for (const type of types) {
      toastService.clear();
      toastService.show(type, `Mensaje ${type}`, { duration: 10000 });
      fixture.detectChanges();
      expect(
        fixture.debugElement.query(By.css(`.toast-${type} .toast-icon svg`)),
      ).not.toBeNull();
    }
    toastService.info('En cola');
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('.toast')).length).toBe(1);
  });

  it('uses assertive atomic alerts for errors and polite atomic status for other types', () => {
    toastService.error('No disponible', { title: 'Error' });
    fixture.detectChanges();
    const error = fixture.debugElement.query(By.css('.toast-error'));
    expect(error.attributes['role']).toBe('alert');
    expect(error.attributes['aria-live']).toBe('assertive');
    expect(error.attributes['aria-atomic']).toBe('true');

    toastService.clear();
    toastService.success('Guardado');
    fixture.detectChanges();
    const success = fixture.debugElement.query(By.css('.toast-success'));
    expect(success.attributes['role']).toBe('status');
    expect(success.attributes['aria-live']).toBe('polite');
  });

  it('renders title, long wrapping content and an accessible SVG close button', fakeAsync(() => {
    toastService.info('Contenido '.repeat(40), {
      title: 'Información',
      duration: 10000,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Información');
    expect(fixture.nativeElement.textContent).toContain('Contenido');
    const viewport = fixture.debugElement.query(By.css('.toast-viewport'))
      .nativeElement as HTMLElement;
    const toastElement = fixture.debugElement.query(By.css('.toast'))
      .nativeElement as HTMLElement;
    expect(toastElement.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
    expect(getComputedStyle(toastElement).pointerEvents).toBe('auto');
    const close = fixture.debugElement.query(By.css('button.toast-dismiss'));
    expect(close.attributes['aria-label']).toContain('Cerrar notificación');
    expect(close.query(By.css('svg'))).not.toBeNull();
    close.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast-leaving'))).not.toBeNull();
    tick(200);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast'))).toBeNull();
  }));

  it('renders an accessible action and pauses or resumes around interaction', () => {
    const callback = jasmine.createSpy('callback');
    spyOn(toastService, 'pause').and.callThrough();
    spyOn(toastService, 'resume').and.callThrough();
    toastService.success('Elemento eliminado', {
      action: { label: 'Deshacer', callback },
    });
    fixture.detectChanges();

    const toast = fixture.debugElement.query(By.css('.toast'));
    toast.triggerEventHandler('mouseenter');
    toast.triggerEventHandler('mouseleave');
    expect(toastService.pause).toHaveBeenCalled();
    expect(toastService.resume).toHaveBeenCalled();

    const action = fixture.debugElement.query(By.css('button.toast-action'));
    expect(action.nativeElement.textContent.trim()).toBe('Deshacer');
    action.nativeElement.click();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('omits the close button when dismissal is disabled', () => {
    toastService.info('Procesando', { dismissible: false });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast-dismiss'))).toBeNull();
  });
});
