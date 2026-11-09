import { WorkItemFieldConfig } from '../../../models/types';
import { WORK_ITEM_JSON_SYSTEM_PROMPT } from '../shared/work-item-prompt.constants';
import {
  buildWorkItemPromptContract,
  WorkItemPromptContract,
  WorkItemPromptTemplatePayload,
} from '../shared/work-item-prompt-contract';
import { buildWorkItemGenerationPrompt } from '../shared/work-item-generation-prompt';
import { WorkItemPromptResult } from '../shared/work-item-prompt.types';

export interface WorkItemJsonPromptInput {
  sourceWorkItemText: string;
  azdoOrg: string;
  azdoProject: string;
  workItemType: string;
  iterationPath: string;
  areaPath: string;
  useTestCases: boolean;
  testCaseCount: number;
  testCaseState: string;
  aiDecideTestCaseCount: boolean;
  testSuitePlanId: number;
  dynamicWorkItemFields: Record<string, unknown>;
  workItemFieldConfigs?: WorkItemFieldConfig[];
}

export interface WorkItemJsonPromptResult extends WorkItemPromptResult {
  jsonTemplate: WorkItemPromptTemplatePayload;
  contract: WorkItemPromptContract;
}

export function generateWorkItemJsonPrompt(
  input: WorkItemJsonPromptInput,
): WorkItemJsonPromptResult {
  const contract = buildWorkItemPromptContract({
    workItemType: input.workItemType,
    workItemFieldConfigs: input.workItemFieldConfigs,
    azdoOrg: input.azdoOrg,
    azdoProject: input.azdoProject,
    iterationPath: input.iterationPath,
    areaPath: input.areaPath,
    preservedWorkItemFields: input.dynamicWorkItemFields,
    useTestCases: input.useTestCases,
    aiDecideTestCaseCount: input.aiDecideTestCaseCount,
    testCaseCount: input.testCaseCount,
    testCaseState: input.testCaseState,
    testSuitePlanId: input.testSuitePlanId,
  });

  return {
    systemPrompt: WORK_ITEM_JSON_SYSTEM_PROMPT,
    prompt: buildWorkItemGenerationPrompt(
      contract,
      'Texto funcional libre suministrado por el usuario',
      input.sourceWorkItemText,
    ),
    jsonTemplate: contract.aiTemplate,
    contract,
  };
}
