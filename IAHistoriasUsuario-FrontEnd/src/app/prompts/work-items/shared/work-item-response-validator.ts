import { WorkItemFields, WorkItemPayload } from '../../../models/types';
import {
  isWorkItemContentHtmlEmpty,
  normalizeWorkItemContentHtml,
} from '../../../utils/work-item-content-html';
import { WorkItemPromptContract } from './work-item-prompt-contract';

export interface WorkItemResponseValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly payload?: WorkItemPayload;
}

const ROOT_FIELDS = new Set([
  'azdoOrg',
  'azdoProject',
  'workItemType',
  'iterationPath',
  'areaPath',
  'workItem',
  'testCases',
  'testSuite',
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateHtml(
  value: unknown,
  field: string,
  errors: string[],
): value is string {
  if (typeof value !== 'string' || isWorkItemContentHtmlEmpty(value)) {
    errors.push(`${field} debe contener HTML funcional no vacío.`);
    return false;
  }
  if (/<\/?(?:script|style|iframe)\b/i.test(value) || /```/.test(value)) {
    errors.push(`${field} contiene HTML o Markdown no permitido.`);
    return false;
  }
  if (!/<(?:p|strong|ul|li|br)\b/i.test(value)) {
    errors.push(`${field} debe usar HTML compatible con Azure DevOps.`);
    return false;
  }
  return true;
}

function validateUserStoryCriteria(value: string, errors: string[]): void {
  const numbers = Array.from(value.matchAll(/<strong>\s*AC(\d+)\s*-\s*Escenario:/gi)).map(
    (match) => Number(match[1]),
  );
  if (
    numbers.length === 0 ||
    numbers.some((number, index) => number !== index + 1) ||
    !/\bDado\b/i.test(value) ||
    !/\bCuando\b/i.test(value) ||
    !/\bEntonces\b/i.test(value)
  ) {
    errors.push(
      'workItem.acceptanceCriteria debe usar AC consecutivos con Escenario y Dado/Cuando/Entonces.',
    );
  }
}

export function validateGeneratedWorkItemResponse(
  generated: unknown,
  contract: WorkItemPromptContract,
  basePayload: WorkItemPayload,
): WorkItemResponseValidationResult {
  const errors: string[] = [];
  const root = record(generated);
  if (!root) {
    return { valid: false, errors: ['La respuesta no es un objeto JSON.'] };
  }

  Object.keys(root)
    .filter((key) => !ROOT_FIELDS.has(key))
    .forEach((key) => errors.push(`La propiedad raíz ${key} no está permitida.`));

  for (const key of [
    'azdoOrg',
    'azdoProject',
    'workItemType',
    'iterationPath',
    'areaPath',
  ] as const) {
    if (root[key] !== basePayload[key]) {
      errors.push(`${key} fue modificado por la respuesta de IA.`);
    }
  }

  const rawGeneratedWorkItem = record(root['workItem']);
  if (!rawGeneratedWorkItem) {
    errors.push('workItem debe ser un objeto.');
    return { valid: false, errors };
  }

  const generatedWorkItem: Record<string, unknown> = {
    ...rawGeneratedWorkItem,
  };
  for (const field of ['description', 'acceptanceCriteria'] as const) {
    if (typeof generatedWorkItem[field] === 'string') {
      generatedWorkItem[field] = normalizeWorkItemContentHtml(
        generatedWorkItem[field],
      );
    }
  }

  for (const key of Object.keys(generatedWorkItem)) {
    if (!contract.allowedWorkItemFields.includes(key)) {
      errors.push(`workItem.${key} no está confirmado por la metadata.`);
    }
  }
  for (const key of contract.generationRequiredWorkItemFields) {
    if (!hasOwn(generatedWorkItem, key)) {
      errors.push(`workItem.${key} falta en la respuesta contractual.`);
    }
  }
  if (
    typeof generatedWorkItem['title'] !== 'string' ||
    !generatedWorkItem['title'].trim()
  ) {
    errors.push('workItem.title no puede estar vacío.');
  }
  if (
    validateHtml(
      generatedWorkItem['description'],
      'workItem.description',
      errors,
    ) &&
    contract.workItemType !== 'User Story' &&
    /\b(?:Rol|Necesito|Para que)\s*:/i.test(
      generatedWorkItem['description'] as string,
    )
  ) {
    errors.push(
      `workItem.description no puede usar formato de User Story para ${contract.workItemType}.`,
    );
  }

  if (contract.acceptanceCriteria.supported) {
    if (
      validateHtml(
        generatedWorkItem['acceptanceCriteria'],
        'workItem.acceptanceCriteria',
        errors,
      ) &&
      contract.workItemType === 'User Story'
    ) {
      const criteria = generatedWorkItem['acceptanceCriteria'] as string;
      validateUserStoryCriteria(criteria, errors);
    } else if (
      typeof generatedWorkItem['acceptanceCriteria'] === 'string' &&
      /\b(?:Rol|Necesito|Para que)\s*:/i.test(
        generatedWorkItem['acceptanceCriteria'],
      )
    ) {
      errors.push(
        `workItem.acceptanceCriteria no corresponde al perfil ${contract.workItemType}.`,
      );
    }
  } else if (hasOwn(generatedWorkItem, 'acceptanceCriteria')) {
    errors.push('workItem.acceptanceCriteria no está soportado por la metadata.');
  }

  const generatedCases = root['testCases'];
  const generatedSuite = record(root['testSuite']);
  if (!contract.testCases.enabled) {
    if (hasOwn(root, 'testCases') || hasOwn(root, 'testSuite')) {
      errors.push('testCases y testSuite no están habilitados para este contrato.');
    }
  } else {
    if (!Array.isArray(generatedCases)) {
      errors.push('testCases debe ser un arreglo.');
    } else {
      if (
        contract.testCases.countMode === 'fixed' &&
        generatedCases.length !== contract.testCases.fixedCount
      ) {
        errors.push(
          `testCases debe contener exactamente ${contract.testCases.fixedCount} casos.`,
        );
      }
      if (generatedCases.length === 0 || generatedCases.length > 50) {
        errors.push('testCases debe contener entre 1 y 50 casos.');
      }
      generatedCases.forEach((candidate, index) => {
        const testCase = record(candidate);
        if (!testCase) {
          errors.push(`testCases[${index}] debe ser un objeto.`);
          return;
        }
        if (typeof testCase['title'] !== 'string' || !testCase['title'].trim())
          errors.push(`testCases[${index}].title no puede estar vacío.`);
        if (testCase['state'] !== contract.testCases.state)
          errors.push(`testCases[${index}].state debe conservar ${contract.testCases.state}.`);
        const steps = testCase['steps'];
        if (!Array.isArray(steps) || steps.length === 0) {
          errors.push(`testCases[${index}].steps requiere al menos un paso.`);
          return;
        }
        steps.forEach((candidateStep, stepIndex) => {
          const step = record(candidateStep);
          if (
            !step ||
            typeof step['action'] !== 'string' ||
            !step['action'].trim() ||
            typeof step['expected'] !== 'string' ||
            !step['expected'].trim()
          ) {
            errors.push(
              `testCases[${index}].steps[${stepIndex}] requiere action y expected.`,
            );
          }
        });
      });
    }
    if (Number(generatedSuite?.['planId']) !== contract.testCases.planId) {
      errors.push('testSuite.planId debe conservar el Test Plan seleccionado.');
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  const payload: WorkItemPayload = {
    azdoOrg: basePayload.azdoOrg,
    azdoProject: basePayload.azdoProject,
    workItemType: contract.workItemType,
    iterationPath: basePayload.iterationPath,
    areaPath: basePayload.areaPath,
    workItem: {
      ...generatedWorkItem,
      ...Object.fromEntries(
        contract.preservedWorkItemFields
          .filter((key) =>
            Object.prototype.hasOwnProperty.call(basePayload.workItem, key),
          )
          .map((key) => [key, basePayload.workItem[key]]),
      ),
    } as WorkItemFields,
    testCases: contract.testCases.enabled
      ? (generatedCases as WorkItemPayload['testCases']).map((testCase) => ({
          ...testCase,
          steps: testCase.steps.map((step) => ({ ...step })),
        }))
      : [],
    testSuite: { planId: contract.testCases.enabled ? contract.testCases.planId : 0 },
  };
  return { valid: true, errors: [], payload };
}
