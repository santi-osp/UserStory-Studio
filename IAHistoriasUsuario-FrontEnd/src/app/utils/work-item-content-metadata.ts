import {
  RefinableWorkItemField,
  WorkItemFieldConfig,
  WorkItemFields,
} from '../models/types';

export type ContentMetadataLoadState = 'idle' | 'loading' | 'loaded' | 'error';
export type WorkItemContentCapability = 'unknown' | 'supported' | 'unsupported';

export const WORK_ITEM_CONTENT_FIELD_REFERENCES: Record<
  RefinableWorkItemField,
  string
> = {
  title: 'system.title',
  description: 'system.description',
  acceptanceCriteria: 'microsoft.vsts.common.acceptancecriteria',
};

const CONTENT_FIELD_ORDER: readonly RefinableWorkItemField[] = [
  'title',
  'description',
  'acceptanceCriteria',
];

export function findWorkItemContentFieldConfig(
  fields: readonly WorkItemFieldConfig[] | undefined,
  field: RefinableWorkItemField,
): WorkItemFieldConfig | undefined {
  const referenceName = WORK_ITEM_CONTENT_FIELD_REFERENCES[field];
  return (fields ?? []).find(
    (config) => config.referenceName.trim().toLowerCase() === referenceName,
  );
}

export function hasCompleteWorkItemContentMetadata(
  fields: readonly WorkItemFieldConfig[] | undefined,
): boolean {
  return (
    !!findWorkItemContentFieldConfig(fields, 'title') &&
    !!findWorkItemContentFieldConfig(fields, 'description')
  );
}

export function resolveWorkItemContentCapability(
  fields: readonly WorkItemFieldConfig[] | undefined,
  field: RefinableWorkItemField,
  loadState: ContentMetadataLoadState = 'loaded',
): WorkItemContentCapability {
  if (loadState !== 'loaded' || !hasCompleteWorkItemContentMetadata(fields)) {
    return 'unknown';
  }

  return findWorkItemContentFieldConfig(fields, field)
    ? 'supported'
    : 'unsupported';
}

export function getAvailableRefinementFields(
  fields: readonly WorkItemFieldConfig[] | undefined,
  workItem: WorkItemFields | null | undefined,
  loadState: ContentMetadataLoadState,
): RefinableWorkItemField[] {
  return CONTENT_FIELD_ORDER.filter((field) => {
    const capability = resolveWorkItemContentCapability(
      fields,
      field,
      loadState,
    );
    if (capability === 'supported') {
      return true;
    }
    if (capability === 'unsupported') {
      return false;
    }

    return hasOwnContentField(workItem, field);
  });
}

export function shouldIncludeAcceptanceCriteria(
  fields: readonly WorkItemFieldConfig[] | undefined,
  workItem: WorkItemFields | null | undefined,
  loadState: ContentMetadataLoadState = 'loaded',
): boolean {
  const capability = resolveWorkItemContentCapability(
    fields,
    'acceptanceCriteria',
    loadState,
  );
  if (capability === 'supported') {
    return true;
  }
  if (capability === 'unsupported') {
    return false;
  }

  return hasOwnContentField(workItem, 'acceptanceCriteria');
}

export function hasOwnContentField(
  workItem: WorkItemFields | null | undefined,
  field: RefinableWorkItemField,
): boolean {
  return !!workItem && Object.prototype.hasOwnProperty.call(workItem, field);
}
