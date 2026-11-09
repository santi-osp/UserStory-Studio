import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './components/shared/ui/confirm-dialog/confirm-dialog.component';
import { ToastContainerComponent } from './components/shared/ui/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ConfirmDialogComponent,
    ToastContainerComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {}
