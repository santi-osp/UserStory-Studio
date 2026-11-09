import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastState = 'visible' | 'leaving';

export interface ToastAction {
  label: string;
  callback: () => void;
}

export interface Toast {
  id: string;
  key: string;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  dismissible: boolean;
  action?: ToastAction;
  state: ToastState;
}

export interface ToastOptions {
  title?: string;
  duration?: number;
  dismissible?: boolean;
  action?: ToastAction;
  key?: string;
}

const DEFAULT_DURATION_MS: Record<ToastType, number> = {
  success: 4500,
  info: 5000,
  warning: 7000,
  error: 9000,
};
const ACTION_DURATION_MS = 12000;
const EXIT_ANIMATION_MS = 200;
const PRIORITY: Record<ToastType, number> = {
  error: 3,
  warning: 2,
  success: 1,
  info: 1,
};

@Injectable({ providedIn: 'root' })
export class ToastService implements OnDestroy {
  readonly toasts$: Observable<Toast[]>;

  private readonly toastsSubject = new BehaviorSubject<Toast[]>([]);
  private readonly queue: Toast[] = [];
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private removalTimer: ReturnType<typeof setTimeout> | null = null;
  private timerStartedAt = 0;
  private remainingDuration = 0;
  private idSequence = 0;
  private destroyed = false;

  constructor() {
    this.toasts$ = this.toastsSubject.asObservable();
  }

  success(message: string, options: ToastOptions = {}): string {
    return this.show('success', message, options);
  }

  error(message: string, options: ToastOptions = {}): string {
    return this.show('error', message, options);
  }

  warning(message: string, options: ToastOptions = {}): string {
    return this.show('warning', message, options);
  }

  info(message: string, options: ToastOptions = {}): string {
    return this.show('info', message, options);
  }

  show(type: ToastType, message: string, options: ToastOptions = {}): string {
    if (this.destroyed) return '';

    const normalizedMessage = message.trim();
    if (!normalizedMessage) return '';

    const title = options.title?.trim() || undefined;
    const key = this.createDedupeKey(
      type,
      title,
      normalizedMessage,
      options.key,
    );
    const duplicate = this.findByKey(key);
    // Repeated notifications are intentionally ignored; their original timer is preserved.
    if (duplicate) return duplicate.id;

    const toast: Toast = {
      id: this.createId(),
      key,
      type,
      title,
      message: normalizedMessage,
      duration: this.normalizeDuration(
        options.duration,
        type,
        !!options.action,
      ),
      dismissible: options.dismissible ?? true,
      action: this.normalizeAction(options.action),
      state: 'visible',
    };

    if (this.toastsSubject.value.length === 0) {
      this.activate(toast);
    } else {
      this.enqueue(toast);
    }
    return toast.id;
  }

  dismiss(id: string): void {
    const active = this.toastsSubject.value[0];
    if (!active || active.id !== id || active.state === 'leaving') return;

    this.clearAutoDismissTimer();
    this.toastsSubject.next([{ ...active, state: 'leaving' }]);
    this.removalTimer = setTimeout(
      () => this.removeActive(id),
      EXIT_ANIMATION_MS,
    );
  }

  executeAction(id: string): void {
    const active = this.toastsSubject.value[0];
    if (!active?.action || active.id !== id || active.state === 'leaving')
      return;

    try {
      active.action.callback();
    } finally {
      this.dismiss(id);
    }
  }

  pause(id: string): void {
    const active = this.toastsSubject.value[0];
    if (
      !active ||
      active.id !== id ||
      active.state === 'leaving' ||
      !this.autoDismissTimer
    )
      return;

    const elapsed = Math.max(0, Date.now() - this.timerStartedAt);
    this.remainingDuration = Math.max(1, this.remainingDuration - elapsed);
    this.clearAutoDismissTimer();
  }

  resume(id: string): void {
    const active = this.toastsSubject.value[0];
    if (
      !active ||
      active.id !== id ||
      active.state === 'leaving' ||
      this.autoDismissTimer
    )
      return;
    this.startAutoDismissTimer(
      active.id,
      this.remainingDuration || active.duration,
    );
  }

  clear(): void {
    this.clearTimers();
    this.queue.length = 0;
    this.toastsSubject.next([]);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clear();
    this.toastsSubject.complete();
  }

  private activate(toast: Toast): void {
    this.toastsSubject.next([{ ...toast, state: 'visible' }]);
    this.startAutoDismissTimer(toast.id, toast.duration);
  }

  private enqueue(toast: Toast): void {
    const insertionIndex = this.queue.findIndex(
      (item) => PRIORITY[item.type] < PRIORITY[toast.type],
    );
    if (insertionIndex === -1) this.queue.push(toast);
    else this.queue.splice(insertionIndex, 0, toast);
  }

  private removeActive(id: string): void {
    const active = this.toastsSubject.value[0];
    if (!active || active.id !== id) return;

    this.clearRemovalTimer();
    this.toastsSubject.next([]);
    const next = this.queue.shift();
    if (next) this.activate(next);
  }

  private findByKey(key: string): Toast | undefined {
    return (
      this.toastsSubject.value.find((toast) => toast.key === key) ??
      this.queue.find((toast) => toast.key === key)
    );
  }

  private createDedupeKey(
    type: ToastType,
    title: string | undefined,
    message: string,
    explicitKey?: string,
  ): string {
    return [type, title ?? '', message, explicitKey?.trim() ?? '']
      .join('\u001f')
      .toLocaleLowerCase();
  }

  private normalizeDuration(
    duration: number | undefined,
    type: ToastType,
    hasAction: boolean,
  ): number {
    const fallback = hasAction ? ACTION_DURATION_MS : DEFAULT_DURATION_MS[type];
    if (!Number.isFinite(duration)) return fallback;
    return Math.max(1000, Math.floor(duration ?? fallback));
  }

  private normalizeAction(
    action: ToastAction | undefined,
  ): ToastAction | undefined {
    const label = action?.label.trim();
    if (!label || typeof action?.callback !== 'function') return undefined;
    return { label, callback: action.callback };
  }

  private startAutoDismissTimer(id: string, duration: number): void {
    this.remainingDuration = duration;
    this.timerStartedAt = Date.now();
    this.autoDismissTimer = setTimeout(() => this.dismiss(id), duration);
  }

  private clearAutoDismissTimer(): void {
    if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer);
    this.autoDismissTimer = null;
  }

  private clearRemovalTimer(): void {
    if (this.removalTimer) clearTimeout(this.removalTimer);
    this.removalTimer = null;
  }

  private clearTimers(): void {
    this.clearAutoDismissTimer();
    this.clearRemovalTimer();
  }

  private createId(): string {
    this.idSequence += 1;
    return `toast-${Date.now()}-${this.idSequence}`;
  }
}
