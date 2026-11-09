import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  it('renders the global feedback containers exactly once', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css('app-toast-container')).length,
    ).toBe(1);
    expect(
      fixture.debugElement.queryAll(By.css('app-confirm-dialog')).length,
    ).toBe(1);
  });

  it('exposes only the canonical Work Item routes in the main navigation', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const links = fixture.debugElement
      .queryAll(By.css('.sidebar-link'))
      .map((link) => link.attributes['href']);

    expect(links).toContain('/disenar-work-item');
    expect(links).toContain('/crear-desde-texto');
    expect(links).toContain('/previsualizar-work-item');
    expect(links).not.toContain('/armar-prompt');
    expect(links).not.toContain('/crear-json');
    expect(links).not.toContain('/preview-json');
  });
});
