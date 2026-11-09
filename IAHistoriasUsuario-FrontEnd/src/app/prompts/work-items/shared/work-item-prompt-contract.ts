import {
  TcFields,
  WorkItemFieldConfig,
  WorkItemFields,
  WorkItemPayload,
} from '../../../models/types';
import { normalizeAzdoPath } from '../../../utils/azdo-path';
import {
  dynamicWorkItemFieldKey,
  getAllowedWorkItemFieldKeys,
  sanitizeWorkItemFields,
} from '../../../utils/work-item-dynamic-fields';
import {
  findWorkItemContentFieldConfig,
  hasCompleteWorkItemContentMetadata,
} from '../../../utils/work-item-content-metadata';
import {
  requireSupportedWorkItemType,
  SupportedWorkItemType,
} from '../../../utils/work-item-type';

export type WorkItemMetadataState = 'confirmed';
export type TestCaseCountMode = 'disabled' | 'fixed' | 'ai';

export interface WorkItemSemanticProfile {
  readonly descriptionRules: readonly string[];
  readonly acceptanceCriteriaRules: readonly string[];
  readonly descriptionTemplate: string;
}

export interface WorkItemPromptTemplatePayload {
  readonly azdoOrg: string;
  readonly azdoProject: string;
  readonly workItemType: SupportedWorkItemType;
  readonly iterationPath: string;
  readonly areaPath: string;
  readonly workItem: Readonly<Record<string, unknown>>;
  readonly testCases?: readonly TcFields[];
  readonly testSuite?: Readonly<{ planId: number }>;
}

export interface WorkItemPromptContract {
  readonly workItemType: SupportedWorkItemType;
  readonly metadataState: WorkItemMetadataState;
  readonly metadata: readonly WorkItemFieldConfig[];
  readonly allowedWorkItemFields: readonly string[];
  readonly aiEditableWorkItemFields: readonly string[];
  readonly preservedWorkItemFields: readonly string[];
  readonly prohibitedWorkItemFields: readonly string[];
  readonly azureRequiredWorkItemFields: readonly string[];
  readonly generationRequiredWorkItemFields: readonly string[];
  readonly acceptanceCriteria: Readonly<{
    supported: boolean;
    requiredByAzure: boolean;
    requiredForGeneration: boolean;
  }>;
  readonly testCases: Readonly<{
    supported: boolean;
    enabled: boolean;
    countMode: TestCaseCountMode;
    fixedCount: number;
    state: string;
    planId: number;
  }>;
  readonly semanticProfile: WorkItemSemanticProfile;
  readonly aiTemplate: WorkItemPromptTemplatePayload;
}

export interface BuildWorkItemPromptContractInput {
  readonly workItemType: unknown;
  readonly workItemFieldConfigs: readonly WorkItemFieldConfig[] | undefined;
  readonly azdoOrg: string;
  readonly azdoProject: string;
  readonly iterationPath: string;
  readonly areaPath: string;
  readonly preservedWorkItemFields: Readonly<Record<string, unknown>>;
  readonly useTestCases: boolean;
  readonly aiDecideTestCaseCount: boolean;
  readonly testCaseCount: number;
  readonly testCaseState: string;
  readonly testSuitePlanId: number;
}

const INFRASTRUCTURE_REFERENCES = new Set([
  'system.iterationpath',
  'system.areapath',
  'system.teamproject',
  'system.workitemtype',
  'system.state',
  'system.reason',
]);

