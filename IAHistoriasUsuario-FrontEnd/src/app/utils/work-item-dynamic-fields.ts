import { FormControl, FormGroup, Validators } from '@angular/forms';
import { WorkItemFieldConfig, WorkItemPayload } from '../models/types';
import {
  resolveWorkItemType,
  supportsTestCasesForWorkItemType,
} from './work-item-type';
import {
  hasOwnContentField,
  resolveWorkItemContentCapability,
} from './work-item-content-metadata';

export const BUILDER_DYNAMIC_CONTROL_PREFIX = 'workItemDynamic__';
export const WORK_ITEM_JSON_DYNAMIC_CONTROL_PREFIX = 'workItemJsonDynamic__';

const SYSTEM_DYNAMIC_FIELD_LOOKUPS = new Set([
  'title',
  'description',
  'acceptancecriteria',
  'iterationpath',
  'areapath',
  'workitemtype',
  'state',
  'reason',
  'teamproject',
]);

const SYSTEM_DYNAMIC_FIELD_REFERENCES = new Set([
  'system.title',
  'system.description',
  'microsoft.vsts.common.acceptancecriteria',
  'system.iterationpath',
  'system.areapath',
  'system.teamproject',
  'system.workitemtype',
  'system.state',
  'system.reason',
]);

const PAYLOAD_FIELD_ALIASES_BY_REFERENCE = new Map<string, string[]>([
  ['system.title', ['title']],
  ['system.description', ['description']],
  ['microsoft.vsts.common.acceptancecriteria', ['acceptanceCriteria']],
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
]);

const NON_WORK_ITEM_BODY_REFERENCES = new Set([
  'system.iterationpath',
  'system.areapath',
  'system.teamproject',
  'system.workitemtype',
  'system.state',
  'system.reason',
]);

const CORE_WORK_ITEM_FIELD_REFERENCES = new Set([
  'system.title',
  'system.description',
  'microsoft.vsts.common.acceptancecriteria',
]);

const CORE_WORK_ITEM_FIELDS: WorkItemFieldConfig[] = [
  {
    name: 'title',
    referenceName: 'System.Title',
    label: 'title',
    type: 'string',
    required: true,
    control: 'input',
    options: [],
    hasDefaultValue: false,
    isReadOnly: false,
  },
  {
    name: 'description',
    referenceName: 'System.Description',
    label: 'description',
    type: 'html',
    required: true,
    control: 'textarea',
    options: [],
    hasDefaultValue: false,
    isReadOnly: false,
  },
];

const ACCEPTANCE_CRITERIA_CORE_FIELD: WorkItemFieldConfig = {
  name: 'acceptanceCriteria',
  referenceName: 'Microsoft.VSTS.Common.AcceptanceCriteria',
  label: 'acceptanceCriteria',
  type: 'html',
  required: false,
  control: 'textarea',
  options: [],
  hasDefaultValue: false,
  isReadOnly: false,
};

export interface WorkItemFieldSanitizationOptions {
  keepEmptyOptionalFields?: boolean;
  allowUnknownFieldsWhenMetadataMissing?: boolean;
  workItemType?: unknown;
}

export interface WorkItemFieldSanitizationResult {
  workItem: WorkItemPayload['workItem'];
  removedFields: string[];
  missingRequiredFields: string[];
  allowedFieldKeys: string[];
}

export interface WorkItemPayloadSanitizationResult {
  payload: WorkItemPayload;
  removedFields: string[];
  missingRequiredFields: string[];
  allowedFieldKeys: string[];
}

export interface DynamicWorkItemFieldsCollectionResult extends WorkItemFieldSanitizationResult {
  dynamicWorkItemFields: Record<string, unknown>;
}

export interface RestoreUserControlledWorkItemFieldsOptions {
  workItemType?: unknown;
}

export function normalizeWorkItemFieldLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function dynamicWorkItemFieldKey(field: WorkItemFieldConfig): string {
  return (
    resolveReferenceNamePayloadKey(field) ||
    field.name.trim() ||
    field.referenceName.trim() ||
    field.label.trim()
  );
}

export function dynamicWorkItemControlName(
  field: WorkItemFieldConfig,
  controlPrefix: string,
): string {
  return `${controlPrefix}${normalizeWorkItemFieldLookup(dynamicWorkItemFieldKey(field))}`;
}

export function isDynamicSelectField(field: WorkItemFieldConfig): boolean {
  return field.options.length > 0;
}

