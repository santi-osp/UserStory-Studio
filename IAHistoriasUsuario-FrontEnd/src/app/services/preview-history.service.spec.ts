import { WorkItemPayload } from '../models/types';
import {
  PREVIEW_HISTORY_STORAGE_KEY,
  PreviewHistoryService,
} from './preview-history.service';

describe('PreviewHistoryService', () => {
  const storageKey = PREVIEW_HISTORY_STORAGE_KEY;

  const createPayload = (title: string): WorkItemPayload => ({
    azdoOrg: 'org',
    azdoProject: 'project',
    iterationPath: 'project\\sprint',
    areaPath: 'project\\area',
    workItemType: 'User Story',
    workItem: {
      title,
      description: '<p>Descripción</p>',
      acceptanceCriteria: '<p>Criterios</p>',
      priority: 1,
      risk: '2 - Medium',
      startDate: '',
      finishDate: '',
      valueArea: '',
      tipoHU: '',
      frenteDeTrabajo: '',
      assignedTo: '',
    },
    testCases: [
      {
        title: 'TC 1',
        state: 'Ready',
        steps: [{ action: 'Acción', expected: 'Resultado' }],
      },
    ],
    testSuite: {
      planId: 10,
    },
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores the newest five previews in sessionStorage', () => {
    const service = new PreviewHistoryService();

    for (let index = 1; index <= 6; index += 1) {
      service.save(createPayload(`Work Item ${index}`), 'designer');
    }

    const history = service.getHistory();
    expect(history.length).toBe(5);
    expect(history.map((item) => item.title)).toEqual([
      'Work Item 6',
      'Work Item 5',
      'Work Item 4',
      'Work Item 3',
      'Work Item 2',
    ]);
    expect(sessionStorage.getItem(storageKey)).not.toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('does not create identical consecutive versions', () => {
    const service = new PreviewHistoryService();
    const payload = createPayload('Work Item repetido');

    service.save(payload, 'designer');
    service.save(payload, 'fromText');

    const history = service.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].source).toBe('designer');
    expect(history[0].versionType).toBe('generated');
  });

  it('removes sensitive and technical fields recursively', () => {
    const service = new PreviewHistoryService();
    const payload = createPayload('Work Item seguro');
    Object.assign(payload.workItem, {
      azurePat: 'test-pat-placeholder',
      AzurePat: 'secret-2',
      headers: { authorization: 'secret-3' },
      logs: ['technical log'],
    });

    service.save(payload, 'designer');

    const stored = sessionStorage.getItem(storageKey) ?? '';
    expect(stored).not.toContain('secret');
    expect(stored).not.toContain('azurePat');
    expect(stored).not.toContain('AzurePat');
    expect(stored).not.toContain('headers');
    expect(stored).not.toContain('logs');
  });

  it('rebuilds stored entries without forbidden keys or prototype pollution', () => {
    const service = new PreviewHistoryService();
    const seed = service.save(createPayload('Entrada segura'), 'designer')[0];
    const unsafePayload = {
      ...seed.payload,
      ['__proto__']: { polluted: true },
      apiKey: 'secret-api-key',
      workItem: {
        ...seed.payload.workItem,
        constructor: { prototype: { polluted: true } },
      },
    } as unknown as WorkItemPayload;
    const normalizedJson = service.fingerprint(unsafePayload);
    sessionStorage.setItem(
      storageKey,
      JSON.stringify([
        {
          ...seed,
          payload: unsafePayload,
          normalizedJson,
          fingerprint: normalizedJson,
          token: 'secret-token',
        },
      ]),
    );

    const restored = service.getHistory();
    const restoredJson = JSON.stringify(restored);
    expect(restored.length).toBe(1);
    expect(restoredJson).not.toContain('__proto__');
    expect(restoredJson).not.toContain('constructor');
    expect(restoredJson).not.toContain('secret-api-key');
    expect(restoredJson).not.toContain('secret-token');
    expect(
      Object.prototype.hasOwnProperty.call(restored[0].payload, '__proto__'),
    ).toBeFalse();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('removes one item or clears the complete history', () => {
    const service = new PreviewHistoryService();
    service.save(createPayload('Work Item 1'), 'designer');
    const history = service.save(createPayload('Work Item 2'), 'fromText');

    const removedItem = history[0];
    const remaining = service.remove(removedItem.id);
    expect(remaining.map((item) => item.title)).toEqual(['Work Item 1']);

    const restored = service.restore(removedItem, 0);
    expect(restored.map((item) => item.title)).toEqual([
      'Work Item 2',
      'Work Item 1',
    ]);

    const restoredAgain = service.restore(removedItem, 0);
    expect(restoredAgain.map((item) => item.title)).toEqual([
      'Work Item 2',
      'Work Item 1',
    ]);

    service.clear();
    expect(service.getHistory()).toEqual([]);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('restores a sanitized item at its original position and keeps at most five entries', () => {
    const service = new PreviewHistoryService();
    for (let index = 1; index <= 5; index += 1) {
      service.save(createPayload(`Work Item ${index}`), 'designer');
    }
    const history = service.getHistory();
    const removed = history[2];
    Object.assign(removed.payload.workItem, {
      azurePat: 'test-pat-placeholder',
      headers: { authorization: 'secret-2' },
      logs: ['technical log'],
    });

    service.remove(removed.id);
    service.save(createPayload('Work Item nuevo'), 'fromText');
    const restored = service.restore(removed, 2);

    expect(restored.length).toBe(5);
    expect(restored[2].title).toBe(removed.title);
    expect(
      restored.filter((item) => item.normalizedJson === removed.normalizedJson)
        .length,
    ).toBe(1);
    const stored = sessionStorage.getItem(storageKey) ?? '';
    expect(stored).not.toContain('secret');
    expect(stored).not.toContain('azurePat');
    expect(stored).not.toContain('headers');
    expect(stored).not.toContain('logs');
  });

  it('does not store incomplete payloads', () => {
    const service = new PreviewHistoryService();
    const payload = createPayload('');

    expect(service.save(payload, 'designer')).toEqual([]);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('ignores corrupt or structurally invalid v2 entries', () => {
    const service = new PreviewHistoryService();
    sessionStorage.setItem(storageKey, '{invalid');
    expect(service.getHistory()).toEqual([]);

    sessionStorage.setItem(
      storageKey,
      JSON.stringify([
        { storageVersion: 2, id: 'incomplete' },
        {
          ...service.save(createPayload('Válida'), 'designer')[0],
          fingerprint: 'tampered',
        },
      ]),
    );
    expect(service.getHistory()).toEqual([]);
  });

  it('stores accepted content refinements with semantic metadata', () => {
    const service = new PreviewHistoryService();
    const history = service.save(
      createPayload('Refinamiento'),
      'fromText',
      'refinementAccepted',
      'content',
    );

    expect(history[0]).toEqual(
      jasmine.objectContaining({
        storageVersion: 2,
        source: 'fromText',
        versionType: 'refinementAccepted',
        refinementScope: 'content',
      }),
    );
  });

  it('returns immutable snapshots by cloning stored values', () => {
    const service = new PreviewHistoryService();
    const payload = createPayload('Original');
    const history = service.save(payload, 'designer');
    payload.workItem.title = 'Mutado afuera';
    history[0].payload.workItem.title = 'Mutado por consumidor';

    expect(service.getHistory()[0].payload.workItem.title).toBe('Original');
  });
});
