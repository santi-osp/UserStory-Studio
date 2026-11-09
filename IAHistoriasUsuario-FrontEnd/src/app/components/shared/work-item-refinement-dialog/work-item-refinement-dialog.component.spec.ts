import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { WorkItemRefinementDialogComponent } from './work-item-refinement-dialog.component';

describe('WorkItemRefinementDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkItemRefinementDialogComponent],
    }).compileComponents();
  });

  it('blocks the form and focuses the dialog while metadata is loading', fakeAsync(() => {
    const fixture = TestBed.createComponent(WorkItemRefinementDialogComponent);
    fixture.componentInstance.availableFields = [];
    fixture.componentInstance.preparing = true;
    fixture.detectChanges();
    tick();

    const dialog = fixture.nativeElement.querySelector(
      '[role="dialog"]',
    ) as HTMLElement;
    const cancel = fixture.nativeElement.querySelector(
      '.refinement-footer .btn-muted',
    ) as HTMLButtonElement;

    expect(fixture.componentInstance.form.disabled).toBeTrue();
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('[role="tab"]'),
    );
    expect(dialog.textContent).toContain('Preparando el refinamiento');
    expect(cancel.disabled).toBeFalse();
  }));

  it('retries without clearing the instructions already entered', () => {
    const fixture = TestBed.createComponent(WorkItemRefinementDialogComponent);
    const component = fixture.componentInstance;
    component.availableFields = ['title', 'description'];
    component.form.controls.contentInstructions.setValue(
      'Conservar esta indicacion',
    );
    component.preparationError = 'No fue posible validar la metadata.';
    fixture.detectChanges();
    spyOn(component.retryRequested, 'emit');

    component.retry();
    component.preparing = true;

    expect(component.retryRequested.emit).toHaveBeenCalled();
    expect(component.form.controls.contentInstructions.value).toBe(
      'Conservar esta indicacion',
    );
    expect(component.form.disabled).toBeTrue();
  });

  it('allows Escape during preparation and returns focus after closing', fakeAsync(() => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const fixture = TestBed.createComponent(WorkItemRefinementDialogComponent);
    const component = fixture.componentInstance;
    component.preparing = true;
    fixture.detectChanges();
    tick();
    spyOn(component.cancelled, 'emit');

    component.onDocumentKeydown(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    expect(component.cancelled.emit).toHaveBeenCalled();

    fixture.destroy();
    tick();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  }));

  it('keeps independent instructions when switching scopes', () => {
    const fixture = TestBed.createComponent(WorkItemRefinementDialogComponent);
    const component = fixture.componentInstance;
    component.availableFields = ['title'];
    component.testCases = [
      {
        title: 'Caso A',
        state: 'Ready',
        steps: [{ action: 'A', expected: 'E' }],
      },
    ];
    component.form.controls.contentInstructions.setValue('Mejorar contenido');
    component.selectScope('testCases');
    component.form.controls.testCaseInstructions.setValue('Mejorar pasos');
    component.selectScope('content');

    expect(component.form.controls.contentInstructions.value).toBe(
      'Mejorar contenido',
    );
    expect(component.form.controls.testCaseInstructions.value).toBe(
      'Mejorar pasos',
    );
  });

  it('preserves selection across search and submits only selected cases with stable refs', () => {
    const fixture = TestBed.createComponent(WorkItemRefinementDialogComponent);
    const component = fixture.componentInstance;
    component.availableFields = ['title'];
    component.testCases = [
      {
        title: 'Login',
        state: 'Ready',
        steps: [{ action: 'A1', expected: 'E1' }],
      },
      {
        title: 'Pago',
        state: 'Design',
        steps: [{ action: 'A2', expected: 'E2' }],
      },
    ];
    component.selectScope('testCases');
    component.toggleTestCase('tc-2');
    component.form.controls.search.setValue('Login');
    component.form.controls.testCaseInstructions.setValue('Hacer verificable');
    spyOn(component.submitted, 'emit');

    component.submit();

    expect(component.selectedTestCaseCount).toBe(1);
    expect(component.submitted.emit).toHaveBeenCalledWith(
      jasmine.objectContaining({
        scope: 'testCases',
        mode: 'improve',
        instructions: 'Hacer verificable',
        selectedTestCases: [
          jasmine.objectContaining({ ref: 'tc-2', position: 1, title: 'Pago' }),
        ],
      }),
    );
  });

  it('requires selection and trimmed instructions for Test Cases', () => {
    const fixture = TestBed.createComponent(WorkItemRefinementDialogComponent);
    const component = fixture.componentInstance;
    component.testCases = [
      {
        title: 'Caso',
        state: 'Ready',
        steps: [{ action: 'A', expected: 'E' }],
      },
    ];
    component.selectScope('testCases');
    component.form.controls.testCaseInstructions.setValue('   ');

    expect(component.canSubmit).toBeFalse();
    component.toggleTestCase('tc-1');
    expect(component.canSubmit).toBeFalse();
    component.form.controls.testCaseInstructions.setValue(
      'Regenerar escenario',
    );
    expect(component.canSubmit).toBeTrue();
  });

  it('renders accessible exclusive tabs, state and step metadata, and a labelled close action', () => {
    const fixture = TestBed.createComponent(WorkItemRefinementDialogComponent);
    fixture.componentInstance.availableFields = ['title'];
    fixture.componentInstance.testCases = [
      {
        title: 'Validar compra',
        state: 'Ready',
        steps: [{ action: 'Comprar', expected: 'Confirmacion' }],
      },
    ];
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    const dialog = fixture.nativeElement.querySelector(
      '[role="dialog"]',
    ) as HTMLElement;
    const close = fixture.nativeElement.querySelector(
      '[aria-label="Cerrar refinamiento"]',
    );
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(close).not.toBeNull();

    fixture.componentInstance.selectScope('testCases');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ready · 1 paso');
  });

  it('submits regenerate as an exclusive Test Case mode', () => {
    const fixture = TestBed.createComponent(WorkItemRefinementDialogComponent);
    const component = fixture.componentInstance;
    component.testCases = [
      {
        title: 'Caso',
        state: 'Ready',
        steps: [{ action: 'A', expected: 'E' }],
      },
    ];
    component.selectScope('testCases');
    component.toggleTestCase('tc-1');
    component.form.controls.testCaseMode.setValue('regenerate');
    component.form.controls.testCaseInstructions.setValue(
      'Crear otro escenario',
    );
    spyOn(component.submitted, 'emit');

    component.submit();

    expect(component.submitted.emit).toHaveBeenCalledWith(
      jasmine.objectContaining({
        scope: 'testCases',
        mode: 'regenerate',
      }),
    );
  });
});
