import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LoadingSpinnerComponent } from './loading-spinner.component';

describe('LoadingSpinnerComponent', () => {
  let fixture: ComponentFixture<LoadingSpinnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingSpinnerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingSpinnerComponent);
  });

  it('is decorative and supports the compact size', () => {
    fixture.componentRef.setInput('size', 'small');
    fixture.detectChanges();

    const spinner = fixture.debugElement.query(By.css('.ui-loading-spinner'));
    expect(spinner.attributes['aria-hidden']).toBe('true');
    expect(spinner.classes['ui-loading-spinner-small']).toBeTrue();
  });

  it('declares a reduced-motion presentation', () => {
    const styles = String(
      (LoadingSpinnerComponent as unknown as { ɵcmp: { styles: string[] } })
        .ɵcmp.styles,
    );

    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('animation: none');
  });
});
