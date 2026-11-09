import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="ui-loading-spinner"
      [class.ui-loading-spinner-small]="size === 'small'"
      aria-hidden="true"
    ></span>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      line-height: 0;
    }

    .ui-loading-spinner {
      width: 1.125rem;
      height: 1.125rem;
      box-sizing: border-box;
      border: 0.125rem solid color-mix(in srgb, currentColor 28%, transparent);
      border-top-color: currentColor;
      border-radius: 999px;
      animation: ui-loading-spinner-rotate 700ms linear infinite;
    }

    .ui-loading-spinner-small {
      width: 1rem;
      height: 1rem;
    }

    @keyframes ui-loading-spinner-rotate {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ui-loading-spinner {
        animation: none;
        border-color: currentColor;
        border-right-color: transparent;
      }
    }
  `,
})
export class LoadingSpinnerComponent {
  @Input() size: 'small' | 'medium' = 'medium';
}
