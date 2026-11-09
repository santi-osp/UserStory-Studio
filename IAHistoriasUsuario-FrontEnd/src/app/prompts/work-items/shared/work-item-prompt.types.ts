import {
  RefinableWorkItemField,
  WorkItemPayload,
  WorkItemRefinementContent,
  TestCaseRefinementMode,
  TestCaseRefinementSelection,
} from '../../../models/types';
import { WorkItemPromptContract } from './work-item-prompt-contract';

export interface WorkItemPromptResult {
  systemPrompt: string;
  prompt: string;
}

export interface DesignWorkItemPromptResult extends WorkItemPromptResult {
  finalJson: WorkItemPayload;
  contract: WorkItemPromptContract;
}

export interface EvaluationWorkItemPromptInput {
  workItemType: string;
  workItemId?: number | null;
  title?: string;
}

export interface RefineWorkItemPromptInput {
  workItemType: string;
  supportedFields: RefinableWorkItemField[];
  selectedFields: RefinableWorkItemField[];
  currentContent: WorkItemRefinementContent;
  instructions: string;
}

export interface RefineTestCasesPromptInput {
  workItemType: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  mode: TestCaseRefinementMode;
  selectedTestCases: TestCaseRefinementSelection[];
  instructions: string;
}
