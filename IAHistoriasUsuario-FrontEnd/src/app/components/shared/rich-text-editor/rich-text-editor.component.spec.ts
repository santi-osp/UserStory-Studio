import { ComponentFixture, TestBed } from '@angular/core/testing';
import Quill from 'quill';
import { RichTextEditorComponent } from './rich-text-editor.component';

describe('RichTextEditorComponent', () => {
  let fixture: ComponentFixture<RichTextEditorComponent>;
  let component: RichTextEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RichTextEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RichTextEditorComponent);
    component = fixture.componentInstance;
    component.label = 'Descripción';
    component.inputId = 'editor-test';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function editor(): Quill {
    return (component as unknown as { editor: Quill }).editor;
  }

  it('renders valid HTML visually instead of displaying its tags', () => {
    component.writeValue(
      '<p>Como usuario <strong>necesito</strong> valor.</p>',
    );
    fixture.detectChanges();

    const root = fixture.nativeElement.querySelector(
      '.ql-editor',
    ) as HTMLElement;
    expect(root.textContent).toContain('Como usuario necesito valor.');
    expect(root.textContent).not.toContain('<p>');
    expect(root.querySelector('strong')?.textContent).toBe('necesito');
  });

  it('renders escaped allowed HTML as the same visual content', () => {
    component.writeValue('&lt;p&gt;Contenido escapado&lt;/p&gt;');
    fixture.detectChanges();

    const root = fixture.nativeElement.querySelector(
      '.ql-editor',
    ) as HTMLElement;
    expect(root.textContent).toBe('Contenido escapado');
    expect(root.textContent).not.toContain('&lt;p&gt;');
  });

  it('does not emit a form change while writeValue applies external content', () => {
    const onChange = jasmine.createSpy('onChange');
    component.registerOnChange(onChange);

    component.writeValue('<p>Valor externo</p>');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits normalized HTML for a user edit', () => {
    const onChange = jasmine.createSpy('onChange');
    component.registerOnChange(onChange);

    editor().insertText(0, 'Texto del usuario', 'user');

    expect(onChange).toHaveBeenCalledWith('<p>Texto del usuario</p>');
  });

  it('removes links and images from content while preserving visible text', () => {
    const onChange = jasmine.createSpy('onChange');
    component.registerOnChange(onChange);

    editor().clipboard.dangerouslyPasteHTML(
      '<p>Consulta <a href="https://example.com">la guía</a><img src="x"></p>',
      'user',
    );

    const emitted = onChange.calls.mostRecent().args[0] as string;
    expect(emitted).toContain('Consulta la guía');
    expect(emitted).not.toContain('<a');
    expect(emitted).not.toContain('href');
    expect(emitted).not.toContain('<img');
  });

  it('emits the canonical Quill HTML used by the backend allowlist', () => {
    const onChange = jasmine.createSpy('onChange');
    component.registerOnChange(onChange);

    editor().setContents(
      [
        { insert: 'Texto ' },
        { insert: 'negrita', attributes: { bold: true } },
        { insert: ' y ' },
        { insert: 'cursiva', attributes: { italic: true } },
        { insert: '\n' },
        { insert: 'Primero' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'Segundo' },
        { insert: '\n', attributes: { list: 'bullet' } },
      ],
      'user',
    );

    const emitted = onChange.calls.mostRecent().args[0] as string;
    expect(emitted).toContain('<strong>negrita</strong>');
    expect(emitted).toContain('<em>cursiva</em>');
    expect(emitted).toContain('<ol><li>Primero</li></ol>');
    expect(emitted).toContain('<ul><li>Segundo</li></ul>');
    expect(emitted).not.toMatch(/\s(?:class|style|data-|on\w+)=/i);
  });

  it('disables editing and every toolbar action without hiding content', () => {
    component.writeValue('<p>Contenido legible</p>');
    component.setDisabledState(true);
    fixture.detectChanges();

    const root = fixture.nativeElement.querySelector(
      '.ql-editor',
    ) as HTMLElement;
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.rich-text-editor__toolbar-button',
      ),
    ) as HTMLButtonElement[];
    expect(root.getAttribute('contenteditable')).toBe('false');
    expect(root.textContent).toContain('Contenido legible');
    expect(buttons.every((button) => button.disabled)).toBeTrue();
  });

  it('marks the control as touched on blur', () => {
    const onTouched = jasmine.createSpy('onTouched');
    component.registerOnTouched(onTouched);

    component.handleBlur({} as never);

    expect(onTouched).toHaveBeenCalledTimes(1);
  });

  it('exposes only the required seven toolbar actions and no link action', () => {
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.rich-text-editor__toolbar-button',
      ),
    ).map((button) => (button as HTMLButtonElement).getAttribute('aria-label'));

    expect(labels).toEqual([
      'Negrita',
      'Cursiva',
      'Lista con viñetas',
      'Lista numerada',
      'Deshacer',
      'Rehacer',
      'Limpiar formato',
    ]);
    expect(fixture.nativeElement.querySelector('.ql-link')).toBeNull();
  });

  it('uses the local Quill history for undo and redo', async () => {
    editor().insertText(0, 'Cambio', 'user');
    expect(component.canUndo).toBeTrue();

    component.undo();
    await Promise.resolve();
    expect(editor().getText().trim()).toBe('');
    expect(component.canRedo).toBeTrue();

    component.redo();
    await Promise.resolve();
    expect(editor().getText().trim()).toBe('Cambio');
  });

  it('removes native paste and drop guards when destroyed', () => {
    const root = editor().root;
    const removeListener = spyOn(root, 'removeEventListener').and.callThrough();

    fixture.destroy();

    expect(removeListener).toHaveBeenCalledWith(
      'paste',
      jasmine.any(Function),
      true,
    );
    expect(removeListener).toHaveBeenCalledWith(
      'drop',
      jasmine.any(Function),
      true,
    );
  });

  it('keeps contained layout as the default for existing consumers', () => {
    expect(component.layoutMode).toBe('contained');
    expect(fixture.nativeElement.classList).not.toContain(
      'rich-text-editor-host--auto-grow',
    );
  });

  it('enables CSS-only auto-grow layout without changing editor formats', () => {
    component.layoutMode = 'auto-grow';
    fixture.detectChanges();
    expect(fixture.nativeElement.classList).toContain(
      'rich-text-editor-host--auto-grow',
    );
    expect(component.formats).toEqual(['bold', 'italic', 'list']);
  });

  it('hides the visual required indicator without removing ARIA required', () => {
    component.required = true;
    component.showRequiredIndicator = false;
    component.ngOnChanges({ required: {} as never });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.rich-text-field__required'),
    ).toBeNull();
    expect(editor().root.getAttribute('aria-required')).toBe('true');
  });
});
