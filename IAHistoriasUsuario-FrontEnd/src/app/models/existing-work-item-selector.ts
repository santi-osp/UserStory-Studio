export type ExistingWorkItemSearchMode = 'id-or-title';

export interface ExistingWorkItemFilters {
  project: string;
  areaPath: string;
  iterationPath: string;
  criterion: string;
  searchMode: ExistingWorkItemSearchMode;
  allowedTypes: readonly string[];
}

export interface ExistingWorkItemSummary {
  id: number;
  type: string;
  title: string;
  state: string;
  areaPath: string;
  iterationPath: string;
  parentId: number | null;
  displayName: string;
}

export interface ExistingWorkItemRelation {
  relationType: string;
  targetId: number | null;
  targetUrl: string;
}

export type ExistingWorkItemMetadataValue =
  | string
  | number
  | boolean
  | null;

export interface ExistingWorkItemSelection {
  summary: ExistingWorkItemSummary;
  description: string | null;
  acceptanceCriteria: string | null;
  relations: readonly ExistingWorkItemRelation[];
  metadata: Readonly<Record<string, ExistingWorkItemMetadataValue>>;
}

export const EMPTY_EXISTING_WORK_ITEM_FILTERS: ExistingWorkItemFilters = {
  project: '',
  areaPath: '',
  iterationPath: '',
  criterion: '',
  searchMode: 'id-or-title',
  allowedTypes: [],
};
