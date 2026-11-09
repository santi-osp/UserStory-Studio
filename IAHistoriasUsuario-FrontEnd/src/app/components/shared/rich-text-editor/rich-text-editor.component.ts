import {
  Component,
  forwardRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  Blur,
  ContentChange,
  QuillEditorComponent,
  SelectionChange,
} from 'ngx-quill';
import { QuillModules } from 'ngx-quill/config';
import Quill from 'quill';
import { normalizeWorkItemContentHtml } from '../../../utils/work-item-content-html';

type InlineFormat = 'bold' | 'italic';
type ListFormat = 'bullet' | 'ordered';
export type RichTextEditorLayoutMode = 'contained' | 'auto-grow';

let richTextEditorId = 0;

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [QuillEditorComponent],
  templateUrl: './rich-text-editor.component.html',
  styleUrl: './rich-text-editor.component.scss',
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    },
  ],
  host: {
    '[style.--rich-text-editor-min-height]': 'minHeight',
    '[class.rich-text-editor-host--auto-grow]': "layoutMode === 'auto-grow'",
  },
})
export class RichTextEditorComponent
  implements ControlValueAccessor, OnChanges, OnDestroy
{
  @Input() inputId = `rich-text-editor-${++richTextEditorId}`;
  @Input() label = '';
  @Input() placeholder = '';
  @Input() required = false;
  @Input() invalid = false;
  @Input() errorMessage = 'Campo requerido.';
  @Input() minHeight = '12.5rem';
  @Input() layoutMode: RichTextEditorLayoutMode = 'contained';
  @Input() showRequiredIndicator = true;

  readonly formats = ['bold', 'italic', 'list'];
  readonly modules: QuillModules = {
    toolbar: false,
    history: {
      delay: 800,
      maxStack: 100,
      userOnly: true,
    },
  };

  isDisabled = false;
  activeBold = false;
  activeItalic = false;
  activeBulletList = false;
  activeOrderedList = false;
  canUndo = false;
  canRedo = false;

  private editor: Quill | null = null;
  private value = '';
  private destroyed = false;
  private removeNativeListeners: (() => void)[] = [];
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['inputId'] ||
      changes['label'] ||
      changes['required'] ||
      changes['invalid'] ||
      changes['errorMessage']
    ) {
      this.syncEditorAccessibility();
    }
  }

  writeValue(value: unknown): void {
    const normalized = normalizeWorkItemContentHtml(value);
    this.value = normalized;
    this.applyExternalValue(normalized);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    this.editor?.enable(!isDisabled);
    this.refreshToolbarState();
    this.syncEditorAccessibility();
  }

  handleEditorCreated(editor: Quill): void {
    this.editor = editor;
    this.editor.enable(!this.isDisabled);
    this.installNativeContentGuards(editor);
    this.syncEditorAccessibility();
    this.applyExternalValue(this.value, true);
    this.refreshToolbarState();
  }

  handleContentChanged(change: ContentChange): void {
    if (change.source !== 'user') {
      return;
    }

    const normalized = normalizeWorkItemContentHtml(
      change.editor.getSemanticHTML(),
    );
    if (normalized !== this.value) {
      this.value = normalized;
      this.onChange(normalized);
    }
    this.refreshToolbarState();
  }

  handleSelectionChanged(change: SelectionChange): void {
    this.refreshToolbarState(change.range);
  }

  handleBlur(_event: Blur): void {
    this.onTouched();
    this.refreshToolbarState(null);
  }

  preserveEditorSelection(event: MouseEvent): void {
    if (!this.isDisabled) {
      event.preventDefault();
    }
  }

  toggleInlineFormat(format: InlineFormat): void {
    if (!this.editor || this.isDisabled) {
      return;
    }

    const currentFormat = this.editor.getFormat(
      this.editor.getSelection(true) ?? undefined,
    );
    this.editor.format(format, !currentFormat[format], 'user');
    this.editor.focus();
    this.refreshToolbarState();
  }

  toggleList(format: ListFormat): void {
    if (!this.editor || this.isDisabled) {
      return;
    }

    const currentFormat = this.editor.getFormat(
      this.editor.getSelection(true) ?? undefined,
    );
    this.editor.format(
      'list',
      currentFormat['list'] === format ? false : format,
      'user',
    );
    this.editor.focus();
    this.refreshToolbarState();
  }

  undo(): void {
    if (!this.editor || this.isDisabled || !this.canUndo) {
      return;
    }
    this.editor.history.undo();
    this.refreshToolbarAfterCommand();
  }

  redo(): void {
    if (!this.editor || this.isDisabled || !this.canRedo) {
      return;
    }
    this.editor.history.redo();
    this.refreshToolbarAfterCommand();
  }

  clearFormat(): void {
    if (!this.editor || this.isDisabled) {
      return;
    }

    const range = this.editor.getSelection(true);
    if (!range || range.length === 0) {
      return;
    }

    this.editor.removeFormat(range.index, range.length, 'user');
    this.editor.setSelection(range.index, range.length, 'silent');
    this.editor.focus();
    this.refreshToolbarState(range);
  }

  focus(): void {
    this.editor?.focus();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.removeNativeListeners.forEach((removeListener) => removeListener());
    this.removeNativeListeners = [];
    this.editor = null;
  }

  private applyExternalValue(value: string, force = false): void {
    if (!this.editor) {
      return;
    }

    const currentValue = normalizeWorkItemContentHtml(
      this.editor.getSemanticHTML(),
    );
    if (!force && currentValue === value) {
      return;
    }

    this.editor.clipboard.dangerouslyPasteHTML(value, 'silent');
    this.editor.history.clear();
    this.refreshToolbarState();
  }

  private installNativeContentGuards(editor: Quill): void {
    this.removeNativeListeners.forEach((removeListener) => removeListener());
    this.removeNativeListeners = [];

    const pasteListener = (event: ClipboardEvent): void =>
      this.handlePaste(event);
    const dropListener = (event: DragEvent): void => this.handleDrop(event);
    editor.root.addEventListener('paste', pasteListener, true);
    editor.root.addEventListener('drop', dropListener, true);
    this.removeNativeListeners.push(
      () => editor.root.removeEventListener('paste', pasteListener, true),
      () => editor.root.removeEventListener('drop', dropListener, true),
    );
  }

  private handlePaste(event: ClipboardEvent): void {
    if (!this.editor || this.isDisabled) {
      return;
    }

    const clipboard = event.clipboardData;
    const source =
      clipboard?.getData('text/html') || clipboard?.getData('text/plain') || '';
    const sanitized = normalizeWorkItemContentHtml(source);
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!sanitized) {
      return;
    }

    const range = this.editor.getSelection(true);
    if (!range) {
      return;
    }

    this.editor.history.cutoff();
    if (range.length > 0) {
      this.editor.deleteText(range.index, range.length, 'user');
    }
    this.editor.clipboard.dangerouslyPasteHTML(range.index, sanitized, 'user');
    this.editor.history.cutoff();
    this.editor.focus();
    this.refreshToolbarAfterCommand();
  }

  private handleDrop(event: DragEvent): void {
    const transfer = event.dataTransfer;
    const containsFile = (transfer?.files.length ?? 0) > 0;
    const containsImageHtml = /<img\b/i.test(
      transfer?.getData('text/html') ?? '',
    );
    if (containsFile || containsImageHtml) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  private refreshToolbarAfterCommand(): void {
    Promise.resolve().then(() => {
      if (!this.destroyed) {
        this.refreshToolbarState();
      }
    });
  }

  private refreshToolbarState(
    range = this.editor?.getSelection() ?? null,
  ): void {
    if (!this.editor || this.isDisabled) {
      this.resetActiveFormats();
      this.canUndo = false;
      this.canRedo = false;
      return;
    }

    const format = range ? this.editor.getFormat(range) : {};
    this.activeBold = !!format['bold'];
    this.activeItalic = !!format['italic'];
    this.activeBulletList = format['list'] === 'bullet';
    this.activeOrderedList = format['list'] === 'ordered';
    this.canUndo = this.editor.history.stack.undo.length > 0;
    this.canRedo = this.editor.history.stack.redo.length > 0;
  }

  private resetActiveFormats(): void {
    this.activeBold = false;
    this.activeItalic = false;
    this.activeBulletList = false;
    this.activeOrderedList = false;
  }

  private syncEditorAccessibility(): void {
    if (!this.editor) {
      return;
    }

    const root = this.editor.root;
    root.id = this.inputId;
    root.setAttribute('role', 'textbox');
    root.setAttribute('aria-multiline', 'true');
    root.setAttribute('aria-label', this.label);
    root.setAttribute('aria-invalid', String(this.invalid));
    root.setAttribute('aria-required', String(this.required));
    root.setAttribute('aria-disabled', String(this.isDisabled));
    if (this.invalid) {
      root.setAttribute('aria-describedby', `${this.inputId}-error`);
    } else {
      root.removeAttribute('aria-describedby');
    }
  }
}
