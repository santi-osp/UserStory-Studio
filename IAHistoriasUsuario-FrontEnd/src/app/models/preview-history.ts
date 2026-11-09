import { WorkItemPayload } from './types';

export type PreviewHistorySource = 'designer' | 'fromText';
export type PreviewHistoryVersionType = 'generated' | 'refinementAccepted';
export type PreviewHistoryRefinementScope = 'content' | 'testCases';

export interface PreviewHistoryItem {
  readonly storageVersion: 2;
  readonly id: string;
  readonly createdAt: string;
  readonly source: PreviewHistorySource;
  readonly versionType: PreviewHistoryVersionType;
  readonly refinementScope?: PreviewHistoryRefinementScope;
  readonly title: string;
  readonly workItemType: string;
  readonly project: string;
  readonly areaPath: string;
  readonly iterationPath: string;
  readonly testCasesCount: number;
  readonly payload: WorkItemPayload;
  readonly normalizedJson: string;
  readonly fingerprint: string;
}
