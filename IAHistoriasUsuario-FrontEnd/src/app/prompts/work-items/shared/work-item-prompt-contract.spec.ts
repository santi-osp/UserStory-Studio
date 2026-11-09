import { WorkItemFieldConfig } from '../../../models/types';
import { generateWorkItemJsonPrompt } from '../create-json/create-work-item-json.prompt';
import { buildDesignWorkItemPrompt } from '../design/design-work-item.prompt';

describe('WorkItemPromptContract parity', () => {
  const fields: WorkItemFieldConfig[] = [
    field('title', 'System.Title', true),
    field('description', 'System.Description', true),
    field('acceptanceCriteria', 'Microsoft.VSTS.Common.AcceptanceCriteria'),
    field('businessValue', 'Microsoft.VSTS.Common.BusinessValue'),
  ];

  it('produces the same contract for Designer and Create from text', () => {
    const design = buildDesignWorkItemPrompt({
      need: 'Contenido guiado',
      useTestCases: true,
      tcCount: 2,
      tcState: 'Design',
      azdoOrg: 'org',
      azdoProject: 'project',
      workItemType: 'User Story',
      iterationPath: 'project/Iteration/Sprint 1',
      areaPath: 'project/Area/Equipo',
      workItem: {} as never,
      dynamicWorkItemFields: { businessValue: 10 },
      workItemFieldConfigs: fields,
      testCases: [],
      testSuite: { planId: 20 },
      aiFields: { cantidadTestcases: false },
    });
    const fromText = generateWorkItemJsonPrompt({
      sourceWorkItemText: 'Contenido libre',
      azdoOrg: 'org',
      azdoProject: 'project',
      workItemType: 'User Story',
      iterationPath: 'project/Iteration/Sprint 1',
      areaPath: 'project/Area/Equipo',
      useTestCases: true,
      testCaseCount: 2,
      testCaseState: 'Design',
      aiDecideTestCaseCount: false,
      testSuitePlanId: 20,
      dynamicWorkItemFields: { businessValue: 10 },
      workItemFieldConfigs: fields,
    });

    expect(fromText.contract).toEqual(design.contract);
    expect(fromText.jsonTemplate).toEqual(design.contract.aiTemplate);
    expect(Object.isFrozen(design.contract)).toBeTrue();
    expect(Object.isFrozen(design.contract.aiTemplate.workItem)).toBeTrue();
  });

  it('separates Azure-required and generation-required fields', () => {
    const result = generateWorkItemJsonPrompt(baseInput());
    expect(result.contract.azureRequiredWorkItemFields).toEqual([
      'title',
      'description',
    ]);
    expect(result.contract.generationRequiredWorkItemFields).toEqual([
      'title',
      'description',
      'acceptanceCriteria',
    ]);
  });

  it('classifies read-only metadata as prohibited', () => {
    const result = generateWorkItemJsonPrompt(
      baseInput({
        workItemFieldConfigs: [
          ...fields,
          { ...field('state', 'System.State'), isReadOnly: true },
        ],
      }),
    );
    expect(result.contract.prohibitedWorkItemFields).toContain('state');
    expect(result.contract.allowedWorkItemFields).not.toContain('state');
  });

  it('omits optional preserved fields without a user value', () => {
    const result = generateWorkItemJsonPrompt(
      baseInput({ dynamicWorkItemFields: { businessValue: '' } }),
    );
    expect(result.jsonTemplate.workItem['businessValue']).toBeUndefined();
    expect(result.contract.allowedWorkItemFields).toContain('businessValue');
  });

  it('keeps AI-count mode distinct from the canonical fixed mode', () => {
    const result = generateWorkItemJsonPrompt(
      baseInput({ aiDecideTestCaseCount: true }),
    );
    expect(result.contract.testCases.countMode).toBe('ai');
    expect(result.contract.testCases.fixedCount).toBe(0);
    expect(result.jsonTemplate.testCases).toEqual([]);
  });

  function baseInput(
    overrides: Partial<Parameters<typeof generateWorkItemJsonPrompt>[0]> = {},
  ): Parameters<typeof generateWorkItemJsonPrompt>[0] {
    return {
      sourceWorkItemText: 'Contenido',
      azdoOrg: 'org',
      azdoProject: 'project',
      workItemType: 'User Story',
      iterationPath: 'project/Iteration/Sprint 1',
      areaPath: 'project/Area/Equipo',
      useTestCases: true,
      testCaseCount: 2,
      testCaseState: 'Design',
      aiDecideTestCaseCount: false,
      testSuitePlanId: 20,
      dynamicWorkItemFields: { businessValue: 10 },
      workItemFieldConfigs: fields,
      ...overrides,
    };
  }
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
