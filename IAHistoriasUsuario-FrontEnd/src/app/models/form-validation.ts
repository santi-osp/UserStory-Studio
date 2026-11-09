export type FormValidationIssueType =
  'required' | 'metadata' | 'configuration' | 'invalid';
export type FormValidationIssueSource =
  'form' | 'metadata' | 'ai-preflight' | 'creation-preflight';

export interface FormValidationIssue {
  key: string;
  referenceName?: string;
  type: FormValidationIssueType;
  message: string;
  controlId: string;
  order: number;
  section: string;
  source: FormValidationIssueSource;
}

export function validationIssueIdentity(
  issue: Pick<FormValidationIssue, 'key' | 'referenceName'>,
): string {
  return issue.referenceName
    ? `${issue.key}:${issue.referenceName}`
    : issue.key;
}