export function isDynamicTextareaField(field: WorkItemFieldConfig): boolean {
  const normalizedControl = field.control.toLowerCase();
  const normalizedType = field.type.toLowerCase();
  return (
    normalizedControl === 'textarea' ||
    normalizedType === 'html' ||
    normalizedType === 'plaintext'
  );
}

export function isDynamicCheckboxField(field: WorkItemFieldConfig): boolean {
  const normalizedControl = field.control.toLowerCase();
  const normalizedType = field.type.toLowerCase();
  return normalizedControl === 'checkbox' || normalizedType === 'boolean';
}

export function dynamicWorkItemInputType(
  field: WorkItemFieldConfig,
): 'text' | 'number' | 'date' | 'datetime-local' {
  const normalizedControl = field.control.toLowerCase();
  const normalizedType = field.type.toLowerCase();

  if (isDateLikeWorkItemField(field)) {
    return 'datetime-local';
  }

  if (normalizedControl === 'date') {
    return 'date';
  }

  if (normalizedControl === 'datetime') {
    return 'datetime-local';
  }

  if (normalizedType === 'integer' || normalizedType === 'number') {
    return 'number';
  }

  if (normalizedType === 'date') {
    return 'date';
  }

  if (normalizedType === 'datetime') {
    return 'datetime-local';
  }

  return 'text';
}

export function dynamicWorkItemInputStep(
  field: WorkItemFieldConfig,
): string | null {
  const normalizedType = field.type.toLowerCase();
  if (normalizedType === 'integer') {
    return '1';
  }

  if (normalizedType === 'number') {
    return 'any';
  }

  return null;
}

export function shouldRenderDynamicWorkItemField(
  field: WorkItemFieldConfig,
): boolean {
  const normalizedName = normalizeWorkItemFieldLookup(field.name);
  const normalizedReferenceName = normalizeWorkItemFieldLookup(
    field.referenceName,
  );
  const normalizedLabel = normalizeWorkItemFieldLookup(field.label);

  if (!normalizedName && !normalizedReferenceName && !normalizedLabel) {
    return false;
  }

  if (
    SYSTEM_DYNAMIC_FIELD_LOOKUPS.has(normalizedName) ||
    SYSTEM_DYNAMIC_FIELD_LOOKUPS.has(normalizedReferenceName) ||
    SYSTEM_DYNAMIC_FIELD_LOOKUPS.has(normalizedLabel) ||
    SYSTEM_DYNAMIC_FIELD_REFERENCES.has(
      field.referenceName.trim().toLowerCase(),
    )
  ) {
    return false;
  }

  return true;
}

export function syncDynamicWorkItemControls(
  form: FormGroup,
  fields: WorkItemFieldConfig[],
  controlPrefix: string,
  pendingValues: Record<string, unknown>,
): WorkItemFieldConfig[] {
  const dynamicFields = fields.slice().sort((left, right) => {
    if (left.required !== right.required) {
      return left.required ? -1 : 1;
    }

    return left.label.localeCompare(right.label, undefined, {
      sensitivity: 'base',
    });
  });

  const expectedControlNames = new Set(
    dynamicFields.map((field) =>
      dynamicWorkItemControlName(field, controlPrefix),
    ),
  );

  Object.keys(form.controls)
    .filter((name) => name.startsWith(controlPrefix))
    .filter((name) => !expectedControlNames.has(name))
    .forEach((name) => form.removeControl(name));

  for (const field of dynamicFields) {
    const controlName = dynamicWorkItemControlName(field, controlPrefix);
    const currentControl = form.get(controlName) as FormControl | null;
    const validators = field.required ? [Validators.required] : [];
    const initialValue = resolveDynamicInitialValue(
      field,
      currentControl?.value,
      pendingValues,
    );

    if (!currentControl) {
      form.addControl(
        controlName,
        new FormControl(initialValue, { validators }),
      );
    } else {
      currentControl.setValidators(validators);
      currentControl.updateValueAndValidity({ emitEvent: false });

      if (
        field.options.length > 0 &&
        typeof currentControl.value === 'string'
      ) {
        const normalizedValue = currentControl.value.trim();
        const hasOptionMatch = field.options.some((option) =>
          isSameWorkItemText(option, normalizedValue),
        );
        if (normalizedValue && !hasOptionMatch) {
          currentControl.setValue('', { emitEvent: false });
        }
      }

      if (currentControl.value === null || currentControl.value === undefined) {
        currentControl.setValue(initialValue, { emitEvent: false });
      }
    }

    for (const pendingKey of getDynamicPendingValueKeys(field)) {
      delete pendingValues[pendingKey];
    }
  }

  return dynamicFields;
}

