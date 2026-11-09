import { FormValues, WorkItemFieldConfig } from '../../../models/types';
import { buildDesignWorkItemPrompt } from './design-work-item.prompt';

describe('design-work-item.prompt', () => {
  const fields = (acceptanceCriteria = true): WorkItemFieldConfig[] => [
    field('title', 'System.Title', true),
    field('description', 'System.Description', true),
    ...(acceptanceCriteria
      ? [field('acceptanceCriteria', 'Microsoft.VSTS.Common.AcceptanceCriteria')]
      : []),
    field('businessValue', 'Microsoft.VSTS.Common.BusinessValue'),
  ];

  const values = (overrides: Partial<FormValues> = {}): FormValues => ({
    need: 'Permitir consultar solicitudes',
    useTestCases: false,
    tcCount: 3,
    tcState: 'Design',
    azdoOrg: 'org',
    azdoProject: 'Proyecto',
    workItemType: 'User Story',
    iterationPath: 'Proyecto/Iteration/Sprint 1',
    areaPath: 'Proyecto/Area/Equipo',
    workItem: {
      title: '',
      description: '',
      acceptanceCriteria: '',
      priority: '',
      risk: '',
      startDate: '',
      finishDate: '',
      valueArea: '',
      tipoHU: '',
      frenteDeTrabajo: '',
      assignedTo: '',
    },
    dynamicWorkItemFields: { businessValue: 10 },
    workItemFieldConfigs: fields(),
    testCases: [],
    testSuite: { planId: 0 },
    aiFields: { cantidadTestcases: false },
    ...overrides,
  });

  for (const workItemType of ['Epic', 'Feature', 'User Story'] as const) {
    it(`keeps optional empty Acceptance Criteria in the ${workItemType} AI template`, () => {
      const result = buildDesignWorkItemPrompt(values({ workItemType }));
      expect(result.finalJson.workItem.acceptanceCriteria).toBe('');
      expect(result.contract.acceptanceCriteria).toEqual(
        jasmine.objectContaining({
          supported: true,
          requiredByAzure: false,
          requiredForGeneration: true,
        }),
      );
      expect(result.contract.aiEditableWorkItemFields).toContain(
        'acceptanceCriteria',
      );
      expect(result.prompt).toContain('"acceptanceCriteria": ""');
      expect(result.prompt).not.toMatch(/\{\{[^}]+\}\}/);
    });
  }

  it('omits unsupported Acceptance Criteria everywhere', () => {
    const result = buildDesignWorkItemPrompt(
      values({ workItemFieldConfigs: fields(false) }),
    );
    expect(result.finalJson.workItem.acceptanceCriteria).toBeUndefined();
    expect(result.contract.allowedWorkItemFields).not.toContain(
      'acceptanceCriteria',
    );
    expect(result.contract.aiEditableWorkItemFields).not.toContain(
      'acceptanceCriteria',
    );
    expect(result.prompt).toContain(
      'No incluyas acceptanceCriteria porque la metadata no lo soporta',
    );
  });

  it('uses distinct semantic templates and preserves user fields', () => {
    const epic = buildDesignWorkItemPrompt(values({ workItemType: 'Epic' }));
    const feature = buildDesignWorkItemPrompt(
      values({ workItemType: 'Feature' }),
    );
    const story = buildDesignWorkItemPrompt(values());
    expect(epic.finalJson.workItem.description).toContain('Visión o iniciativa');
    expect(feature.finalJson.workItem.description).toContain('Capacidad funcional');
    expect(story.finalJson.workItem.description).toContain('<strong>Rol:</strong>');
    expect(epic.finalJson.workItem['businessValue']).toBe(10);
    expect(epic.contract.preservedWorkItemFields).toContain('businessValue');
  });

  it('enables Test Cases only for a fully configured User Story', () => {
    const story = buildDesignWorkItemPrompt(
      values({ useTestCases: true, testSuite: { planId: 12 } }),
    );
    const epic = buildDesignWorkItemPrompt(
      values({ workItemType: 'Epic', useTestCases: true, testSuite: { planId: 12 } }),
    );
    expect(story.contract.testCases.enabled).toBeTrue();
    expect(story.finalJson.testCases.length).toBe(3);
    expect(story.finalJson.testSuite.planId).toBe(12);
    expect(epic.contract.testCases.enabled).toBeFalse();
    expect(epic.contract.aiTemplate.testCases).toBeUndefined();
  });

  it('rejects unknown type and incomplete metadata before building a prompt', () => {
    expect(() => buildDesignWorkItemPrompt(values({ workItemType: 'Bug' }))).toThrowError(
      /no es válido/,
    );
    expect(() =>
      buildDesignWorkItemPrompt(values({ workItemFieldConfigs: [field('title', 'System.Title', true)] })),
    ).toThrowError(/System.Title y System.Description/);
  });
});

function field(
  name: string,
  referenceName: string,
  required = false,
): WorkItemFieldConfig {
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
