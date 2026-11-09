import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';

export type FeedbackTone =
  'info' | 'success' | 'warning' | 'error' | 'loading' | 'empty';

@Component({
  selector: 'app-feedback-message',
  standalone: true,
  imports: [LoadingSpinnerComponent],
  template: `
    @if (message) {
      <p
        class="ui-feedback"
        [class.ui-feedback-info]="tone === 'info'"
        [class.ui-feedback-success]="tone === 'success'"
        [class.ui-feedback-warning]="tone === 'warning'"
        [class.ui-feedback-error]="tone === 'error'"
        [class.ui-feedback-loading]="tone === 'loading'"
        [class.ui-feedback-empty]="tone === 'empty'"
        [attr.role]="tone === 'error' ? 'alert' : 'status'"
        [attr.aria-live]="tone === 'error' ? 'assertive' : 'polite'"
        [attr.aria-busy]="tone === 'loading' ? 'true' : null"
      >
        @if (tone === 'loading') {
          <app-loading-spinner size="small"></app-loading-spinner>
        }
        {{ message }}
      </p>
    }
  `,
  styles: [':host { display: contents; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackMessageComponent {
  @Input() message = '';
  @Input() tone: FeedbackTone = 'info';
}
