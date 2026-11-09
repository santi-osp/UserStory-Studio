import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-field-validation-message',
  standalone: true,
  template: `
    @if (message) {
      <p
        class="field-validation-message"
        [id]="messageId"
        role="alert"
        aria-live="polite"
      >
        {{ message }}
      </p>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .field-validation-message {
        margin: 0;
        color: var(--danger, #b42318);
        font-size: 0.78rem;
        font-weight: 650;
        line-height: 1.4;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldValidationMessageComponent {
  @Input() message = '';
  @Input() messageId = '';
}
