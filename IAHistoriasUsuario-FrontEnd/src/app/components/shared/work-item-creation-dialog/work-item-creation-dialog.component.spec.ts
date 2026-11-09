import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkItemCreationDialogState } from '../../../models/work-item-creation-preflight';
import { WorkItemCreationDialogComponent } from './work-item-creation-dialog.component';

describe('WorkItemCreationDialogComponent', () => {
  let fixture: ComponentFixture<WorkItemCreationDialogComponent>;
  let component: WorkItemCreationDialogComponent;

  const state = (
    phase: WorkItemCreationDialogState['phase'],
  ): WorkItemCreationDialogState => ({
    phase,
    summary: {
      organization: 'Org',
      project: 'Proyecto',
      workItemType: 'User Story',
      areaPath: 'Área',
      iterationPath: 'Sprint',
      title: 'Historia',
      testCaseCount: 2,
      testPlanId: 10,
    },
    message:
      phase === 'preparing'
        ? 'Validando la información de Azure DevOps…'
        : 'La información está lista para crear el Work Item.',
    error: '',
    issues: [],
    warnings: [],
    result: null,
    ambiguousRetry: false,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkItemCreationDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WorkItemCreationDialogComponent);
    component = fixture.componentInstance;
    component.state = state('preparing');
    fixture.detectChanges();
  });

  it('announces preparation and disables creation until preflight is ready', () => {
    const dialog = fixture.nativeElement.querySelector(
      '[role="dialog"]',
    ) as HTMLElement;
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain(
      'Validando la información de Azure DevOps…',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'Crear en Azure DevOpsCrear en Azure DevOps',
    );
    expect(fixture.nativeElement.querySelectorAll('.btn-primary').length).toBe(
      0,
    );
  });

  it('emits one explicit confirmation only in the ready state', () => {
    const confirmed = spyOn(component.confirmed, 'emit');
    component.requestPrimary();
    expect(confirmed).not.toHaveBeenCalled();

    component.state = state('ready');
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.btn-primary') as HTMLButtonElement
    ).click();
    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it('blocks backdrop and Escape closing while creation is in progress', () => {
    const closed = spyOn(component.closed, 'emit');
    component.state = state('creating');
    fixture.detectChanges();

    component.requestClose();
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).not.toHaveBeenCalled();
    expect(
      (
        fixture.nativeElement.querySelector(
          '.creation-dialog-close',
        ) as HTMLButtonElement
      ).disabled,
    ).toBeTrue();
  });

  it('offers retry for a recoverable preflight error', () => {
    const retried = spyOn(component.retryRequested, 'emit');
    component.state = { ...state('error'), error: 'Metadata no disponible' };
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Reintentar validación',
    );
    (
      fixture.nativeElement.querySelector('.btn-primary') as HTMLButtonElement
    ).click();
    expect(retried).toHaveBeenCalledTimes(1);
  });
});
