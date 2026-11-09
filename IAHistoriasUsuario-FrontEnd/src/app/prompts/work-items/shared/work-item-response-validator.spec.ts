import { WorkItemFieldConfig } from '../../../models/types';
import {
  buildWorkItemPromptContract,
  promptTemplateToPayload,
} from './work-item-prompt-contract';
import { validateGeneratedWorkItemResponse } from './work-item-response-validator';

describe('validateGeneratedWorkItemResponse', () => {
  const metadata: WorkItemFieldConfig[] = [
    field('title', 'System.Title', true),
    field('description', 'System.Description', true),
    field('acceptanceCriteria', 'Microsoft.VSTS.Common.AcceptanceCriteria'),
    field('priority', 'Microsoft.VSTS.Common.Priority'),
  ];

  function fixture(useTestCases = false) {
    const contract = buildWorkItemPromptContract({
      workItemType: 'User Story',
      workItemFieldConfigs: metadata,
      azdoOrg: 'org',
      azdoProject: 'project',
      iterationPath: 'project/Iteration/Sprint 1',
      areaPath: 'project/Area/Equipo',
      preservedWorkItemFields: { priority: '2' },
      useTestCases,
      aiDecideTestCaseCount: false,
      testCaseCount: 1,
      testCaseState: 'Design',
      testSuitePlanId: useTestCases ? 10 : 0,
    });
    const base = promptTemplateToPayload(contract.aiTemplate);
    const response: Record<string, unknown> = {
      azdoOrg: base.azdoOrg,
      azdoProject: base.azdoProject,
      workItemType: base.workItemType,
      iterationPath: base.iterationPath,
      areaPath: base.areaPath,
      workItem: {
        title: 'Consultar solicitudes',
        description: '<p>Descripción funcional</p>',
        acceptanceCriteria:
          '<p><strong>AC1 - Escenario: consulta</strong><br>Dado un usuario Cuando consulta Entonces ve resultados</p>',
        priority: '2',
      },
      ...(useTestCases
        ? {
            testCases: [
              {
                title: 'Consulta exitosa',
                state: 'Design',
                steps: [{ action: 'Consultar', expected: 'Ver resultados' }],
              },
            ],
            testSuite: { planId: 10 },
          }
        : {}),
    };
    return { contract, base, response };
  }

  it('accepts a response that satisfies the contract', () => {
    const { contract, base, response } = fixture();
    const result = validateGeneratedWorkItemResponse(response, contract, base);
    expect(result.valid).toBeTrue();
    expect(result.payload?.workItem.priority).toBe('2');
  });

  for (const mutation of [
    ['changed context', (response: Record<string, unknown>) => (response['azdoProject'] = 'other')],
    ['different type', (response: Record<string, unknown>) => (response['workItemType'] = 'Epic')],
    ['unknown field', (response: Record<string, unknown>) => ((response['workItem'] as Record<string, unknown>)['valueArea2'] = 'x')],
    ['empty title', (response: Record<string, unknown>) => ((response['workItem'] as Record<string, unknown>)['title'] = '')],
    ['empty description', (response: Record<string, unknown>) => ((response['workItem'] as Record<string, unknown>)['description'] = '<p><br></p>')],
    ['missing Acceptance Criteria', (response: Record<string, unknown>) => delete (response['workItem'] as Record<string, unknown>)['acceptanceCriteria']],
    ['unexpected Test Cases', (response: Record<string, unknown>) => (response['testCases'] = [])],
  ] as const) {
    it(`rejects ${mutation[0]}`, () => {
      const { contract, base, response } = fixture();
      mutation[1](response);
      expect(validateGeneratedWorkItemResponse(response, contract, base).valid).toBeFalse();
    });
  }

  it('restores protected fields from the base payload instead of trusting IA values', () => {
    const { contract, base, response } = fixture();
    (response['workItem'] as Record<string, unknown>)['priority'] = '1';

    const result = validateGeneratedWorkItemResponse(response, contract, base);

    expect(result.valid).toBeTrue();
    expect(result.payload?.workItem.priority).toBe('2');
  });

  for (const mutation of [
    ['incorrect Test Case count', (response: Record<string, unknown>) => (response['testCases'] = [])],
    ['changed Test Case state', (response: Record<string, unknown>) => ((response['testCases'] as Record<string, unknown>[])[0])['state'] = 'Ready'],
    ['empty Test Case steps', (response: Record<string, unknown>) => ((response['testCases'] as Record<string, unknown>[])[0])['steps'] = []],
    ['changed Test Plan', (response: Record<string, unknown>) => ((response['testSuite'] as Record<string, unknown>)['planId'] = 99)],
    ['more than 50 Test Cases', (response: Record<string, unknown>) => (response['testCases'] = Array.from({ length: 51 }, () => ({ title: 'Caso', state: 'Design', steps: [{ action: 'A', expected: 'E' }] })))],
  ] as const) {
    it(`rejects ${mutation[0]}`, () => {
      const { contract, base, response } = fixture(true);
      mutation[1](response);
      expect(validateGeneratedWorkItemResponse(response, contract, base).valid).toBeFalse();
    });
  }

  it('rejects Acceptance Criteria when metadata does not support it', () => {
    const { contract, base, response } = fixture();
    const noAcceptanceContract = buildWorkItemPromptContract({
      workItemType: 'User Story',
      workItemFieldConfigs: metadata.filter(
        (item) => item.referenceName !== 'Microsoft.VSTS.Common.AcceptanceCriteria',
      ),
      azdoOrg: 'org',
      azdoProject: 'project',
      iterationPath: base.iterationPath,
      areaPath: base.areaPath,
      preservedWorkItemFields: { priority: '2' },
      useTestCases: false,
      aiDecideTestCaseCount: false,
      testCaseCount: 1,
      testCaseState: '',
      testSuitePlanId: 0,
    });
    const noAcceptanceBase = promptTemplateToPayload(
      noAcceptanceContract.aiTemplate,
    );
    expect(
      validateGeneratedWorkItemResponse(
        response,
        noAcceptanceContract,
        noAcceptanceBase,
      ).valid,
    ).toBeFalse();
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
