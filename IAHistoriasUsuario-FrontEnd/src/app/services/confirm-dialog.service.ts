import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ConfirmDialogType = 'danger' | 'warning' | 'info';

export interface ConfirmDialogDetail {
  label: string;
  value: string;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  detail?: string;
  details?: ConfirmDialogDetail[];
  type?: ConfirmDialogType;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ConfirmDialogState extends Required<
  Pick<
    ConfirmDialogOptions,
    'title' | 'message' | 'type' | 'confirmLabel' | 'cancelLabel'
  >
> {
  detail?: string;
  details: ConfirmDialogDetail[];
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly stateSubject =
    new BehaviorSubject<ConfirmDialogState | null>(null);
  private resolver: ((confirmed: boolean) => void) | null = null;
  private returnFocusElement: HTMLElement | null = null;

  readonly dialog$ = this.stateSubject.asObservable();

  get current(): ConfirmDialogState | null {
    return this.stateSubject.value;
  }

  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    if (this.stateSubject.value) {
      return Promise.resolve(false);
    }

    this.returnFocusElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    this.stateSubject.next({
      title: options.title,
      message: options.message,
      detail: options.detail,
      details: options.details ?? [],
      type: options.type ?? 'warning',
      confirmLabel: options.confirmLabel ?? 'Confirmar',
      cancelLabel: options.cancelLabel ?? 'Cancelar',
    });

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  accept(): void {
    this.close(true);
  }

  cancel(): void {
    this.close(false);
  }

  private close(confirmed: boolean): void {
    if (!this.stateSubject.value) {
      return;
    }

    const resolver = this.resolver;
    const returnFocusElement = this.returnFocusElement;
    this.resolver = null;
    this.returnFocusElement = null;
    this.stateSubject.next(null);
    resolver?.(confirmed);

    setTimeout(() => {
      if (returnFocusElement?.isConnected) {
        returnFocusElement.focus();
      }
    });
  }
}
