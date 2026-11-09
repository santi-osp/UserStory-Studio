import { FormValues, PromptResult, WorkItemPayload } from '../../../models/types';
import { WORK_ITEM_JSON_SYSTEM_PROMPT } from '../shared/work-item-prompt.constants';
import {
  buildWorkItemPromptContract,
  promptTemplateToPayload,
} from '../shared/work-item-prompt-contract';
import { buildWorkItemGenerationPrompt } from '../shared/work-item-generation-prompt';
import { DesignWorkItemPromptResult } from '../shared/work-item-prompt.types';

export const TEMPLATE_PAYLOAD: WorkItemPayload = {
  azdoOrg: '',
  azdoProject: '',
  workItemType: 'User Story',
  iterationPath: '',
  areaPath: '',
  workItem: {
    title: '',
    description: '',
    acceptanceCriteria: '',
    priority: '',
    risk: '',
    startDate: '',
    finishDate: '',
    valueArea: '',
    tipoHU: '',
    frenteDeTrabajo: '',
    assignedTo: '',
  },
  testCases: Array.from({ length: 3 }, (_, index) => ({
    title: `TC ${index + 1} - escenario`,
    state: '',
    steps: [{ action: '', expected: '' }],
  })),
  testSuite: { planId: 0 },
};

function buildContract(values: FormValues) {
  return buildWorkItemPromptContract({
    workItemType: values.workItemType,
    workItemFieldConfigs: values.workItemFieldConfigs,
    azdoOrg: values.azdoOrg,
    azdoProject: values.azdoProject,
    iterationPath: values.iterationPath,
    areaPath: values.areaPath,
    preservedWorkItemFields: values.dynamicWorkItemFields ?? {},
    useTestCases: values.useTestCases ?? true,
    aiDecideTestCaseCount: values.aiFields.cantidadTestcases,
    testCaseCount: values.tcCount,
    testCaseState: values.tcState,
    testSuitePlanId: Number(values.testSuite.planId),
  });
}

export function buildFinalJson(values: FormValues): WorkItemPayload {
  return promptTemplateToPayload(buildContract(values).aiTemplate);
}

export function generatePromptAndJson(values: FormValues): PromptResult {
  return buildDesignWorkItemPrompt(values);
}

export function buildDesignWorkItemPrompt(
  values: FormValues,
): DesignWorkItemPromptResult {
  const contract = buildContract(values);
  const finalJson = promptTemplateToPayload(contract.aiTemplate);
  return {
    systemPrompt: WORK_ITEM_JSON_SYSTEM_PROMPT,
    prompt: buildWorkItemGenerationPrompt(
      contract,
      'Necesidad guiada suministrada por el usuario',
      values.need,
    ),
    finalJson,
    contract,
  };
}

export function payloadToFormValues(payload: WorkItemPayload): FormValues {
  return {
    need: '',
    useTestCases: true,
    tcCount: payload.testCases.length,
    tcState: payload.testCases[0]?.state?.trim() ?? '',
    azdoOrg: payload.azdoOrg,
    azdoProject: payload.azdoProject,
    workItemType: payload.workItemType ?? '',
    iterationPath: payload.iterationPath,
    areaPath: payload.areaPath,
    workItem: { ...payload.workItem },
    dynamicWorkItemFields: {},
    testCases: payload.testCases.map((testCase) => ({
      ...testCase,
      steps: testCase.steps.map((step) => ({ ...step })),
    })),
    testSuite: { ...payload.testSuite },
    aiFields: { cantidadTestcases: false },
  };
}
