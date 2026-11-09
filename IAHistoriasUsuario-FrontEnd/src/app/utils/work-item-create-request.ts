import {
  CreateWorkItemRequest,
  WorkItemFieldConfig,
  WorkItemPayload,
} from '../models/types';
import { normalizeAzdoPath } from './azdo-path';
import { normalizeWorkItemFieldLookup } from './work-item-dynamic-fields';
import { shouldIncludeAcceptanceCriteria } from './work-item-content-metadata';
import { supportsTestCasesForWorkItemType } from './work-item-type';

const BASE_FIELD_KEYS = new Set(['title', 'description', 'acceptancecriteria']);
const CANONICAL_REFERENCE_PREFIXES = ['system.', 'microsoft.', 'custom.'];
const LEGACY_ALIAS_CANDIDATES_BY_REFERENCE = new Map<string, string[]>([
  ['microsoft.vsts.common.priority', ['priority']],
  ['microsoft.vsts.common.backlogpriority', ['priority']],
  ['microsoft.vsts.common.risk', ['risk']],
  ['microsoft.vsts.common.severity', ['risk']],
  ['microsoft.vsts.common.valuearea', ['valueArea']],
  ['microsoft.vsts.common.businessvalue', ['businessValue']],
  ['microsoft.vsts.scheduling.storypoints', ['storyPoints']],
  ['microsoft.vsts.scheduling.effort', ['storyPoints', 'effort']],
  ['microsoft.vsts.scheduling.startdate', ['startDate']],
  ['microsoft.vsts.scheduling.finishdate', ['finishDate']],
  ['system.assignedto', ['assignedTo']],
  ['custom.tipohu', ['tipoHU']],
  ['custom.frentedetrabajo', ['frenteDeTrabajo']],
  ['custom.frentetrabajo', ['frenteDeTrabajo']],
]);

export function buildCreateWorkItemRequest(
  payload: WorkItemPayload,
  fields: WorkItemFieldConfig[],
): CreateWorkItemRequest {
  const supportsTestCases = supportsTestCasesForWorkItemType(
    payload.workItemType || 'User Story',
  );
  const fieldByLookup = buildFieldLookup(fields);
  const hu: Record<string, unknown> = {};

  setBaseField(hu, 'title', payload.workItem.title);
  setBaseField(hu, 'description', payload.workItem.description);
  if (shouldIncludeAcceptanceCriteria(fields, payload.workItem)) {
    setBaseField(hu, 'acceptanceCriteria', payload.workItem.acceptanceCriteria);
  }

  for (const [rawKey, rawValue] of Object.entries(payload.workItem)) {
    if (BASE_FIELD_KEYS.has(normalizeWorkItemFieldLookup(rawKey))) {
      continue;
    }

    const field = fieldByLookup.get(normalizeWorkItemFieldLookup(rawKey));
    const referenceName =
      field?.referenceName?.trim() || resolveCanonicalReferenceName(rawKey);
    if (!referenceName || !isAllowedReferenceName(referenceName)) {
      continue;
    }

    const normalizedValue = normalizeCreateFieldValue(
      rawValue,
      field,
      referenceName,
    );
    if (normalizedValue === undefined) {
      continue;
    }

    hu[referenceName] = normalizedValue;
  }

  return {
    azdoOrg: payload.azdoOrg.trim(),
    azdoProject: payload.azdoProject.trim(),
    workItemType: payload.workItemType?.trim() || 'User Story',
    iterationPath: normalizeCreatePath(payload.iterationPath, 'iteration'),
    areaPath: normalizeCreatePath(payload.areaPath, 'area'),
    hu,
    testCases: supportsTestCases ? (payload.testCases ?? []) : [],
    testSuite: {
      planId: supportsTestCases ? Number(payload.testSuite?.planId ?? 0) : 0,
    },
  };
}

export function normalizeCreateDateTime(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
  }

  const localDateTimeMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (localDateTimeMatch) {
    const [, year, month, day, hour, minute, second = '0'] = localDateTimeMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0,
    ).toISOString();
  }

  if (hasExplicitOffsetOrUtc(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        `El campo de fecha '${trimmed}' no tiene un formato valido.`,
      );
    }

    return parsed.toISOString();
  }

  throw new Error(
    `La fecha '${trimmed}' requiere hora local valida, offset explicito o UTC.`,
  );
}

function buildFieldLookup(
  fields: WorkItemFieldConfig[],
): Map<string, WorkItemFieldConfig> {
  const result = new Map<string, WorkItemFieldConfig>();

  for (const field of fields) {
    const candidates = [
      field.referenceName,
      field.name,
      field.label,
      lastReferenceSegment(field.referenceName),
      camelCase(lastReferenceSegment(field.referenceName)),
      ...(LEGACY_ALIAS_CANDIDATES_BY_REFERENCE.get(
        field.referenceName.trim().toLowerCase(),
      ) ?? []),
    ];

    for (const candidate of candidates) {
      const lookup = normalizeWorkItemFieldLookup(candidate ?? '');
      if (lookup && !result.has(lookup)) {
        result.set(lookup, field);
      }
    }
  }

  return result;
}

function setBaseField(
  hu: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const normalized = normalizeScalarValue(value);
  if (normalized !== undefined) {
    hu[key] = normalized;
  }
}

function normalizeCreateFieldValue(
  value: unknown,
  field: WorkItemFieldConfig | undefined,
  referenceName: string,
): unknown {
  const normalized = normalizeScalarValue(value);
  if (normalized === undefined) {
    return undefined;
  }

  if (isDateField(field, referenceName)) {
    return normalizeCreateDateTime(normalized);
  }

  return normalized;
}

function normalizeScalarValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return value;
}

function normalizeCreatePath(
  value: unknown,
  kind: 'area' | 'iteration',
): string {
  return normalizeAzdoPath(value, kind).replace(/\\/g, '/');
}

function isDateField(
  field: WorkItemFieldConfig | undefined,
  referenceName: string,
): boolean {
  const candidates = [
    referenceName,
    field?.referenceName,
    field?.name,
    field?.label,
    field?.type,
    field?.control,
  ];

  return candidates
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .some((candidate) =>
      normalizeWorkItemFieldLookup(candidate).includes('date'),
    );
}

function resolveCanonicalReferenceName(key: string): string {
  const trimmed = key.trim();
  const lower = trimmed.toLowerCase();
  return CANONICAL_REFERENCE_PREFIXES.some((prefix) => lower.startsWith(prefix))
    ? trimmed
    : '';
}

function isAllowedReferenceName(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return CANONICAL_REFERENCE_PREFIXES.some((prefix) =>
    lower.startsWith(prefix),
  );
}

function hasExplicitOffsetOrUtc(value: string): boolean {
  return /z$/i.test(value) || /[+-]\d{2}:\d{2}$/.test(value);
}

function lastReferenceSegment(referenceName: string): string {
  const trimmed = referenceName.trim();
  return trimmed.includes('.')
    ? trimmed.slice(trimmed.lastIndexOf('.') + 1)
    : trimmed;
}

function camelCase(value: string): string {
  const tokens = value
    .split(/[\s._/-]+/)
    .map((token) => token.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((token) => !!token);

  return tokens
    .map((token, index) => {
      const normalized = token.charAt(0).toUpperCase() + token.slice(1);
      return index === 0
        ? normalized.charAt(0).toLowerCase() + normalized.slice(1)
        : normalized;
    })
    .join('');
}
