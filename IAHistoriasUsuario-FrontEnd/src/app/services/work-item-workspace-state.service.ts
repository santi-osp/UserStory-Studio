import { Injectable } from '@angular/core';
import { WorkItemPayload } from '../models/types';
import { WorkItemPromptContract } from '../prompts/work-items';

export type PromptSource =
  'builder' | 'work-item-json-builder' | 'designer' | 'fromText';

export interface PreviewNavigationRequest {
  prompt: string;
  systemPrompt: string;
  requestId: number;
  basePayload?: WorkItemPayload;
  contract?: WorkItemPromptContract;
}

@Injectable({ providedIn: 'root' })
export class WorkItemWorkspaceStateService {
  private promptForAi = '';
  private systemPromptForAi = '';
  private promptSource: PromptSource = 'builder';
  private previewRequestId = 0;
  private pendingPreviewRequest: PreviewNavigationRequest | null = null;

  setPrompt(prompt: string, source: PromptSource, systemPrompt = ''): void {
    this.promptForAi = prompt;
    this.systemPromptForAi = systemPrompt;
    this.promptSource = source;
  }

  getPromptSnapshot(): string {
    return this.promptForAi;
  }

  getSystemPromptSnapshot(): string {
    return this.systemPromptForAi;
  }

  preparePreview(
    prompt: string,
    source: PromptSource,
    basePayload?: WorkItemPayload,
    contract?: WorkItemPromptContract,
  ): void {
    this.promptForAi = prompt;
    this.promptSource = source;
    this.previewRequestId += 1;
    this.pendingPreviewRequest = {
      prompt,
      systemPrompt: this.systemPromptForAi,
      requestId: this.previewRequestId,
      ...(basePayload ? { basePayload: this.clonePayload(basePayload) } : {}),
      ...(contract ? { contract: this.cloneContract(contract) } : {}),
    };
  }

  consumePreviewRequest(): PreviewNavigationRequest | null {
    const request = this.pendingPreviewRequest;
    this.pendingPreviewRequest = null;
    return request;
  }

  getPreviewReturnRoute(): string {
    return this.getPreviewSource() === 'fromText'
      ? '/crear-desde-texto'
      : '/disenar-work-item';
  }

  getPreviewSource(): 'designer' | 'fromText' {
    return this.promptSource === 'work-item-json-builder' ||
      this.promptSource === 'fromText'
      ? 'fromText'
      : 'designer';
  }

  private clonePayload(payload: WorkItemPayload): WorkItemPayload {
    return JSON.parse(JSON.stringify(payload)) as WorkItemPayload;
  }

  private cloneContract(contract: WorkItemPromptContract): WorkItemPromptContract {
    return JSON.parse(JSON.stringify(contract)) as WorkItemPromptContract;
  }
}