const SEMANTIC_PROFILES: Record<SupportedWorkItemType, WorkItemSemanticProfile> = {
  Epic: {
    descriptionRules: [
      'Organiza visión o iniciativa, objetivo estratégico, contexto, alcance macro, exclusiones, beneficios, dependencias macro y riesgos solo cuando existan en la entrada.',
      'No inventes Features, métricas, responsables, fechas, beneficios cuantificados ni tecnologías.',
    ],
    acceptanceCriteriaRules: [
      'Redacta criterios macro de éxito verificables.',
      'No uses formato de historia de usuario ni inventes KPI.',
    ],
    descriptionTemplate:
      '<p><strong>Visión o iniciativa:</strong> Información no suministrada.</p><p><strong>Objetivo estratégico:</strong> Información no suministrada.</p><p><strong>Contexto y alcance macro:</strong> Información no suministrada.</p>',
  },
  Feature: {
    descriptionRules: [
      'Organiza capacidad funcional, valor, alcance, comportamiento general, dependencias y exclusiones.',
      'Menciona una Epic padre únicamente cuando haya sido suministrada; no la inventes.',
    ],
    acceptanceCriteriaRules: [
      'Redacta criterios funcionales verificables de la capacidad.',
      'No uses Rol/Necesito/Para que ni conviertas todo a escenarios técnicos de User Story.',
    ],
    descriptionTemplate:
      '<p><strong>Capacidad funcional:</strong> Información no suministrada.</p><p><strong>Valor y alcance:</strong> Información no suministrada.</p><p><strong>Comportamiento general:</strong> Información no suministrada.</p>',
  },
  'User Story': {
    descriptionRules: [
      'Organiza Rol, Necesito, Para que, contexto adicional, reglas de negocio, dependencias y restricciones suministradas.',
      'Cuando falte un elemento, conserva explícitamente la ausencia; no inventes actor, valor ni reglas.',
    ],
    acceptanceCriteriaRules: [
      'Usa HTML, numeración consecutiva y encabezados <strong>AC1 - Escenario: nombre</strong>.',
      'Cada criterio debe ser verificable y contener Dado, Cuando y Entonces, sin Markdown ni escenarios inventados.',
    ],
    descriptionTemplate:
      '<p><strong>Rol:</strong> Información no suministrada.</p><p><strong>Necesito:</strong> Información no suministrada.</p><p><strong>Para que:</strong> Información no suministrada.</p>',
  },
};

export function getWorkItemSemanticProfile(
  value: unknown,
): WorkItemSemanticProfile {
  return SEMANTIC_PROFILES[requireSupportedWorkItemType(value)];
}

function normalizeCount(value: number): number {
  const count = Number(value);
  return Number.isFinite(count)
    ? Math.max(1, Math.min(50, Math.floor(count)))
    : 1;
}

function fieldKey(field: WorkItemFieldConfig): string {
  return dynamicWorkItemFieldKey(field);
}

function cloneFields(
  fields: readonly WorkItemFieldConfig[],
): WorkItemFieldConfig[] {
  return fields.map((field) => ({
    ...field,
    options: [...field.options],
  }));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value as Record<string, unknown>).forEach((nested) =>
    deepFreeze(nested),
  );
  return Object.freeze(value);
}

function buildFixedTestCases(count: number, state: string): TcFields[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `TC ${index + 1} - escenario`,
    state,
    steps: [{ action: '', expected: '' }],
  }));
}

