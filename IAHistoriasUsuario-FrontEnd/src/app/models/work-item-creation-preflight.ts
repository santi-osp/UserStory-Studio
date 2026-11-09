import { CreateResult, CreateWorkItemRequest, WorkItemPayload } from './types';

export type WorkItemCreationPhase =
  'preparing' | 'ready' | 'invalid' | 'error' | 'creating' | 'result';

export interface WorkItemCreationSummary {
  readonly organization: string;
  readonly project: string;
  readonly workItemType: string;
  readonly areaPath: string;
  readonly iterationPath: string;
  readonly title: string;
  readonly testCaseCount: number;
  readonly testPlanId: number;
}

export interface WorkItemCreationSnapshot {
  readonly key: string;
  readonly fingerprint: string;
  readonly contextIdentity: string;
  readonly payload: WorkItemPayload;
  readonly summary: WorkItemCreationSummary;
}

export interface PreparedWorkItemCreation extends WorkItemCreationSnapshot {
  readonly metadataIdentity: string;
  readonly request: CreateWorkItemRequest;
  readonly warnings: readonly string[];
}

export interface WorkItemCreationDialogState {
  readonly phase: WorkItemCreationPhase;
  readonly summary: WorkItemCreationSummary;
  readonly message: string;
  readonly error: string;
  readonly issues: readonly string[];
  readonly warnings: readonly string[];
  readonly result: CreateResult | null;
  readonly ambiguousRetry: boolean;
}
