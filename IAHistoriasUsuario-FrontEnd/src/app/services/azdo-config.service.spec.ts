import { AzdoMetadataResult } from '../models/types';
import { AzdoConfigService } from './azdo-config.service';

describe('AzdoConfigService', () => {
  const configKey = 'hu.azdo.config.v2';
  const legacyMetadataKey = 'work-item.azdo.metadata.v1';
  const legacyConnectionKey = 'hu.azdo.connection.session.v1';
  const informationKey = 'hu.azdo.session-information.v1';
  const loadedAt = '2026-07-27T20:15:00.000Z';
  const metadata: AzdoMetadataResult = {
    projects: ['Proyecto A', 'Proyecto A', ' Proyecto B '],
    areaPaths: ['Proyecto A/Area', 'Proyecto A/Area'],
    iterationPaths: ['Proyecto A/Sprint 1'],
    projectMetadata: [
      {
        project: 'Proyecto A',
        areaPaths: ['Proyecto A/Area'],
        iterationPaths: ['Proyecto A/Sprint 1'],
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists only the non-sensitive organization configuration', () => {
    const service = new AzdoConfigService();
    service.setOrganization(' ExampleOrg ');
    service.setRuntimeCredential('test-pat-placeholder');

    const persisted = JSON.parse(localStorage.getItem(configKey) ?? '{}') as {
      organization?: string;
      credential?: string;
    };
    expect(persisted.organization).toBe('ExampleOrg');
    expect(persisted.credential).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toContain('test-pat-placeholder');
  });

  it('stores loaded information in sessionStorage and never in localStorage', () => {
    const service = new AzdoConfigService();
    service.setOrganization('ExampleOrg');
    service.setMetadata(metadata, loadedAt);

    const persisted = JSON.parse(
      sessionStorage.getItem(informationKey) ?? '{}',
    );
    expect(persisted).toEqual(
      jasmine.objectContaining({
        version: 1,
        organization: 'ExampleOrg',
        loadedAt,
        projects: ['Proyecto A', 'Proyecto B'],
      }),
    );
    expect(localStorage.getItem(informationKey)).toBeNull();
    expect(localStorage.getItem(legacyMetadataKey)).toBeNull();
  });

  it('restores and normalizes information when the service is recreated in the same tab', () => {
    const first = new AzdoConfigService();
    first.setOrganization('ExampleOrg');
    first.setMetadata(metadata, loadedAt);

    const restored = new AzdoConfigService();
    expect(restored.getSessionInformationSnapshot()).toEqual(
      jasmine.objectContaining({
        organization: 'ExampleOrg',
        loadedAt,
        projects: ['Proyecto A', 'Proyecto B'],
      }),
    );
    expect(restored.getMetadataSnapshot().projects).toEqual([
      'Proyecto A',
      'Proyecto B',
    ]);
  });

  it('does not restore information after sessionStorage is cleared', () => {
    const first = new AzdoConfigService();
    first.setOrganization('ExampleOrg');
    first.setMetadata(metadata, loadedAt);
    sessionStorage.clear();

    const restored = new AzdoConfigService();
    expect(restored.getSessionInformationSnapshot()).toBeNull();
    expect(restored.getMetadataSnapshot().projects).toEqual([]);
  });

  it('removes legacy browser entries without migrating their content', () => {
    localStorage.setItem(legacyMetadataKey, JSON.stringify(metadata));
    sessionStorage.setItem(
      legacyConnectionKey,
      JSON.stringify({ version: 1, organization: 'ExampleOrg' }),
    );

    const service = new AzdoConfigService();
    expect(localStorage.getItem(legacyMetadataKey)).toBeNull();
    expect(sessionStorage.getItem(legacyConnectionKey)).toBeNull();
    expect(sessionStorage.getItem(informationKey)).toBeNull();
    expect(service.getMetadataSnapshot().projects).toEqual([]);
  });

  it('removes corrupt, incomplete and incompatible session entries', () => {
    localStorage.setItem(
      configKey,
      JSON.stringify({
        version: 2,
        organization: 'ExampleOrg',
        correlationId: 'cid',
      }),
    );
    const invalidValues = [
      '{not-json',
      JSON.stringify({ version: 2, organization: 'ExampleOrg' }),
      JSON.stringify({
        version: 1,
        organization: 'ExampleOrg',
        loadedAt,
        projects: [],
        areaPaths: [],
        iterationPaths: [],
      }),
      JSON.stringify({
        version: 1,
        organization: 'ExampleOrg',
        loadedAt: 'not-a-date',
        projects: [],
        areaPaths: [],
        iterationPaths: [],
        projectMetadata: [],
      }),
      JSON.stringify({
        version: 1,
        organization: 'ExampleOrg',
        loadedAt,
        projects: [],
        areaPaths: [],
        iterationPaths: [],
        projectMetadata: [],
        authorization: 'must-not-be-restored',
      }),
    ];

    for (const value of invalidValues) {
      sessionStorage.setItem(informationKey, value);
      const service = new AzdoConfigService();
      expect(service.getSessionInformationSnapshot()).toBeNull();
      expect(sessionStorage.getItem(informationKey)).toBeNull();
    }
  });

  it('removes session information when its organization does not match', () => {
    localStorage.setItem(
      configKey,
      JSON.stringify({
        version: 2,
        organization: 'ExampleOrg',
        correlationId: 'cid',
      }),
    );
    sessionStorage.setItem(
      informationKey,
      JSON.stringify({
        version: 1,
        organization: 'OtherOrg',
        loadedAt,
        projects: [],
        areaPaths: [],
        iterationPaths: [],
        projectMetadata: [],
      }),
    );

    const service = new AzdoConfigService();
    expect(service.getSessionInformationSnapshot()).toBeNull();
    expect(sessionStorage.getItem(informationKey)).toBeNull();
  });

  it('invalidates information and the PAT only for a real organization change', () => {
    const service = new AzdoConfigService();
    service.setOrganization('ExampleOrg');
    service.setRuntimeCredential('test-pat-placeholder');
    service.setMetadata(metadata, loadedAt);

    service.setOrganization(' exampleorg ');
    expect(service.getSessionInformationSnapshot()).not.toBeNull();
    expect(service.hasRuntimeCredential()).toBeTrue();

    service.setOrganization('OtherOrg');
    expect(service.getSessionInformationSnapshot()).toBeNull();
    expect(service.getMetadataSnapshot().projects).toEqual([]);
    expect(service.hasRuntimeCredential()).toBeFalse();
  });

  it('keeps information and loadedAt when the PAT changes or is cleared', () => {
    const service = new AzdoConfigService();
    service.setOrganization('ExampleOrg');
    service.setRuntimeCredential('first-placeholder');
    service.setMetadata(metadata, loadedAt);
    const firstRequest = service.beginInformationRequest();

    service.setRuntimeCredential('second-placeholder');
    expect(service.getSessionInformationSnapshot()?.loadedAt).toBe(loadedAt);
    expect(service.getMetadataSnapshot().projects).toEqual([
      'Proyecto A',
      'Proyecto B',
    ]);
    expect(
      firstRequest && service.isInformationRequestCurrent(firstRequest),
    ).toBeFalse();

    service.clearRuntimeCredential();
    expect(service.getSessionInformationSnapshot()?.loadedAt).toBe(loadedAt);
    expect(service.getMetadataSnapshot().projects.length).toBe(2);
  });

  it('persists only the documented information fields and no secret material', () => {
    const service = new AzdoConfigService();
    service.setOrganization('ExampleOrg');
    service.setRuntimeCredential('test-pat-placeholder');
    service.setMetadata(metadata, loadedAt);

    const persisted = JSON.parse(
      sessionStorage.getItem(informationKey) ?? '{}',
    ) as Record<string, unknown>;
    expect(Object.keys(persisted).sort()).toEqual(
      [
        'areaPaths',
        'iterationPaths',
        'loadedAt',
        'organization',
        'projectMetadata',
        'projects',
        'version',
      ].sort(),
    );
    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain('test-pat-placeholder');
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('prompt');
    expect(serialized).not.toContain('testPlans');
    expect(serialized).not.toContain('workItemConfig');
  });

  it('merges duplicate project catalogs while restoring normalized paths', () => {
    const service = new AzdoConfigService();
    service.setOrganization('ExampleOrg');
    service.setMetadata(
      {
        projects: ['Proyecto A'],
        areaPaths: [],
        iterationPaths: [],
        projectMetadata: [
          {
            project: 'Proyecto A',
            areaPaths: ['Area 1'],
            iterationPaths: ['Sprint 1'],
          },
          {
            project: 'Proyecto A',
            areaPaths: ['Area 1', 'Area 2'],
            iterationPaths: ['Sprint 2'],
          },
        ],
      },
      loadedAt,
    );

    expect(service.getMetadataSnapshot().projectMetadata).toEqual([
      {
        project: 'Proyecto A',
        areaPaths: ['Area 1', 'Area 2'],
        iterationPaths: ['Sprint 1', 'Sprint 2'],
      },
    ]);
  });

  it('starts an information request only with organization and runtime PAT', () => {
    const service = new AzdoConfigService();
    expect(service.beginInformationRequest()).toBeNull();

    service.setOrganization('ExampleOrg');
    expect(service.beginInformationRequest()).toBeNull();

    service.setRuntimeCredential('test-pat-placeholder');
    expect(service.beginInformationRequest()).toEqual(
      jasmine.objectContaining({ organization: 'ExampleOrg' }),
    );
  });

  it('restores information when organization casing differs', () => {
    localStorage.setItem(
      configKey,
      JSON.stringify({
        version: 2,
        organization: 'exampleorg',
        correlationId: 'cid',
      }),
    );
    sessionStorage.setItem(
      informationKey,
      JSON.stringify({
        version: 1,
        organization: 'ExampleOrg',
        loadedAt,
        projects: ['Proyecto A'],
        areaPaths: [],
        iterationPaths: [],
        projectMetadata: [],
      }),
    );

    expect(
      new AzdoConfigService().getSessionInformationSnapshot()?.projects,
    ).toEqual(['Proyecto A']);
  });

  it('updates loadedAt only when new information is accepted', () => {
    const service = new AzdoConfigService();
    service.setOrganization('ExampleOrg');
    service.setMetadata(metadata, loadedAt);
    const nextLoadedAt = '2026-07-28T10:00:00.000Z';

    service.setMetadata(metadata, nextLoadedAt);

    expect(service.getSessionInformationSnapshot()?.loadedAt).toBe(
      nextLoadedAt,
    );
  });

  it('clears session information when organization is removed', () => {
    const service = new AzdoConfigService();
    service.setOrganization('ExampleOrg');
    service.setMetadata(metadata, loadedAt);

    service.setOrganization('');

    expect(service.getSessionInformationSnapshot()).toBeNull();
    expect(sessionStorage.getItem(informationKey)).toBeNull();
  });
});
