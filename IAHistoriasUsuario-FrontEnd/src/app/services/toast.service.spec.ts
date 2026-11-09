import { fakeAsync, tick } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { Toast, ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let subscription: Subscription;
  let latestToasts: Toast[];

  beforeEach(() => {
    service = new ToastService();
    latestToasts = [];
    subscription = service.toasts$.subscribe((toasts) => {
      latestToasts = toasts;
    });
  });

  afterEach(() => {
    subscription.unsubscribe();
    service.clear();
  });

  it('shows a normalized toast through the simple public API', () => {
    service.success(' Guardado ', {
      title: ' Éxito ',
      duration: 3000,
      dismissible: false,
    });
    expect(latestToasts[0]).toEqual(
      jasmine.objectContaining({
        type: 'success',
        title: 'Éxito',
        message: 'Guardado',
        duration: 3000,
        dismissible: false,
      }),
    );
  });

  it('keeps only one active toast', () => {
    service.info('Primero');
    service.success('Segundo');
    expect(latestToasts.length).toBe(1);
    expect(latestToasts[0].message).toBe('Primero');
  });

  it('queues different messages and advances in order', fakeAsync(() => {
    const first = service.info('Primero');
    service.info('Segundo');
    service.dismiss(first);
    tick(200);
    expect(latestToasts[0].message).toBe('Segundo');
  }));

  it('deduplicates the active notification without resetting its identity', () => {
    const first = service.error('No disponible', { title: 'Error' });
    const duplicate = service.error('No disponible', { title: 'Error' });
    expect(duplicate).toBe(first);
    expect(latestToasts.length).toBe(1);
  });

  it('deduplicates a queued notification', fakeAsync(() => {
    const active = service.info('Activa');
    const queued = service.warning('Pendiente');
    expect(service.warning('Pendiente')).toBe(queued);
    service.dismiss(active);
    tick(200);
    expect(latestToasts[0].id).toBe(queued);
    service.dismiss(queued);
    tick(200);
    expect(latestToasts).toEqual([]);
  }));

  it('prioritizes error then warning ahead of queued success and info', fakeAsync(() => {
    const active = service.info('Activa');
    service.success('Éxito');
    service.info('Información');
    service.warning('Advertencia');
    service.error('Error');
    service.dismiss(active);
    tick(200);
    expect(latestToasts[0].message).toBe('Error');
    service.dismiss(latestToasts[0].id);
    tick(200);
    expect(latestToasts[0].message).toBe('Advertencia');
  }));

  it('closes manually after the exit animation', fakeAsync(() => {
    const id = service.info('Mensaje', { duration: 10000 });
    service.dismiss(id);
    expect(latestToasts[0].state).toBe('leaving');
    tick(200);
    expect(latestToasts).toEqual([]);
  }));

  it('closes automatically after its duration', fakeAsync(() => {
    service.success('Guardado', { duration: 1000 });
    tick(1000);
    expect(latestToasts[0].state).toBe('leaving');
    tick(200);
    expect(latestToasts).toEqual([]);
  }));

  it('executes one action and closes the toast', fakeAsync(() => {
    const callback = jasmine.createSpy('callback');
    const id = service.success('Eliminado', {
      action: { label: ' Deshacer ', callback },
    });
    expect(latestToasts[0].duration).toBe(12000);
    service.executeAction(id);
    service.executeAction(id);
    expect(callback).toHaveBeenCalledTimes(1);
    tick(200);
    expect(latestToasts).toEqual([]);
  }));

  it('pauses the active timer for hover or focus', fakeAsync(() => {
    const id = service.info('Pausable', { duration: 1000 });
    tick(400);
    service.pause(id);
    tick(1000);
    expect(latestToasts[0].state).toBe('visible');
  }));

  it('resumes with the remaining duration', fakeAsync(() => {
    const id = service.info('Pausable', { duration: 1000 });
    tick(400);
    service.pause(id);
    service.resume(id);
    tick(599);
    expect(latestToasts[0].state).toBe('visible');
    tick(1);
    expect(latestToasts[0].state).toBe('leaving');
  }));

  it('cleans the old timer before advancing to the next toast', fakeAsync(() => {
    const first = service.info('Primero', { duration: 1000 });
    service.info('Segundo', { duration: 2000 });
    tick(400);
    service.dismiss(first);
    tick(200);
    tick(600);
    expect(latestToasts[0].message).toBe('Segundo');
    expect(latestToasts[0].state).toBe('visible');
  }));

  it('clears active, queued notifications and timers', fakeAsync(() => {
    service.info('Primero');
    service.error('Segundo');
    service.clear();
    tick(10000);
    expect(latestToasts).toEqual([]);
  }));

  it('cleans and completes on destroy', () => {
    const complete = jasmine.createSpy('complete');
    service.toasts$.subscribe({ complete });
    service.info('Mensaje');
    service.ngOnDestroy();
    expect(latestToasts).toEqual([]);
    expect(complete).toHaveBeenCalled();
    expect(service.info('Ignorado')).toBe('');
  });

  it('uses a distinct default duration for every severity', () => {
    const expected = {
      success: 4500,
      info: 5000,
      warning: 7000,
      error: 9000,
    } as const;
    for (const [type, duration] of Object.entries(expected)) {
      service.clear();
      service.show(type as keyof typeof expected, type);
      expect(latestToasts[0].duration).withContext(type).toBe(duration);
    }
  });

  it('includes an explicit key in deterministic deduplication', () => {
    const first = service.info('Mensaje', { key: 'contexto-a' });
    expect(service.info('Mensaje', { key: 'contexto-a' })).toBe(first);
    const differentKey = service.info('Mensaje', { key: 'contexto-b' });
    expect(differentKey).not.toBe(first);
  });

  it('ignores empty messages', () => {
    expect(service.info('   ')).toBe('');
    expect(latestToasts).toEqual([]);
  });
});
