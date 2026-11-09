import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { firstValueFrom, skip, take } from 'rxjs';
import { ConfirmDialogService } from './confirm-dialog.service';

describe('ConfirmDialogService', () => {
  let service: ConfirmDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfirmDialogService);
  });

  it('should expose normalized dialog options and resolve acceptance', async () => {
    const statePromise = firstValueFrom(service.dialog$.pipe(skip(1), take(1)));
    const resultPromise = service.confirm({
      title: 'Confirmar acción',
      message: 'Mensaje',
    });

    expect(await statePromise).toEqual(
      jasmine.objectContaining({
        title: 'Confirmar acción',
        message: 'Mensaje',
        type: 'warning',
        confirmLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        details: [],
      }),
    );

    service.accept();
    expect(await resultPromise).toBeTrue();
    expect(service.current).toBeNull();
  });

  it('should resolve cancellation and return focus to the trigger', fakeAsync(() => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    let result: boolean | undefined;

    service
      .confirm({
        title: 'Cancelar acción',
        message: 'Mensaje',
      })
      .then((value) => {
        result = value;
      });
    service.cancel();
    tick();

    expect(result).toBeFalse();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  }));

  it('should reject a second dialog while another one is active', async () => {
    const first = service.confirm({ title: 'Primero', message: 'Mensaje' });
    const second = service.confirm({ title: 'Segundo', message: 'Mensaje' });

    expect(await second).toBeFalse();
    expect(service.current?.title).toBe('Primero');
    service.cancel();
    expect(await first).toBeFalse();
  });
});
