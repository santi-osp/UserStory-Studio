import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PageHeaderComponent } from './page-header.component';

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<PageHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PageHeaderComponent);
    fixture.componentRef.setInput('title', 'Titulo del modulo');
    fixture.componentRef.setInput('subtitle', 'Descripcion compartida');
    fixture.detectChanges();
  });

  it('should render the module title and subtitle', () => {
    expect(
      fixture.debugElement.query(By.css('.page-title')).nativeElement
        .textContent,
    ).toContain('Titulo del modulo');
    expect(
      fixture.debugElement.query(By.css('.page-subtitle')).nativeElement
        .textContent,
    ).toContain('Descripcion compartida');
  });
});
