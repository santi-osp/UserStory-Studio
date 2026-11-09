import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FeedbackMessageComponent } from './feedback-message.component';

describe('FeedbackMessageComponent', () => {
  let fixture: ComponentFixture<FeedbackMessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedbackMessageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedbackMessageComponent);
  });

  it('should hide empty messages', () => {
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ui-feedback'))).toBeNull();
  });

  it('should expose errors as assertive alerts', () => {
    fixture.componentRef.setInput('message', 'Fallo de validacion');
    fixture.componentRef.setInput('tone', 'error');
    fixture.detectChanges();

    const message = fixture.debugElement.query(By.css('.ui-feedback-error'));
    expect(message.attributes['role']).toBe('alert');
    expect(message.attributes['aria-live']).toBe('assertive');
  });

  it('should expose loading messages as busy polite status', () => {
    fixture.componentRef.setInput('message', 'Cargando información');
    fixture.componentRef.setInput('tone', 'loading');
    fixture.detectChanges();

    const message = fixture.debugElement.query(By.css('.ui-feedback-loading'));
    expect(message.attributes['role']).toBe('status');
    expect(message.attributes['aria-live']).toBe('polite');
    expect(message.attributes['aria-busy']).toBe('true');
    expect(message.query(By.css('app-loading-spinner'))).not.toBeNull();
  });
});
