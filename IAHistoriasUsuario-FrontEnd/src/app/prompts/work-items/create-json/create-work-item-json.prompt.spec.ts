import { WorkItemFieldConfig } from '../../../models/types';
import {
  generateWorkItemJsonPrompt,
  WorkItemJsonPromptInput,
} from './create-work-item-json.prompt';

describe('create-work-item-json.prompt', () => {
  const metadata: WorkItemFieldConfig[] = [
    field('title', 'System.Title', true),
    field('description', 'System.Description', true),
    field('acceptanceCriteria', 'Microsoft.VSTS.Common.AcceptanceCriteria'),
    field('priority', 'Microsoft.VSTS.Common.Priority'),
  ];
  const input = (
    overrides: Partial<WorkItemJsonPromptInput> = {},
  ): WorkItemJsonPromptInput => ({
    sourceWorkItemText: 'Contenido funcional',
    azdoOrg: 'org',
    azdoProject: 'project',
    workItemType: 'User Story',
    iterationPath: 'project/Iteration/Sprint 1',
    areaPath: 'project/Area/Equipo',
    useTestCases: false,
    testCaseCount: 3,
    testCaseState: 'Design',
    aiDecideTestCaseCount: false,
    testSuitePlanId: 0,
    dynamicWorkItemFields: { priority: '2' },
    workItemFieldConfigs: metadata,
    ...overrides,
  });

  it('uses the same contract shape and preserves supported empty Acceptance Criteria', () => {
    const result = generateWorkItemJsonPrompt(input());
    expect(result.jsonTemplate.workItem['acceptanceCriteria']).toBe('');
    expect(result.jsonTemplate.workItem['priority']).toBe('2');
    expect(result.contract.aiEditableWorkItemFields).toEqual([
      'title',
      'description',
      'acceptanceCriteria',
    ]);
    expect(result.prompt).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('omits Test Cases when disabled and applies fixed or AI count modes when enabled', () => {
    const disabled = generateWorkItemJsonPrompt(input());
    const fixed = generateWorkItemJsonPrompt(
      input({ useTestCases: true, testSuitePlanId: 10 }),
    );
    const ai = generateWorkItemJsonPrompt(
      input({
        useTestCases: true,
        aiDecideTestCaseCount: true,
        testSuitePlanId: 10,
      }),
    );
    expect(disabled.jsonTemplate.testCases).toBeUndefined();
    expect(disabled.prompt).not.toContain('testSuite.planId');
    expect(fixed.jsonTemplate.testCases?.length).toBe(3);
    expect(fixed.contract.testCases.countMode).toBe('fixed');
    expect(ai.jsonTemplate.testCases).toEqual([]);
    expect(ai.contract.testCases.countMode).toBe('ai');
  });

  it('does not allow Test Cases for Epic or Feature', () => {
    for (const workItemType of ['Epic', 'Feature']) {
      const result = generateWorkItemJsonPrompt(
        input({ workItemType, useTestCases: true, testSuitePlanId: 10 }),
      );
      expect(result.contract.testCases.enabled).toBeFalse();
      expect(result.jsonTemplate.testCases).toBeUndefined();
    }
  });

  it('rejects unknown types instead of converting them to User Story', () => {
    expect(() => generateWorkItemJsonPrompt(input({ workItemType: '' }))).toThrowError(
      /no es válido/,
    );
  });
});

function field(name: string, referenceName: string, required = false): WorkItemFieldConfig {
  return {
    name,
    referenceName,
    label: name,
    type: 'string',
    required,
    control: 'input',
    options: [],
  };
}
