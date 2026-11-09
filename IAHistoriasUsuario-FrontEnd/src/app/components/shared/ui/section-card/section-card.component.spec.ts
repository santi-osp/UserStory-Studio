import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SectionCardComponent } from './section-card.component';

@Component({
  standalone: true,
  imports: [SectionCardComponent],
  template: `
    <app-section-card
      eyebrow="Paso 1"
      title="Datos"
      description="Ayuda del bloque"
    >
      <button type="button">Accion proyectada</button>
    </app-section-card>
  `,
})
class HostComponent {}

describe('SectionCardComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('should render its heading and projected content', () => {
    expect(
      fixture.debugElement.query(By.css('.ui-section-card-eyebrow'))
        .nativeElement.textContent,
    ).toContain('Paso 1');
    expect(
      fixture.debugElement.query(By.css('.ui-section-card-title')).nativeElement
        .textContent,
    ).toContain('Datos');
    expect(
      fixture.debugElement.query(By.css('button')).nativeElement.textContent,
    ).toContain('Accion proyectada');
  });
});
