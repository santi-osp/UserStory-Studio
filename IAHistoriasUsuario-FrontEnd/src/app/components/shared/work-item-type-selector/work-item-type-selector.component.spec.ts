import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { WORK_ITEM_TYPE_OPTIONS } from '../../../utils/work-item-type';
import { WorkItemTypeSelectorComponent } from './work-item-type-selector.component';
import { WorkItemDestinationControls } from '../../../models/work-item-generation-form';

describe('WorkItemTypeSelectorComponent', () => {
  let fixture: ComponentFixture<WorkItemTypeSelectorComponent>;
  let controls: WorkItemDestinationControls;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkItemTypeSelectorComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WorkItemTypeSelectorComponent);
    controls = {
      project: new FormControl<string | null>(''),
      areaPath: new FormControl<string | null>(''),
      iterationPath: new FormControl<string | null>(''),
      workItemType: new FormControl<string | null>('Feature'),
    };
    fixture.componentInstance.controls = controls;
    fixture.componentInstance.options = WORK_ITEM_TYPE_OPTIONS;
    fixture.detectChanges();
  });

  it('renders metadata and exposes Test Case compatibility without hardcoding the template', () => {
    expect(fixture.nativeElement.textContent).toContain('Tipo de Work Item');
    expect(fixture.nativeElement.textContent).toContain('Feature');
    expect(fixture.componentInstance.supportsTestCases).toBeFalse();
    fixture.componentInstance.control.setValue('User Story');
    expect(fixture.componentInstance.supportsTestCases).toBeTrue();
  });

  it('changes the parent control', () => {
    fixture.componentInstance.select(
      WORK_ITEM_TYPE_OPTIONS[0],
      new MouseEvent('mousedown'),
    );
    expect(fixture.componentInstance.control.value).toBe('Epic');
  });

  it('emits through the shared control and marks it dirty and touched', () => {
    const changed = jasmine.createSpy('changed');
    controls.workItemType.valueChanges.subscribe(changed);
    fixture.componentInstance.select(
      WORK_ITEM_TYPE_OPTIONS[1],
      new MouseEvent('mousedown'),
    );
    expect(changed).toHaveBeenCalledWith(WORK_ITEM_TYPE_OPTIONS[1].value);
    expect(controls.workItemType.dirty).toBeTrue();
    expect(controls.workItemType.touched).toBeTrue();
  });

  it('renders every configured option without adding User Story', () => {
    fixture.componentInstance.options = WORK_ITEM_TYPE_OPTIONS.filter(
      (option) => option.value !== 'User Story',
    );
    fixture.componentInstance.isOpen = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('User Story');
  });

  it('does not open while loading or disabled', () => {
    fixture.componentInstance.loading = true;
    fixture.componentInstance.toggle(new MouseEvent('click'));
    expect(fixture.componentInstance.isOpen).toBeFalse();
    fixture.componentInstance.loading = false;
    controls.workItemType.disable();
    fixture.componentInstance.toggle(new MouseEvent('click'));
    expect(fixture.componentInstance.isOpen).toBeFalse();
  });

  it('closes when focus interaction happens outside', () => {
    fixture.componentInstance.isOpen = true;
    fixture.componentInstance.onDocumentClick(new MouseEvent('click'));
    expect(fixture.componentInstance.isOpen).toBeFalse();
  });

  it('exposes loading and error states in the rendered selector', () => {
    fixture.componentInstance.loading = true;
    fixture.componentInstance.error = 'Error de catalogo';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Error de catalogo');
  });

  it('opens and closes after selecting an option', () => {
    fixture.componentInstance.toggle(new MouseEvent('click'));
    expect(fixture.componentInstance.isOpen).toBeTrue();
    fixture.componentInstance.select(
      WORK_ITEM_TYPE_OPTIONS[0],
      new MouseEvent('mousedown'),
    );
    expect(fixture.componentInstance.isOpen).toBeFalse();
  });

  it('reflects the selected option badge metadata', () => {
    expect(fixture.componentInstance.selected.value).toBe('Feature');
    expect(
      fixture.componentInstance.selected.badgeClasses.length,
    ).toBeGreaterThan(0);
  });

  it('generates an accessible list id from the input id', () => {
    fixture.componentInstance.inputId = 'shared-type';
    expect(fixture.componentInstance.listId).toBe('shared-type-options');
  });
});
