import { WorkItemFieldConfig, WorkItemPayload } from '../models/types';
import {
  buildCreateWorkItemRequest,
  normalizeCreateDateTime,
} from './work-item-create-request';

describe('work-item-create-request', () => {
  const fields: WorkItemFieldConfig[] = [
    field('System.Title', 'Title'),
    field('System.Description', 'Description'),
    field('Microsoft.VSTS.Common.AcceptanceCriteria', 'Acceptance Criteria'),
    field('Microsoft.VSTS.Common.ValueArea', 'Value Area'),
    field('System.AssignedTo', 'Assigned To'),
    field('Microsoft.VSTS.Scheduling.StartDate', 'Start Date', 'datetime'),
    field('Microsoft.VSTS.Scheduling.FinishDate', 'Finish Date', 'datetime'),
    field('Custom.FrentedeTrabajo', 'Frente de trabajo'),
    field('Microsoft.VSTS.Common.Priority', 'Priority', 'integer'),
    field('Microsoft.VSTS.Common.Risk', 'Risk'),
    field('Microsoft.VSTS.Scheduling.StoryPoints', 'Story Points', 'number'),
    field('Custom.TipoHU', 'Tipo HU'),
  ];

  it('builds canonical create request with hu and referenceName fields', () => {
    const request = buildCreateWorkItemRequest(createPayload(), fields);

    expect(
      (request as unknown as { workItem?: unknown }).workItem,
    ).toBeUndefined();
    expect(request.iterationPath).toBe('Pruebas Integracion/Iteration 1');
    expect(request.hu).toEqual(
      jasmine.objectContaining({
        title: 'Crear HU',
        description: '<p>Descripcion</p>',
        acceptanceCriteria: '<p>AC</p>',
        'Microsoft.VSTS.Common.ValueArea': 'Architectural',
        'System.AssignedTo': 'usuario@empresa.com',
        'Custom.FrentedeTrabajo': 'OptimizacionBackEnd',
        'Microsoft.VSTS.Common.Priority': '2',
        'Microsoft.VSTS.Common.Risk': '1 - High',
        'Microsoft.VSTS.Scheduling.StoryPoints': '3',
        'Custom.TipoHU': 'Funcional',
      }),
    );
    expect(request.hu['valueArea']).toBeUndefined();
    expect(request.hu['assignedTo']).toBeUndefined();
    expect(request.hu['startDate']).toBeUndefined();
    expect(request.hu['finishDate']).toBeUndefined();
    expect(request.hu['priority']).toBeUndefined();
    expect(request.hu['risk']).toBeUndefined();
    expect(request.hu['storyPoints']).toBeUndefined();
    expect(request.hu['tipoHU']).toBeUndefined();
    expect(request.hu['frenteDeTrabajo']).toBeUndefined();
  });

  it('omits empty date fields', () => {
    const payload = createPayload();
    payload.workItem.finishDate = '';

    const request = buildCreateWorkItemRequest(payload, fields);

    expect(request.hu['Microsoft.VSTS.Scheduling.FinishDate']).toBeUndefined();
  });

  it('omits acceptance criteria when complete metadata confirms it is unsupported', () => {
    const request = buildCreateWorkItemRequest(createPayload(), [
      field('System.Title', 'Title'),
      field('System.Description', 'Description'),
    ]);

    expect(request.hu['acceptanceCriteria']).toBeUndefined();
  });

  it('keeps explicit acceptance criteria for an incomplete legacy response', () => {
    const request = buildCreateWorkItemRequest(createPayload(), [
      field('Microsoft.VSTS.Common.Priority', 'Priority'),
    ]);

    expect(request.hu['acceptanceCriteria']).toBe('<p>AC</p>');
  });

  it('converts date-only values to local noon as UTC ISO', () => {
    expect(normalizeCreateDateTime('2026-07-21')).toBe(
      new Date(2026, 6, 21, 12, 0, 0, 0).toISOString(),
    );
  });

  it('converts datetime-local values to UTC ISO without ambiguity', () => {
    expect(normalizeCreateDateTime('2026-07-21T12:09')).toBe(
      new Date(2026, 6, 21, 12, 9, 0, 0).toISOString(),
    );
  });

  it('normalizes explicit offset or UTC without double conversion', () => {
    expect(normalizeCreateDateTime('2026-07-21T12:09:00-05:00')).toBe(
      '2026-07-21T17:09:00.000Z',
    );
    expect(normalizeCreateDateTime('2026-07-21T17:09:00.000Z')).toBe(
      '2026-07-21T17:09:00.000Z',
    );
  });

  function createPayload(): WorkItemPayload {
    return {
      azdoOrg: 'org',
      azdoProject: 'Pruebas Integracion',
      workItemType: 'User Story',
      iterationPath: 'Pruebas Integracion\\Iteration 1',
      areaPath: 'Pruebas Integracion',
      workItem: {
        title: 'Crear HU',
        description: '<p>Descripcion</p>',
        acceptanceCriteria: '<p>AC</p>',
        valueArea: 'Architectural',
        assignedTo: 'usuario@empresa.com',
        startDate: '2026-07-21T12:09',
        finishDate: '2026-07-22',
        frenteDeTrabajo: 'OptimizacionBackEnd',
        priority: '2',
        risk: '1 - High',
        storyPoints: '3',
        tipoHU: 'Funcional',
      },
      testCases: [],
      testSuite: {
        planId: 0,
      },
    };
  }

  function field(
    referenceName: string,
    label: string,
    type = 'string',
  ): WorkItemFieldConfig {
    return {
      name: label,
      referenceName,
      label,
      type,
      required: false,
      control: type === 'datetime' ? 'datetime' : 'input',
      options: [],
    };
  }
});
