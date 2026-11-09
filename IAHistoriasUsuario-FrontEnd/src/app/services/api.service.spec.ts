import {
  TestBed,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApiRequestError, ApiService } from './api.service';
import { ApiErrorService } from './api-error.service';
import { httpErrorInterceptor } from '../interceptors/http-error.interceptor';
import { CreateWorkItemRequest, WorkItemPayload } from '../models/types';
import { AzdoConfigService } from './azdo-config.service';
import { environment } from '../../Environments/environment';
import { API_CLIENT_APP_NAME } from '../config/api-contract';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  let azdoConfigService: AzdoConfigService;

  const samplePayload: WorkItemPayload = {
    azdoOrg: 'org',
    azdoProject: 'proj',
    iterationPath: 'iter',
    areaPath: 'area',
    workItem: {
      title: 'title',
      description: 'desc',
      acceptanceCriteria: 'ac',
      priority: 1,
      risk: '2 - Medium',
      startDate: '2026-01-01T08:30',
      finishDate: '2026-01-15',
      valueArea: 'Business',
      tipoHU: 'Funcional',
      frenteDeTrabajo: 'Mejoras',
      assignedTo: '',
    },
    testCases: [
      {
        title: 'tc',
        state: 'Ready',
        steps: [{ action: 'do', expected: 'ok' }],
      },
    ],
    testSuite: {
      planId: 1,
    },
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        ApiService,
        ApiErrorService,
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
    azdoConfigService = TestBed.inject(AzdoConfigService);
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  const matchGenerateUrl = (url: string): boolean =>
    url.includes('/api/v1.0.0/generate');
  const matchGenerateTestCasesUrl = (url: string): boolean =>
    url.includes('/api/v1.0.0/generate-test-cases');
  const matchCreateUrl = (url: string): boolean =>
    url.includes('/api/v1.0.0/create');
  const matchMetadataUrl = (url: string): boolean =>
    url.includes('/api/v1.0.0/azdo/metadata');
  const matchWorkItemConfigUrl = (url: string): boolean =>
    url.includes('/api/v1.0.0/azdo/workitem-config');
  const matchTestPlansUrl = (url: string): boolean =>
    url.includes('/api/v1.0.0/azdo/test-plans');
  const matchEvaluateWorkItemUrl = (url: string): boolean =>
    url.includes('/api/v1.0.0/azdo/hu/evaluate');
  const matchSearchWorkItemsUrl = (url: string): boolean =>
    url.includes('/api/v1.0.0/azdo/hu/search');

  const flushCreateWorkItemConfig = (): void => {
    const configReq = httpMock.expectOne(
      (request) =>
        matchWorkItemConfigUrl(request.urlWithParams) &&
        request.body.workItemType !== 'Test Case',
    );
    expect(configReq.request.method).toBe('POST');
    configReq.flush({
      project: 'proj',
      workItemType: 'User Story',
      fields: [
        field('System.Title', 'Title'),
        field('System.Description', 'Description'),
        field(
          'Microsoft.VSTS.Common.AcceptanceCriteria',
          'Acceptance Criteria',
        ),
        field('Microsoft.VSTS.Common.Priority', 'Priority', 'integer'),
        field('Microsoft.VSTS.Common.Risk', 'Risk'),
        field('Microsoft.VSTS.Scheduling.StartDate', 'Start Date', 'datetime'),
        field(
          'Microsoft.VSTS.Scheduling.FinishDate',
          'Finish Date',
          'datetime',
        ),
        field('Microsoft.VSTS.Common.ValueArea', 'Value Area'),
        field('Custom.TipoHU', 'Tipo HU'),
        field('Custom.FrentedeTrabajo', 'Frente de trabajo'),
        field('System.AssignedTo', 'Assigned To'),
      ],
    });
    const testCaseConfigReq = httpMock.expectOne(
      (request) =>
        matchWorkItemConfigUrl(request.urlWithParams) &&
        request.body.workItemType === 'Test Case',
    );
    expect(testCaseConfigReq.request.body.workItemType).toBe('Test Case');
    testCaseConfigReq.flush({
      project: 'proj',
      workItemType: 'Test Case',
      fields: [
        {
          ...field('System.State', 'State'),
          options: ['Ready', 'Design', 'Closed'],
        },
      ],
    });
  };

  it('generate should return response on success', async () => {
    const promise = service.generate({
      prompt: 'hello',
      systemPrompt: 'system',
    });
    const req = httpMock.expectOne((request) =>
      matchGenerateUrl(request.urlWithParams),
    );

    expect(req.request.method).toBe('POST');
    expect(req.request.url).toBe(
      'https://localhost:7071/api/v1.0.0/generate',
    );
    expect(req.request.body.prompt).toBe('hello');
    expect(req.request.body.azdoContext).toEqual({
      organization: '',
      azurePath: '',
    });
    expect(req.request.headers.get('x-client-app')).toBe(
      API_CLIENT_APP_NAME,
    );
    expect(req.request.headers.has('x-correlation-id')).toBeTrue();
    expect(req.request.headers.has('x-azdo-pat')).toBeFalse();
    expect(req.request.headers.has('x-azdo-organization')).toBeFalse();

    req.flush({ json: '{"ok":true}' });

    await expectAsync(promise).toBeResolvedTo({ json: '{"ok":true}' });
  });

  it('blocks an unconfigured environment before HttpClient', async () => {
    const previousBaseUrl = environment.api.baseUrl;
    environment.api.baseUrl = null;

    try {
      await expectAsync(
        service.generate({ prompt: 'hello', systemPrompt: 'system' }),
      ).toBeRejectedWith(
        jasmine.objectContaining({
          name: 'ApiRequestError',
          code: 'API_NOT_CONFIGURED',
          message: 'El backend del ambiente local todavía no está configurado.',
        }),
      );
      httpMock.expectNone(() => true);
    } finally {
      environment.api.baseUrl = previousBaseUrl;
    }
  });

  it('blocks an external HTTP backend before HttpClient', async () => {
    const previousBaseUrl = environment.api.baseUrl;
    environment.api.baseUrl = 'http://api.example.com/api';

    try {
      await expectAsync(
        service.generate({ prompt: 'hello', systemPrompt: 'system' }),
      ).toBeRejectedWith(
        jasmine.objectContaining({
          name: 'ApiRequestError',
          code: 'INVALID_API_CONFIGURATION',
          message: jasmine.stringMatching(/HTTP local solo permite/),
        }),
      );
      httpMock.expectNone(() => true);
    } finally {
      environment.api.baseUrl = previousBaseUrl;
    }
  });

  it('sends a request through HttpClient to the configured local HTTP backend', async () => {
    const previousBaseUrl = environment.api.baseUrl;
    environment.api.baseUrl = 'http://localhost:7071/api';

    try {
      const promise = service.generate({
        prompt: 'hello',
        systemPrompt: 'system',
      });
      const req = httpMock.expectOne(
        'http://localhost:7071/api/v1.0.0/generate',
      );
      expect(req.request.method).toBe('POST');
      req.flush({ json: '{"ok":true}' });

      await expectAsync(promise).toBeResolvedTo({ json: '{"ok":true}' });
    } finally {
      environment.api.baseUrl = previousBaseUrl;
    }
  });

  it('generateTestCases should use the specialized endpoint and preserve shared headers', async () => {
    azdoConfigService.setOrganization('org');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');
    const promise = service.generateTestCases({
      prompt: ' test cases prompt ',
      systemPrompt: ' system ',
      model: ' model-name ',
    });
    const req = httpMock.expectOne((request) =>
      matchGenerateTestCasesUrl(request.urlWithParams),
    );

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      prompt: 'test cases prompt',
      systemPrompt: 'system',
      model: 'model-name',
    });
    expect(req.request.headers.get('x-client-app')).toBe(
      API_CLIENT_APP_NAME,
    );
    expect(req.request.headers.has('x-correlation-id')).toBeTrue();
    expect(req.request.headers.has('x-azdo-pat')).toBeFalse();
    expect(req.request.headers.has('x-azdo-organization')).toBeFalse();
    req.flush({ json: '{}', raw: '{}' });

    await expectAsync(promise).toBeResolvedTo({ json: '{}', raw: '{}' });
  });

  it('create should return response on success', async () => {
    azdoConfigService.setOrganization('context-org');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');

    const promise = service.create(samplePayload);
    flushCreateWorkItemConfig();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const req = httpMock.expectOne((request) =>
      matchCreateUrl(request.urlWithParams),
    );

    expect(req.request.method).toBe('POST');
    expect(req.request.body.workItem).toBeUndefined();
    expect(req.request.body.hu).toEqual(
      jasmine.objectContaining({
        title: 'title',
        description: 'desc',
        acceptanceCriteria: 'ac',
        'Microsoft.VSTS.Common.Priority': 1,
        'Microsoft.VSTS.Common.Risk': '2 - Medium',
        'Microsoft.VSTS.Common.ValueArea': 'Business',
        'Custom.TipoHU': 'Funcional',
        'Custom.FrentedeTrabajo': 'Mejoras',
      }),
    );
    expect(req.request.body.hu.priority).toBeUndefined();
    expect(req.request.body.hu.risk).toBeUndefined();
    expect(req.request.body.hu.valueArea).toBeUndefined();
    expect(req.request.body.hu.tipoHU).toBeUndefined();
    expect(req.request.body.hu.frenteDeTrabajo).toBeUndefined();
    expect(req.request.body.azdoOrg).toBe('context-org');
    expect(req.request.headers.get('x-azdo-organization')).toBe('context-org');
    expect(req.request.headers.get('x-azdo-pat')).toBe('test-pat-placeholder');
    expect(req.request.headers.has('x-azdo-path')).toBeFalse();
    expect(req.request.headers.get('x-client-app')).toBe(
      API_CLIENT_APP_NAME,
    );
    expect(req.request.headers.has('x-correlation-id')).toBeTrue();

    req.flush({
      huId: 123,
      huUrl: 'https://example/work-items/123',
      message: 'Creado',
    });

    await expectAsync(promise).toBeResolved();
  });

  it('createPrepared should post the validated request without repeating metadata preflight', async () => {
    azdoConfigService.setOrganization('context-org');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');
    const request: CreateWorkItemRequest = {
      azdoOrg: 'context-org',
      azdoProject: 'proj',
      workItemType: 'Epic',
      iterationPath: 'iter',
      areaPath: 'area',
      hu: { title: 'title', description: 'desc' },
      testCases: [],
      testSuite: { planId: 0 },
    };

    const promise = service.createPrepared(request, {
      organization: 'context-org',
    });
    httpMock.expectNone((candidate) =>
      matchWorkItemConfigUrl(candidate.urlWithParams),
    );
    const createRequest = httpMock.expectOne((candidate) =>
      matchCreateUrl(candidate.urlWithParams),
    );
    expect(createRequest.request.body).toEqual(request);
    expect(createRequest.request.headers.get('x-azdo-pat')).toBe(
      'test-pat-placeholder',
    );
    createRequest.flush({
      huId: 10,
      huUrl: 'https://example/10',
      message: 'Creado',
    });

    await expectAsync(promise).toBeResolvedTo({
      huId: 10,
      huUrl: 'https://example/10',
      message: 'Creado',
    });
  });

  it('create should normalize separators and strip Iteration/Area roots', async () => {
    azdoConfigService.setOrganization('context-org');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');

    const payloadWithSlashes: WorkItemPayload = {
      ...samplePayload,
      iterationPath:
        'Sistema digital de integracion (SDI)/Iteration/Soporte SDI/2026/Marzo',
      areaPath: 'Sistema digital de integracion (SDI)/Area/Soporte SDI',
    };

    const promise = service.create(payloadWithSlashes);
    flushCreateWorkItemConfig();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const req = httpMock.expectOne((request) =>
      matchCreateUrl(request.urlWithParams),
    );

    expect(req.request.body.iterationPath).toBe(
      'Sistema digital de integracion (SDI)/Soporte SDI/2026/Marzo',
    );
    expect(req.request.body.areaPath).toBe(
      'Sistema digital de integracion (SDI)/Soporte SDI',
    );

    req.flush({
      huId: 123,
      huUrl: 'https://example/work-items/123',
      message: 'Creado',
    });

    await expectAsync(promise).toBeResolved();
  });

  it('fetchAzdoMetadata should send azdoContext and return response', async () => {
    azdoConfigService.setOrganization('MiOrganizacionDevOps');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');

    const promise = service.fetchAzdoMetadata({
      organization: 'MiOrganizacionDevOps',
    });

    const req = httpMock.expectOne((request) =>
      request.urlWithParams.includes('/api/v1.0.0/azdo/metadata'),
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      azdoContext: {
        organization: 'MiOrganizacionDevOps',
        azurePath: '',
      },
    });
    expect(req.request.headers.get('x-azdo-organization')).toBe(
      'MiOrganizacionDevOps',
    );
    expect(req.request.headers.get('x-azdo-pat')).toBe('test-pat-placeholder');
    expect(req.request.headers.has('x-azdo-path')).toBeFalse();
    expect(req.request.headers.get('x-client-app')).toBe(
      API_CLIENT_APP_NAME,
    );
    expect(req.request.headers.has('x-correlation-id')).toBeTrue();

    req.flush({
      projects: ['Sistema digital de integracion (SDI)'],
      areaPaths: ['Sistema digital de integracion (SDI)\\Equipo'],
      iterationPaths: ['Sistema digital de integracion (SDI)\\Sprint 1'],
    });

    await expectAsync(promise).toBeResolvedTo({
      projects: ['Sistema digital de integracion (SDI)'],
      areaPaths: ['Sistema digital de integracion (SDI)\\Equipo'],
      iterationPaths: ['Sistema digital de integracion (SDI)\\Sprint 1'],
    });
  });

  it('fetchWorkItemConfig should send project in body and return field config', async () => {
    azdoConfigService.setOrganization('MiOrganizacionDevOps');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');

    const promise = service.fetchWorkItemConfig(
      'Sistema digital de integracion (SDI)',
      'User Story',
      {
        organization: 'MiOrganizacionDevOps',
      },
    );

    const req = httpMock.expectOne((request) =>
      matchWorkItemConfigUrl(request.urlWithParams),
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      azdoProject: 'Sistema digital de integracion (SDI)',
      workItemType: 'User Story',
      azdoContext: {
        organization: 'MiOrganizacionDevOps',
        azurePath: '',
      },
    });
    expect(req.request.headers.has('x-azdo-project')).toBeFalse();
    expect(req.request.headers.get('x-azdo-organization')).toBe(
      'MiOrganizacionDevOps',
    );
    expect(req.request.headers.get('x-azdo-pat')).toBe('test-pat-placeholder');

    req.flush({
      project: 'Sistema digital de integracion (SDI)',
      workItemType: 'User Story',
      fields: [
        {
          name: 'valueArea',
          referenceName: 'Microsoft.VSTS.Common.ValueArea',
          label: 'Value Area',
          type: 'picklist',
          required: false,
          control: 'select',
          options: ['Business', 'Architectural'],
        },
      ],
    });

    await expectAsync(promise).toBeResolvedTo({
      project: 'Sistema digital de integracion (SDI)',
      workItemType: 'User Story',
      fields: [
        {
          name: 'valueArea',
          referenceName: 'Microsoft.VSTS.Common.ValueArea',
          label: 'Value Area',
          type: 'picklist',
          required: false,
          control: 'select',
          options: ['Business', 'Architectural'],
        },
      ],
    });
    expect(
      service.getFreshWorkItemConfig(
        'Sistema digital de integracion (SDI)',
        'User Story',
        { organization: 'MiOrganizacionDevOps' },
      )?.fields[0].referenceName,
    ).toBe('Microsoft.VSTS.Common.ValueArea');
  });

  it('fetchTestPlans should send project and return plans', async () => {
    azdoConfigService.setOrganization('MiOrganizacionDevOps');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');

    const promise = service.fetchTestPlans('Proyecto X', {
      organization: 'MiOrganizacionDevOps',
    });

    const req = httpMock.expectOne((request) =>
      matchTestPlansUrl(request.urlWithParams),
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      azdoProject: 'Proyecto X',
      azdoContext: {
        organization: 'MiOrganizacionDevOps',
        azurePath: '',
      },
    });
    expect(req.request.headers.get('x-azdo-pat')).toBe('test-pat-placeholder');

    req.flush({
      project: 'Proyecto X',
      testPlans: [{ id: 123, name: 'Plan de Pruebas Proyecto X' }],
    });

    await expectAsync(promise).toBeResolvedTo({
      project: 'Proyecto X',
      testPlans: [{ id: 123, name: 'Plan de Pruebas Proyecto X' }],
    });
  });

  it('evaluateWorkItem should send the runtime PAT through x-azdo-pat', async () => {
    azdoConfigService.setOrganization('MiOrganizacionDevOps');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');

    const promise = service.evaluateWorkItem({
      workItemId: 321,
      azdoProject: 'Proyecto X',
      prompt: 'prompt de evaluacion',
      systemPrompt: 'system prompt de evaluacion',
      azdoContext: azdoConfigService.getConfigSnapshot(),
    });

    const req = httpMock.expectOne((request) =>
      matchEvaluateWorkItemUrl(request.urlWithParams),
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body.workItemId).toBe(321);
    expect(req.request.headers.get('x-azdo-pat')).toBe('test-pat-placeholder');
    expect(req.request.headers.has('x-azdo-path')).toBeFalse();

    req.flush({});

    await expectAsync(promise).toBeResolved();
  });

  it('searchWorkItems should send the runtime PAT through x-azdo-pat', async () => {
    azdoConfigService.setOrganization('MiOrganizacionDevOps');
    azdoConfigService.setRuntimeCredential('test-pat-placeholder');

    const promise = service.searchWorkItems({
      azdoProject: 'Proyecto X',
      azdoContext: azdoConfigService.getConfigSnapshot(),
    });

    const req = httpMock.expectOne((request) =>
      matchSearchWorkItemsUrl(request.urlWithParams),
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body.azdoProject).toBe('Proyecto X');
    expect(req.request.body.top).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(req.request.body, 'top'),
    ).toBeFalse();
    expect(req.request.headers.get('x-azdo-pat')).toBe('test-pat-placeholder');
    expect(req.request.headers.has('x-azdo-path')).toBeFalse();

    req.flush({ project: 'Proyecto X', count: 0, items: [] });

    await expectAsync(promise).toBeResolvedTo({
      project: 'Proyecto X',
      count: 0,
      items: [],
    });
  });

  it('searchWorkItems should send top only when the caller provides a positive value', async () => {
    const promise = service.searchWorkItems({
      azdoProject: 'Proyecto X',
      top: 25,
    });

    const req = httpMock.expectOne((request) =>
      matchSearchWorkItemsUrl(request.urlWithParams),
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body.top).toBe(25);

    req.flush({ project: 'Proyecto X', count: 0, items: [] });

    await expectAsync(promise).toBeResolvedTo({
      project: 'Proyecto X',
      count: 0,
      items: [],
    });
  });

  it('should map 400 errors', async () => {
    const promise = service.generate({
      prompt: 'bad request',
      systemPrompt: 'system',
    });
    const req = httpMock.expectOne((request) =>
      matchGenerateUrl(request.urlWithParams),
    );

    req.flush({ message: 'bad' }, { status: 400, statusText: 'Bad Request' });

    await expectAsync(promise).toBeRejectedWithError(
      'La solicitud enviada no es valida.',
    );
  });

  it('should map 401 errors', async () => {
    const promise = service.create(samplePayload);
    flushCreateWorkItemConfig();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const req = httpMock.expectOne((request) =>
      matchCreateUrl(request.urlWithParams),
    );

    req.flush(
      { message: 'unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await expectAsync(promise).toBeRejectedWithError(
      'No autorizado para ejecutar esta operacion.',
    );
    expect(azdoConfigService.hasRuntimeCredential()).toBeFalse();
  });

  it('create should not retry 500 errors', fakeAsync(() => {
    let capturedError: ApiRequestError | undefined;

    service.create(samplePayload).catch((error) => {
      capturedError = error;
    });

    flushCreateWorkItemConfig();
    flushMicrotasks();
    const req = httpMock.expectOne((request) =>
      matchCreateUrl(request.urlWithParams),
    );
    req.flush(
      { message: 'server error' },
      { status: 500, statusText: 'Server Error' },
    );

    tick(1000);
    httpMock.expectNone((request) => matchCreateUrl(request.urlWithParams));
    flushMicrotasks();

    expect(capturedError).toBeDefined();
    expect(capturedError?.message).toContain('Error interno del servicio');
    expect(capturedError?.status).toBe(500);
    expect(capturedError?.code).toBe('SERVER_ERROR');
  }));

  it('generate should not retry 500 errors', fakeAsync(() => {
    let capturedError: Error | undefined;

    service
      .generate({ prompt: 'server fail', systemPrompt: 'system' })
      .catch((error) => {
        capturedError = error;
      });

    const req = httpMock.expectOne((request) =>
      matchGenerateUrl(request.urlWithParams),
    );
    req.flush(
      { message: 'server error' },
      { status: 500, statusText: 'Server Error' },
    );

    tick(1000);
    httpMock.expectNone((request) => matchGenerateUrl(request.urlWithParams));
    flushMicrotasks();

    expect(capturedError).toBeDefined();
    expect(capturedError?.message).toContain('Error interno del servicio');
  }));

  it('evaluateWorkItem should not retry costly AI calls', fakeAsync(() => {
    let capturedError: Error | undefined;

    service
      .evaluateWorkItem({
        workItemId: 321,
        azdoProject: 'Proyecto X',
        prompt: 'prompt de evaluacion',
        systemPrompt: 'system prompt de evaluacion',
      })
      .catch((error) => {
        capturedError = error;
      });

    const req = httpMock.expectOne((request) =>
      matchEvaluateWorkItemUrl(request.urlWithParams),
    );
    req.flush(
      { message: 'server error' },
      { status: 500, statusText: 'Server Error' },
    );

    tick(1000);
    httpMock.expectNone((request) =>
      matchEvaluateWorkItemUrl(request.urlWithParams),
    );
    flushMicrotasks();

    expect(capturedError).toBeDefined();
    expect(capturedError?.message).toContain('Error interno del servicio');
  }));

  it('fetchAzdoMetadata should retry once and map 500 errors', fakeAsync(() => {
    let capturedError: Error | undefined;

    service.fetchAzdoMetadata({ organization: 'org' }, true).catch((error) => {
      capturedError = error;
    });

    const firstReq = httpMock.expectOne((request) =>
      matchMetadataUrl(request.urlWithParams),
    );
    firstReq.flush(
      { message: 'server error' },
      { status: 500, statusText: 'Server Error' },
    );

    tick(250);

    const secondReq = httpMock.expectOne((request) =>
      matchMetadataUrl(request.urlWithParams),
    );
    secondReq.flush(
      { message: 'server error' },
      { status: 500, statusText: 'Server Error' },
    );

    flushMicrotasks();

    expect(capturedError).toBeDefined();
    expect(capturedError?.message).toContain('Error interno del servicio');
  }));

  it('searchWorkItems should map network errors after retry', fakeAsync(() => {
    let capturedError: Error | undefined;

    service.searchWorkItems({ azdoProject: 'Proyecto X' }).catch((error) => {
      capturedError = error;
    });

    const firstReq = httpMock.expectOne((request) =>
      matchSearchWorkItemsUrl(request.urlWithParams),
    );
    firstReq.flush('network', { status: 0, statusText: 'Unknown Error' });

    tick(250);

    const secondReq = httpMock.expectOne((request) =>
      matchSearchWorkItemsUrl(request.urlWithParams),
    );
    secondReq.flush('network', { status: 0, statusText: 'Unknown Error' });

    flushMicrotasks();

    expect(capturedError).toBeDefined();
    expect(capturedError?.message).toContain(
      'No fue posible conectar con el servicio',
    );
  }));

  it('fetchAzdoMetadata should map 408 errors after retry', fakeAsync(() => {
    let capturedError: Error | undefined;

    service.fetchAzdoMetadata({ organization: 'org' }, true).catch((error) => {
      capturedError = error;
    });

    const firstReq = httpMock.expectOne((request) =>
      matchMetadataUrl(request.urlWithParams),
    );
    firstReq.flush(
      { message: 'timeout' },
      { status: 408, statusText: 'Request Timeout' },
    );

    tick(250);

    const secondReq = httpMock.expectOne((request) =>
      matchMetadataUrl(request.urlWithParams),
    );
    secondReq.flush(
      { message: 'timeout' },
      { status: 408, statusText: 'Request Timeout' },
    );

    flushMicrotasks();

    expect(capturedError).toBeDefined();
    expect(capturedError?.message).toContain('demasiado en responder');
  }));

  it('fetchAzdoMetadata should retry 429 errors for read operations', fakeAsync(() => {
    let capturedError: Error | undefined;

    service.fetchAzdoMetadata({ organization: 'org' }, true).catch((error) => {
      capturedError = error;
    });

    const firstReq = httpMock.expectOne((request) =>
      matchMetadataUrl(request.urlWithParams),
    );
    firstReq.flush(
      { message: 'too many requests' },
      { status: 429, statusText: 'Too Many Requests' },
    );

    tick(250);

    const secondReq = httpMock.expectOne((request) =>
      matchMetadataUrl(request.urlWithParams),
    );
    secondReq.flush(
      { message: 'too many requests' },
      { status: 429, statusText: 'Too Many Requests' },
    );

    flushMicrotasks();

    expect(capturedError).toBeDefined();
  }));

  it('does not issue a protected request without a runtime credential', async () => {
    azdoConfigService.clearRuntimeCredential();

    await expectAsync(
      service.fetchAzdoMetadata({ organization: 'org' }, true),
    ).toBeRejectedWithError(ApiRequestError, /Configuración Azure/);

    httpMock.expectNone((request) => matchMetadataUrl(request.urlWithParams));
  });

  function field(referenceName: string, label: string, type = 'string') {
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