export function buildWorkItemPromptContract(
  input: BuildWorkItemPromptContractInput,
): WorkItemPromptContract {
  const workItemType = requireSupportedWorkItemType(input.workItemType);
  const metadata = cloneFields(input.workItemFieldConfigs ?? []);
  if (!hasCompleteWorkItemContentMetadata(metadata)) {
    throw new Error(
      `No se puede generar ${workItemType}: la metadata debe confirmar System.Title y System.Description.`,
    );
  }

  const acceptanceField = findWorkItemContentFieldConfig(
    metadata,
    'acceptanceCriteria',
  );
  const acceptanceSupported = !!acceptanceField;
  const allowedWorkItemFields = getAllowedWorkItemFieldKeys(
    metadata,
    workItemType,
  );
  const aiEditableWorkItemFields = [
    'title',
    'description',
    ...(acceptanceSupported ? ['acceptanceCriteria'] : []),
  ];
  const preservedWorkItemFields = allowedWorkItemFields.filter(
    (key) => !aiEditableWorkItemFields.includes(key),
  );
  const prohibitedWorkItemFields = metadata
    .filter(
      (field) =>
        !!field.isReadOnly ||
        INFRASTRUCTURE_REFERENCES.has(field.referenceName.trim().toLowerCase()),
    )
    .map(fieldKey)
    .filter(Boolean);
  if (!acceptanceSupported) prohibitedWorkItemFields.push('acceptanceCriteria');

  const azureRequiredWorkItemFields = metadata
    .filter(
      (field) =>
        field.required && !field.isReadOnly && !field.hasDefaultValue,
    )
    .map(fieldKey)
    .filter((key) => allowedWorkItemFields.includes(key));
  const generationRequiredWorkItemFields = [...aiEditableWorkItemFields];

  const sanitizedPreservedFields = sanitizeWorkItemFields(
    input.preservedWorkItemFields as WorkItemFields,
    metadata,
    { keepEmptyOptionalFields: false, workItemType },
  ).workItem;
  const workItem: Record<string, unknown> = {
    ...sanitizedPreservedFields,
    title: '',
    description: getWorkItemSemanticProfile(workItemType).descriptionTemplate,
  };
  if (acceptanceSupported) workItem['acceptanceCriteria'] = '';

  const testCasesSupported = workItemType === 'User Story';
  const testCasesEnabled =
    testCasesSupported &&
    input.useTestCases &&
    input.testSuitePlanId > 0 &&
    !!input.testCaseState.trim();
  const countMode: TestCaseCountMode = !testCasesEnabled
    ? 'disabled'
    : input.aiDecideTestCaseCount
      ? 'ai'
      : 'fixed';
  const fixedCount = countMode === 'fixed' ? normalizeCount(input.testCaseCount) : 0;
  const state = testCasesEnabled ? input.testCaseState.trim() : '';
  const planId = testCasesEnabled ? input.testSuitePlanId : 0;

  const aiTemplate: WorkItemPromptTemplatePayload = {
    azdoOrg: input.azdoOrg.trim(),
    azdoProject: input.azdoProject.trim(),
    workItemType,
    iterationPath: normalizeAzdoPath(input.iterationPath, 'iteration'),
    areaPath: normalizeAzdoPath(input.areaPath, 'area'),
    workItem,
    ...(testCasesEnabled
      ? {
          testCases:
            countMode === 'fixed' ? buildFixedTestCases(fixedCount, state) : [],
          testSuite: { planId },
        }
      : {}),
  };

  return deepFreeze({
    workItemType,
    metadataState: 'confirmed' as const,
    metadata,
    allowedWorkItemFields: [...allowedWorkItemFields],
    aiEditableWorkItemFields,
    preservedWorkItemFields,
    prohibitedWorkItemFields: [...new Set(prohibitedWorkItemFields)],
    azureRequiredWorkItemFields,
    generationRequiredWorkItemFields,
    acceptanceCriteria: {
      supported: acceptanceSupported,
      requiredByAzure: acceptanceField?.required === true,
      requiredForGeneration: acceptanceSupported,
    },
    testCases: {
      supported: testCasesSupported,
      enabled: testCasesEnabled,
      countMode,
      fixedCount,
      state,
      planId,
    },
    semanticProfile: getWorkItemSemanticProfile(workItemType),
    aiTemplate,
  });
}

export function promptTemplateToPayload(
  template: WorkItemPromptTemplatePayload,
): WorkItemPayload {
  return {
    azdoOrg: template.azdoOrg,
    azdoProject: template.azdoProject,
    workItemType: template.workItemType,
    iterationPath: template.iterationPath,
    areaPath: template.areaPath,
    workItem: { ...template.workItem } as WorkItemFields,
    testCases: (template.testCases ?? []).map((testCase) => ({
      ...testCase,
      steps: testCase.steps.map((step) => ({ ...step })),
    })),
    testSuite: { planId: template.testSuite?.planId ?? 0 },
  };
}
