import { Component } from '@angular/core';

@Component({
  selector: 'app-required-field-marker',
  standalone: true,
  template: `
    <span
      class="required-field-marker"
      aria-label="obligatorio"
      title="Campo obligatorio"
      >* Requerido</span
    >
  `,
  styles: [
    `
      .required-field-marker {
        color: #dc2626;
        display: inline-flex;
        font-size: 0.85em;
        font-weight: 800;
        line-height: 1;
        margin-left: 0.25rem;
        vertical-align: text-top;
      }
    `,
  ],
})
export class RequiredFieldMarkerComponent {}
