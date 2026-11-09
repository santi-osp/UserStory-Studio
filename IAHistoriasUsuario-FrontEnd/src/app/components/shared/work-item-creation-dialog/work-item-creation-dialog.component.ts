import { CommonModule, DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { WorkItemCreationDialogState } from '../../../models/work-item-creation-preflight';

@Component({
  selector: 'app-work-item-creation-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './work-item-creation-dialog.component.html',
  styleUrl: './work-item-creation-dialog.component.css',
})
export class WorkItemCreationDialogComponent implements OnInit, OnDestroy {
  @Input({ required: true }) state!: WorkItemCreationDialogState;
  @Output() closed = new EventEmitter<void>();
  @Output() retryRequested = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<void>();
  @Output() resultRequested = new EventEmitter<void>();
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLElement>;
  @ViewChild('initialFocus', { static: true })
  initialFocus!: ElementRef<HTMLButtonElement>;

  private readonly returnFocus: HTMLElement | null;

  constructor(@Inject(DOCUMENT) private document: Document) {
    this.returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }

  get busy(): boolean {
    return this.state.phase === 'preparing' || this.state.phase === 'creating';
  }

  get canClose(): boolean {
    return this.state.phase !== 'creating';
  }

  get title(): string {
    if (this.state.phase === 'result') return 'Resultado de la creación';
    return 'Crear en Azure DevOps';
  }

  get primaryLabel(): string {
    if (this.state.phase === 'error') return 'Reintentar validación';
    if (this.state.phase === 'result')
      return this.state.result ? 'Ver resultado' : 'Cerrar';
    return this.state.ambiguousRetry
      ? 'Reintentar creación'
      : 'Crear en Azure DevOps';
  }

  ngOnInit(): void {
    queueMicrotask(() => this.initialFocus.nativeElement.focus());
  }

  ngOnDestroy(): void {
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
  }

  requestClose(): void {
    if (this.canClose) this.closed.emit();
  }

  requestPrimary(): void {
    if (this.state.phase === 'ready') this.confirmed.emit();
    else if (this.state.phase === 'error') this.retryRequested.emit();
    else if (this.state.phase === 'result') this.resultRequested.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.requestClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      this.dialog.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) {
      event.preventDefault();
      this.dialog.nativeElement.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
