import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ConfirmDialogService } from '../../../../services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
  @ViewChild('dialog') private dialogElement?: ElementRef<HTMLElement>;
  @ViewChild('initialFocus')
  private initialFocusElement?: ElementRef<HTMLButtonElement>;

  private readonly subscriptions = new Subscription();

  constructor(readonly dialogService: ConfirmDialogService) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.dialogService.dialog$.subscribe((dialog) => {
        if (!dialog) {
          return;
        }

        setTimeout(() => this.initialFocusElement?.nativeElement.focus());
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.dialogService.cancel();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.dialogService.current) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.dialogService.cancel();
      return;
    }

    if (event.key === 'Tab') {
      this.keepFocusInsideDialog(event);
    }
  }

  cancelFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.dialogService.cancel();
    }
  }

  private keepFocusInsideDialog(event: KeyboardEvent): void {
    const dialog = this.dialogElement?.nativeElement;
    if (!dialog) {
      return;
    }

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