export function removeDynamicWorkItemControls(
  form: FormGroup,
  controlPrefix: string,
): void {
  Object.keys(form.controls)
    .filter((name) => name.startsWith(controlPrefix))
    .forEach((name) => form.removeControl(name));
}

export function collectDynamicWorkItemFields(
  form: FormGroup,
  fields: WorkItemFieldConfig[],
  controlPrefix: string,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const control = form.get(dynamicWorkItemControlName(field, controlPrefix));
    const rawValue = control?.value;
    const fieldKey = dynamicWorkItemFieldKey(field);

    if (isDynamicCheckboxField(field)) {
      values[fieldKey] = coerceDynamicBoolean(rawValue);
      continue;
    }

    if (typeof rawValue === 'string') {
      values[fieldKey] = rawValue.trim();
      continue;
    }

    if (rawValue === null || rawValue === undefined) {
      values[fieldKey] = '';
      continue;
    }

    values[fieldKey] = rawValue;
  }

  return values;
}

export function collectSanitizedDynamicWorkItemFields(
  form: FormGroup,
  fields: WorkItemFieldConfig[],
  controlPrefix: string,
  workItemType: unknown,
): DynamicWorkItemFieldsCollectionResult {
  const dynamicWorkItemFields = collectDynamicWorkItemFields(
    form,
    fields,
    controlPrefix,
  );
  const sanitized = sanitizeWorkItemFields(
    dynamicWorkItemFields as WorkItemPayload['workItem'],
    fields,
    {
      keepEmptyOptionalFields: false,
      workItemType,
    },
  );

  return {
    ...sanitized,
    dynamicWorkItemFields,
  };
}

export function getAllowedWorkItemFieldKeys(
  fields: WorkItemFieldConfig[] | undefined,
  workItemType: unknown = undefined,
): string[] {
  return getSanitizableWorkItemFields(fields, workItemType)
    .map((field) => resolvePayloadFieldKey(field))
    .filter(
      (fieldKey, index, items) =>
        !!fieldKey &&
        items.findIndex((item) => isSameWorkItemText(item, fieldKey)) === index,
    );
}

export function sanitizeWorkItemFields(
  workItem: WorkItemPayload['workItem'] | undefined,
  fields: WorkItemFieldConfig[] | undefined,
  options: WorkItemFieldSanitizationOptions = {},
): WorkItemFieldSanitizationResult {
  const effectiveFields = getSanitizableWorkItemFields(
    fields,
    options.workItemType,
    workItem,
  );
  const hasProvidedMetadata = (fields?.length ?? 0) > 0;
  const hasMetadata = effectiveFields.length > 0;
  const keyMap = hasMetadata
    ? buildAllowedPayloadFieldKeyMap(effectiveFields)
    : new Map<string, WorkItemFieldConfig>();
  const output: WorkItemPayload['workItem'] = {} as WorkItemPayload['workItem'];
  const removedFields: string[] = [];
  const providedRequiredReferences = new Set<string>();

  for (const [rawKey, rawValue] of Object.entries(workItem ?? {})) {
    const incomingKey = rawKey.trim();
    if (!incomingKey) {
      continue;
    }

    const field = keyMap.get(normalizeWorkItemFieldLookup(incomingKey));
    if (hasProvidedMetadata && !field) {
      removedFields.push(incomingKey);
      continue;
    }

    if (
      !hasMetadata &&
      options.allowUnknownFieldsWhenMetadataMissing === false
    ) {
      removedFields.push(incomingKey);
      continue;
    }

    const outputKey = field ? resolvePayloadFieldKey(field) : incomingKey;
    const normalizedValue = normalizePayloadFieldValue(rawValue);
    const isMissing = isWorkItemFieldValueMissing(normalizedValue);
    const isRequired = !!field?.required;

    if (isMissing && !isRequired && !options.keepEmptyOptionalFields) {
      removedFields.push(incomingKey);
      continue;
    }

    output[outputKey] = normalizedValue;
    if (field?.referenceName && !isMissing) {
      providedRequiredReferences.add(field.referenceName);
    }
  }

  const missingRequiredFields = effectiveFields
    .filter((field) => field.required)
    .filter((field) => !field.isReadOnly)
    .filter((field) => !field.hasDefaultValue)
    .filter((field) => !providedRequiredReferences.has(field.referenceName))
    .filter((field) => isMissingRequiredPayloadField(output, field))
    .map((field) => field.label || field.name || field.referenceName)
    .filter(
      (label, index, labels) =>
        !!label &&
        labels.findIndex((item) => isSameWorkItemText(item, label)) === index,
    )
    .sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );

  return {
    workItem: output,
    removedFields: uniqueWorkItemFieldNames(removedFields),
    missingRequiredFields,
    allowedFieldKeys: getAllowedWorkItemFieldKeys(
      effectiveFields,
      options.workItemType,
    ),
  };
}

