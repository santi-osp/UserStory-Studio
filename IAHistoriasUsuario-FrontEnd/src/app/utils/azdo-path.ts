export type AzdoPathKind = 'iteration' | 'area';

const ITERATION_ROOT_SEGMENTS = new Set(['iteration', 'iterations']);
const AREA_ROOT_SEGMENTS = new Set(['area', 'areas']);

function shouldStripSegment(segment: string, kind?: AzdoPathKind): boolean {
  const normalized = segment.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (kind === 'iteration') {
    return ITERATION_ROOT_SEGMENTS.has(normalized);
  }

  if (kind === 'area') {
    return AREA_ROOT_SEGMENTS.has(normalized);
  }

  return (
    ITERATION_ROOT_SEGMENTS.has(normalized) ||
    AREA_ROOT_SEGMENTS.has(normalized)
  );
}

function stripClassificationRootSegments(
  segments: string[],
  kind?: AzdoPathKind,
): string[] {
  let cleaned = segments.filter((segment) => !!segment);
  if (cleaned.length === 0) {
    return cleaned;
  }

  if (cleaned.length > 1 && shouldStripSegment(cleaned[0], kind)) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.length > 1 && shouldStripSegment(cleaned[1], kind)) {
    cleaned = [cleaned[0], ...cleaned.slice(2)];
  }

  return cleaned;
}

export function normalizeAzdoPath(value: unknown, kind?: AzdoPathKind): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed
    .replace(/[\\/]+/g, '\\')
    .replace(/^\\+/, '')
    .replace(/\\+$/, '');

  const segments = normalized
    .split('\\')
    .map((segment) => segment.trim())
    .filter((segment) => !!segment);

  return stripClassificationRootSegments(segments, kind).join('\\');
}

export function formatAzdoPathLabel(
  value: unknown,
  kind?: AzdoPathKind,
): string {
  return normalizeAzdoPath(value, kind).replace(/\\/g, ' / ');
}
