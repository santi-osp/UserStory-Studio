import { Injectable } from '@angular/core';
import { FormValues } from '../models/types';
import {
  buildDesignWorkItemPrompt,
  buildEvaluateWorkItemPrompt,
  buildRefineWorkItemPrompt,
  DesignWorkItemPromptResult,
  EvaluationWorkItemPromptInput,
  generateWorkItemJsonPrompt,
  buildRefineTestCasesPrompt,
  RefineTestCasesPromptInput,
  RefineWorkItemPromptInput,
  WorkItemJsonPromptInput,
  WorkItemJsonPromptResult,
  WorkItemPromptResult,
} from '../prompts/work-items';

@Injectable({ providedIn: 'root' })
export class WorkItemPromptBuilderService {
  buildDesignPrompt(values: FormValues): DesignWorkItemPromptResult {
    return buildDesignWorkItemPrompt(values);
  }

  buildCreateJsonPrompt(
    input: WorkItemJsonPromptInput,
  ): WorkItemJsonPromptResult {
    return generateWorkItemJsonPrompt(input);
  }

  buildEvaluationPrompt(
    input: EvaluationWorkItemPromptInput,
  ): WorkItemPromptResult {
    return buildEvaluateWorkItemPrompt(input);
  }

  buildRefinementPrompt(
    input: RefineWorkItemPromptInput,
  ): WorkItemPromptResult {
    return buildRefineWorkItemPrompt(input);
  }

  buildTestCaseRefinementPrompt(
    input: RefineTestCasesPromptInput,
  ): WorkItemPromptResult {
    return buildRefineTestCasesPrompt(input);
  }
}