export function sanitizeWorkItemPayload(
  payload: WorkItemPayload,
  fields: WorkItemFieldConfig[] | undefined,
  options: WorkItemFieldSanitizationOptions = {},
): WorkItemPayloadSanitizationResult {
  const workItemResult = sanitizeWorkItemFields(payload.workItem, fields, {
    ...options,
    workItemType: options.workItemType ?? payload.workItemType,
  });
  const supportsTestCases = supportsTestCasesForWorkItemType(
    payload.workItemType || 'User Story',
  );

  return {
    payload: {
      ...payload,
      workItem: workItemResult.workItem,
      testCases: supportsTestCases ? (payload.testCases ?? []) : [],
      testSuite: {
        planId: supportsTestCases ? Number(payload.testSuite?.planId ?? 0) : 0,
      },
    },
    removedFields: workItemResult.removedFields,
    missingRequiredFields: workItemResult.missingRequiredFields,
    allowedFieldKeys: workItemResult.allowedFieldKeys,
  };
}

export function restoreUserControlledWorkItemFieldsFromBase(
  generatedWorkItem: WorkItemPayload['workItem'] | undefined,
  baseWorkItem: WorkItemPayload['workItem'] | undefined,
  fields: WorkItemFieldConfig[] | undefined,
  aiEditableFieldLookups: Iterable<string>,
  options: RestoreUserControlledWorkItemFieldsOptions = {},
): WorkItemPayload['workItem'] {
  const aiEditableLookups = new Set(
    Array.from(aiEditableFieldLookups, (field) =>
      normalizeWorkItemFieldLookup(field),
    ),
  );
  const sanitizedBaseWorkItem = sanitizeWorkItemFields(baseWorkItem, fields, {
    keepEmptyOptionalFields: false,
    workItemType: options.workItemType,
  }).workItem;
  const workItem = {
    ...(generatedWorkItem ?? {}),
  } as WorkItemPayload['workItem'];

  for (const [key, value] of Object.entries(sanitizedBaseWorkItem)) {
    if (aiEditableLookups.has(normalizeWorkItemFieldLookup(key))) {
      continue;
    }

    workItem[key] = value;
  }

  return workItem;
}

export function isDynamicWorkItemFieldValueMissing(
  form: FormGroup,
  field: WorkItemFieldConfig,
  controlPrefix: string,
): boolean {
  if (isDynamicCheckboxField(field)) {
    return false;
  }

  const value = form.get(
    dynamicWorkItemControlName(field, controlPrefix),
  )?.value;
  if (typeof value === 'string') {
    return !value.trim();
  }

  return value === null || value === undefined || value === '';
}

export function getMissingRequiredDynamicWorkItemFieldLabels(
  form: FormGroup,
  fields: WorkItemFieldConfig[],
  controlPrefix: string,
): string[] {
  return fields
    .filter((field) => field.required)
    .filter((field) =>
      isDynamicWorkItemFieldValueMissing(form, field, controlPrefix),
    )
    .map((field) => field.label || field.name || field.referenceName);
}

export function findWorkItemFieldConfig(
  fields: WorkItemFieldConfig[] | undefined,
  fieldName: string,
): WorkItemFieldConfig | undefined {
  if (!fields) {
    return undefined;
  }

  const candidates = getWorkItemFieldLookupCandidates(fieldName);
  return fields.find((field) => {
    const normalizedName = normalizeWorkItemFieldLookup(field.name);
    const normalizedReferenceName = normalizeWorkItemFieldLookup(
      field.referenceName,
    );
    const normalizedLabel = normalizeWorkItemFieldLookup(field.label);

    return candidates.some(
      (candidate) =>
        candidate === normalizedName ||
        candidate === normalizedReferenceName ||
        candidate === normalizedLabel,
    );
  });
}

export function isDateLikeWorkItemFieldName(value: string): boolean {
  return normalizeWorkItemFieldLookup(value).includes('date');
}

