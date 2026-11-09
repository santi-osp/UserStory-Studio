export type SupportedWorkItemType = 'Epic' | 'Feature' | 'User Story';

export interface WorkItemTypeOption {
  value: SupportedWorkItemType;
  label: string;
  description: string;
  badgeClasses: string;
  activeCardClasses: string;
  inactiveCardClasses: string;
}

export const DEFAULT_WORK_ITEM_TYPE: SupportedWorkItemType = 'User Story';

export const WORK_ITEM_TYPE_OPTIONS: WorkItemTypeOption[] = [
  {
    value: 'Epic',
    label: 'Epica',
    description: 'Vista de alto nivel para objetivos amplios.',
    badgeClasses: 'border border-amber-300 bg-amber-100 text-amber-800',
    activeCardClasses: 'border-amber-400 bg-amber-50 text-amber-900',
    inactiveCardClasses: 'border-ink/20 bg-white text-ink',
  },
  {
    value: 'Feature',
    label: 'Feature',
    description: 'Capacidad funcional agrupadora de historias.',
    badgeClasses: 'border border-violet-300 bg-violet-100 text-violet-800',
    activeCardClasses: 'border-violet-400 bg-violet-50 text-violet-900',
    inactiveCardClasses: 'border-ink/20 bg-white text-ink',
  },
  {
    value: 'User Story',
    label: 'User Story',
    description: 'Unidad funcional implementable con detalle.',
    badgeClasses: 'border border-blue-300 bg-blue-100 text-blue-800',
    activeCardClasses: 'border-blue-400 bg-blue-50 text-blue-900',
    inactiveCardClasses: 'border-ink/20 bg-white text-ink',
  },
];

function normalizeType(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function resolveWorkItemType(value: unknown): SupportedWorkItemType {
  const normalized = normalizeType(value);

  if (normalized === 'epic') {
    return 'Epic';
  }

  if (normalized === 'feature') {
    return 'Feature';
  }

  return 'User Story';
}

export function requireSupportedWorkItemType(
  value: unknown,
): SupportedWorkItemType {
  const candidate = String(value ?? '').trim();
  if (
    candidate === 'Epic' ||
    candidate === 'Feature' ||
    candidate === 'User Story'
  ) {
    return candidate;
  }

  throw new Error(
    `El tipo de Work Item "${candidate || '(vacío)'}" no es válido para una solicitud de IA.`,
  );
}

export function getWorkItemTypeOption(value: unknown): WorkItemTypeOption {
  const resolved = resolveWorkItemType(value);
  return (
    WORK_ITEM_TYPE_OPTIONS.find((option) => option.value === resolved) ??
    WORK_ITEM_TYPE_OPTIONS[2]
  );
}

export function supportsTestCasesForWorkItemType(value: unknown): boolean {
  return resolveWorkItemType(value) === 'User Story';
}
