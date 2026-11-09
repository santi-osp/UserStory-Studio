import { WorkItemWorkspaceStateService } from './work-item-workspace-state.service';

describe('WorkItemWorkspaceStateService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('keeps the prompt and source only in the current service instance', () => {
    const service = new WorkItemWorkspaceStateService();
    service.setPrompt('prompt arquitecto', 'work-item-json-builder');

    expect(service.getPromptSnapshot()).toBe('prompt arquitecto');
    expect(service.getPreviewReturnRoute()).toBe('/crear-desde-texto');
    expect(service.getPreviewSource()).toBe('fromText');
    expect(localStorage.length).toBe(0);

    const refreshedService = new WorkItemWorkspaceStateService();
    expect(refreshedService.getPromptSnapshot()).toBe('');
    expect(refreshedService.getPreviewReturnRoute()).toBe('/disenar-work-item');
    expect(refreshedService.getPreviewSource()).toBe('designer');
  });

  it('creates a one-time request when opening preview', () => {
    const service = new WorkItemWorkspaceStateService();
    const basePayload = {
      azdoOrg: 'org',
      azdoProject: 'project',
      iterationPath: 'project\\sprint',
      areaPath: 'project\\area',
      workItemType: 'User Story',
      workItem: {
        title: 'Historia',
        description: '<p>desc</p>',
        acceptanceCriteria: '',
        priority: '',
        risk: '',
        startDate: '',
        finishDate: '',
        valueArea: 'Negocio',
        tipoHU: '',
        frenteDeTrabajo: '',
        assignedTo: '',
      },
      testCases: [],
      testSuite: { planId: 10 },
    };

    service.preparePreview('prompt builder', 'builder', basePayload);
    basePayload.workItem.valueArea = '';

    expect(service.consumePreviewRequest()).toEqual({
      prompt: 'prompt builder',
      systemPrompt: '',
      requestId: 1,
      basePayload: jasmine.objectContaining({
        workItem: jasmine.objectContaining({ valueArea: 'Negocio' }),
        testSuite: { planId: 10 },
      }),
    });
    expect(service.consumePreviewRequest()).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