export function isDateLikeWorkItemField(field: WorkItemFieldConfig): boolean {
  return (
    isDateLikeWorkItemFieldName(field.name) ||
    isDateLikeWorkItemFieldName(field.referenceName) ||
    isDateLikeWorkItemFieldName(field.label)
  );
}

export function coerceDynamicBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return false;
}

function resolveDynamicInitialValue(
  field: WorkItemFieldConfig,
  fallbackValue: unknown,
  pendingValues: Record<string, unknown>,
): unknown {
  const pendingValue = resolvePendingDynamicValue(field, pendingValues);
  const value = pendingValue.found ? pendingValue.value : fallbackValue;

  if (isDynamicCheckboxField(field)) {
    return coerceDynamicBoolean(value);
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return value;
}

function resolvePendingDynamicValue(
  field: WorkItemFieldConfig,
  pendingValues: Record<string, unknown>,
): { found: boolean; value: unknown } {
  for (const pendingKey of getDynamicPendingValueKeys(field)) {
    if (Object.prototype.hasOwnProperty.call(pendingValues, pendingKey)) {
      return { found: true, value: pendingValues[pendingKey] };
    }
  }

  return { found: false, value: undefined };
}

function getDynamicPendingValueKeys(field: WorkItemFieldConfig): string[] {
  return [
    dynamicWorkItemFieldKey(field),
    field.name,
    field.label,
    field.referenceName,
    ...getPayloadAliasesForField(field),
  ]
    .map((key) => key.trim())
    .filter(
      (key, index, keys) =>
        !!key &&
        keys.findIndex((item) => isSameWorkItemText(item, key)) === index,
    );
}

function getWorkItemFieldLookupCandidates(fieldName: string): string[] {
  const normalizedTarget = normalizeWorkItemFieldLookup(fieldName);
  if (!normalizedTarget) {
    return [];
  }

  if (normalizedTarget === 'priority') {
    return ['priority', 'backlogpriority'];
  }

  if (normalizedTarget === 'risk') {
    return ['risk', 'severity'];
  }

  if (normalizedTarget === 'valuearea') {
    return ['valuearea'];
  }

  if (normalizedTarget === 'storypoints') {
    return ['storypoints', 'effort'];
  }

  return [normalizedTarget];
}

function getSanitizableWorkItemFields(
  fields: WorkItemFieldConfig[] | undefined,
  workItemType: unknown = undefined,
  workItem?: WorkItemPayload['workItem'],
): WorkItemFieldConfig[] {
  const result = new Map<string, WorkItemFieldConfig>();

  for (const field of buildCoreWorkItemFields(fields, workItemType, workItem)) {
    result.set(field.referenceName.trim().toLowerCase(), field);
  }

  for (const field of fields ?? []) {
    const normalizedReferenceName = field.referenceName.trim().toLowerCase();
    if (CORE_WORK_ITEM_FIELD_REFERENCES.has(normalizedReferenceName)) {
      continue;
    }

    if (field.isReadOnly) {
      continue;
    }

    if (!resolvePayloadFieldKey(field)) {
      continue;
    }

    if (!NON_WORK_ITEM_BODY_REFERENCES.has(normalizedReferenceName)) {
      result.set(
        normalizedReferenceName ||
          normalizeWorkItemFieldLookup(dynamicWorkItemFieldKey(field)),
        field,
      );
    }
  }

  return Array.from(result.values());
}

function buildCoreWorkItemFields(
  fields: WorkItemFieldConfig[] | undefined,
  workItemType: unknown,
  workItem?: WorkItemPayload['workItem'],
): WorkItemFieldConfig[] {
  const coreFields = CORE_WORK_ITEM_FIELDS.map((field) =>
    withMetadataOverrides(field, fields),
  );
  if (shouldAllowAcceptanceCriteria(fields, workItemType, workItem)) {
    coreFields.push(
      withMetadataOverrides(ACCEPTANCE_CRITERIA_CORE_FIELD, fields),
    );
  }

  return coreFields;
}

function withMetadataOverrides(
  coreField: WorkItemFieldConfig,
  fields: WorkItemFieldConfig[] | undefined,
): WorkItemFieldConfig {
  const metadataField = findMetadataFieldByReference(
    fields,
    coreField.referenceName,
  );
  if (!metadataField) {
    return { ...coreField };
  }

  return {
    ...metadataField,
    name: coreField.name,
    label: coreField.label,
    referenceName: coreField.referenceName,
    required: coreField.required || metadataField.required,
    control: coreField.control,
    isReadOnly: false,
    hasDefaultValue: coreField.hasDefaultValue ?? metadataField.hasDefaultValue,
  };
}

function shouldAllowAcceptanceCriteria(
  fields: WorkItemFieldConfig[] | undefined,
  workItemType: unknown,
  workItem?: WorkItemPayload['workItem'],
): boolean {
  const capability = resolveWorkItemContentCapability(
    fields,
    'acceptanceCriteria',
    'loaded',
  );
  if (capability === 'supported') {
    return true;
  }
  if (capability === 'unsupported') {
    return false;
  }

  if (hasOwnContentField(workItem, 'acceptanceCriteria')) {
    return true;
  }

  // Compatibilidad temporal para prompts antiguos: el nombre del tipo solo se usa
  // cuando la respuesta no confirma un contrato funcional completo.
  return resolveWorkItemType(workItemType) === 'User Story';
}

export function getMissingRequiredDynamicWorkItemFields(
  form: FormGroup,
  fields: WorkItemFieldConfig[],
  controlPrefix: string,
): WorkItemFieldConfig[] {
  return fields
    .filter((field) => field.required && !!field.referenceName)
    .filter((field) =>
      isDynamicWorkItemFieldValueMissing(form, field, controlPrefix),
    );
}

function findMetadataFieldByReference(
  fields: WorkItemFieldConfig[] | undefined,
  referenceName: string,
): WorkItemFieldConfig | undefined {
  const normalizedReferenceName = referenceName.trim().toLowerCase();
  return (fields ?? []).find(
    (field) =>
      field.referenceName.trim().toLowerCase() === normalizedReferenceName,
  );
}

function buildAllowedPayloadFieldKeyMap(
  fields: WorkItemFieldConfig[],
): Map<string, WorkItemFieldConfig> {
  const result = new Map<string, WorkItemFieldConfig>();

  for (const field of fields) {
    const candidates = [
      field.name,
      field.referenceName,
      field.label,
      dynamicWorkItemFieldKey(field),
      ...getPayloadAliasesForField(field),
    ];

    for (const candidate of candidates) {
      const normalized = normalizeWorkItemFieldLookup(candidate);
      if (!normalized || result.has(normalized)) {
        continue;
      }

      result.set(normalized, field);
    }
  }

  return result;
}

function resolvePayloadFieldKey(field: WorkItemFieldConfig): string {
  return dynamicWorkItemFieldKey(field);
}

function getPayloadAliasesForField(field: WorkItemFieldConfig): string[] {
  const referenceName = field.referenceName.trim().toLowerCase();
  return PAYLOAD_FIELD_ALIASES_BY_REFERENCE.get(referenceName) ?? [];
}

function resolveReferenceNamePayloadKey(field: WorkItemFieldConfig): string {
  const aliases = getPayloadAliasesForField(field);
  if (aliases.length > 0) {
    return aliases[0];
  }

  const referenceName = field.referenceName.trim();
  if (!referenceName) {
    return '';
  }

  const source = referenceName.includes('.')
    ? referenceName.slice(referenceName.lastIndexOf('.') + 1)
    : referenceName;
  return toCamelCase(source);
}

function toCamelCase(value: string): string {
  const tokens = value
    .split(/[\s._/-]+/)
    .map((token) => token.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((token) => !!token);

  if (tokens.length === 0) {
    return '';
  }

  return tokens
    .map((token, index) => {
      const normalized = token.charAt(0).toUpperCase() + token.slice(1);
      return index === 0
        ? normalized.charAt(0).toLowerCase() + normalized.slice(1)
        : normalized;
    })
    .join('');
}

function normalizePayloadFieldValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return value;
}

function isWorkItemFieldValueMissing(value: unknown): boolean {
  if (typeof value === 'string') {
    return !value.trim();
  }

  return value === null || value === undefined || value === '';
}

function isMissingRequiredPayloadField(
  output: WorkItemPayload['workItem'],
  field: WorkItemFieldConfig,
): boolean {
  const outputKey = resolvePayloadFieldKey(field);
  return isWorkItemFieldValueMissing(output[outputKey]);
}

function uniqueWorkItemFieldNames(values: string[]): string[] {
  return values
    .filter((value) => !!value.trim())
    .filter(
      (value, index, items) =>
        items.findIndex((item) => isSameWorkItemText(item, value)) === index,
    )
    .sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
}

function isSameWorkItemText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
