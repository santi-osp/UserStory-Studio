import DOMPurify from 'dompurify';

export const WORK_ITEM_CONTENT_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
] as const;

const INPUT_EQUIVALENT_TAGS = [
  ...WORK_ITEM_CONTENT_ALLOWED_TAGS,
  'b',
  'i',
] as const;

const INPUT_EQUIVALENT_TAG_SET = new Set<string>(INPUT_EQUIVALENT_TAGS);
const BLOCK_TAG_SET = new Set(['P', 'UL', 'OL']);
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;
const ESCAPED_TAG_PATTERN = /&lt;\s*\/?\s*([a-z][\w:-]*)\b[^&]*?&gt;/gi;

/**
 * Normaliza contenido editable a un subconjunto semántico compatible con Azure DevOps.
 * Los elementos no permitidos pierden el elemento, pero conservan su texto visible.
 */
export function normalizeWorkItemContentHtml(value: unknown): string {
  const rawValue = toText(value);
  if (!rawValue) {
    return '';
  }

  const decodedValue = decodeEscapedAllowedHtml(rawValue);
  const htmlInput = HTML_TAG_PATTERN.test(decodedValue)
    ? decodedValue
    : plainTextToParagraphs(decodedValue);
  const sanitized = String(
    DOMPurify.sanitize(htmlInput, {
      ALLOWED_TAGS: [...INPUT_EQUIVALENT_TAGS],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    }),
  ).trim();

  if (!sanitized) {
    return '';
  }

  if (!canUseDom()) {
    return normalizeWithoutDom(sanitized);
  }

  const template = document.createElement('template');
  template.innerHTML = sanitized;
  normalizeEquivalentElements(template.content);
  normalizeTopLevelContent(template.content);

  if (!hasVisibleContent(template.content)) {
    return '';
  }

  const wrapper = document.createElement('div');
  wrapper.append(template.content.cloneNode(true));
  return wrapper.innerHTML.trim();
}

/** Devuelve el texto visible del contenido después de aplicar el mismo contrato HTML. */
export function workItemContentHtmlToText(value: unknown): string {
  const normalized = normalizeWorkItemContentHtml(value);
  if (!normalized) {
    return '';
  }

  if (!canUseDom()) {
    return decodeCommonEntities(normalized.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  const template = document.createElement('template');
  template.innerHTML = normalized;
  return normalizedText(template.content.textContent ?? '');
}

/** Trata como vacío el HTML que solo contiene saltos, espacios o listas sin texto. */
export function isWorkItemContentHtmlEmpty(value: unknown): boolean {
  return workItemContentHtmlToText(value).length === 0;
}

function decodeEscapedAllowedHtml(value: string): string {
  const escapedTags = Array.from(value.matchAll(ESCAPED_TAG_PATTERN));
  if (
    escapedTags.length === 0 ||
    !escapedTags.every((match) =>
      INPUT_EQUIVALENT_TAG_SET.has(match[1].toLowerCase()),
    )
  ) {
    return value;
  }

  if (!canUseDom()) {
    return decodeCommonEntities(value);
  }

  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function normalizeEquivalentElements(parent: ParentNode): void {
  Array.from(parent.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = (node.textContent ?? '').replace(/\u00a0/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    let element = node as HTMLElement;
    if (element.tagName === 'B' || element.tagName === 'I') {
      const replacement = document.createElement(
        element.tagName === 'B' ? 'strong' : 'em',
      );
      while (element.firstChild) {
        replacement.append(element.firstChild);
      }
      element.replaceWith(replacement);
      element = replacement;
    }

    Array.from(element.attributes).forEach((attribute) =>
      element.removeAttribute(attribute.name),
    );
    normalizeEquivalentElements(element);
  });
}

function normalizeTopLevelContent(fragment: DocumentFragment): void {
  const normalized = document.createDocumentFragment();
  let paragraph: HTMLParagraphElement | null = null;

  const appendInlineNode = (node: Node): void => {
    paragraph ??= document.createElement('p');
    paragraph.append(node);
  };

  const flushParagraph = (): void => {
    if (!paragraph) {
      return;
    }
    normalized.append(paragraph);
    paragraph = null;
  };

  Array.from(fragment.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.length) {
        appendInlineNode(node);
      }
      return;
    }

    if (
      node.nodeType === Node.ELEMENT_NODE &&
      BLOCK_TAG_SET.has((node as HTMLElement).tagName)
    ) {
      flushParagraph();
      normalized.append(node);
      return;
    }

    appendInlineNode(node);
  });

  flushParagraph();
  fragment.replaceChildren(normalized);
}

function plainTextToParagraphs(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function normalizeWithoutDom(value: string): string {
  const normalized = value
    .replace(/<\s*b\s*>/gi, '<strong>')
    .replace(/<\s*\/\s*b\s*>/gi, '</strong>')
    .replace(/<\s*i\s*>/gi, '<em>')
    .replace(/<\s*\/\s*i\s*>/gi, '</em>')
    .replace(/<\s*(\/?)\s*(p|br|strong|em|ul|ol|li)\b[^>]*>/gi, '<$1$2>');
  const visibleText = decodeCommonEntities(normalized.replace(/<[^>]+>/g, ' '));
  return normalizedText(visibleText) ? normalized.trim() : '';
}

function hasVisibleContent(parent: ParentNode): boolean {
  return normalizedText(parent.textContent ?? '').length > 0;
}

function normalizedText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeCommonEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function canUseDom(): boolean {
  return typeof document !== 'undefined' && typeof Node !== 'undefined';
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}
