import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-section-card',
  standalone: true,
  template: `
    <section class="ui-section-card">
      @if (eyebrow || title || description) {
        <header class="ui-section-card-header">
          @if (eyebrow) {
            <p class="ui-section-card-eyebrow">{{ eyebrow }}</p>
          }
          @if (title) {
            <h3 class="ui-section-card-title">{{ title }}</h3>
          }
          @if (description) {
            <p class="ui-section-card-description">{{ description }}</p>
          }
        </header>
      }
      <ng-content />
    </section>
  `,
  styles: [':host { display: block; min-width: 0; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionCardComponent {
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() description = '';
}
