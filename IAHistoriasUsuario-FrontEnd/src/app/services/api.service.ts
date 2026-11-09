import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  firstValueFrom,
  Observable,
  retry,
  throwError,
  timeout,
  timer,
} from 'rxjs';
import { API_HEADERS, ApiEndpointName } from '../config/api-contract';
import {
  ApiErrorShape,
  AzdoContext,
  AzdoMetadataResult,
  CreateResult,
  CreateWorkItemRequest,
  EvaluateWorkItemRequest,
  EvaluateWorkItemResponse,
  GenerateRequest,
  GenerateResult,
  GenerateTestCasesRequest,
  SearchWorkItemsRequest,
  SearchWorkItemsResponse,
  TestPlansResult,
  WorkItemConfigResult,
  WorkItemPayload,
} from '../models/types';
import { normalizeAzdoPath } from '../utils/azdo-path';
import { AZDO_TEST_CASE_WORK_ITEM_TYPE } from '../utils/azure-devops-invariants';
import { buildCreateWorkItemRequest } from '../utils/work-item-create-request';
import { DEFAULT_WORK_ITEM_TYPE } from '../utils/work-item-type';
import { ApiConfigurationError } from '../utils/api-url';
import { ApplicationConfigurationService } from './application-configuration.service';
import { ApiErrorService } from './api-error.service';
import { AzdoConfigService } from './azdo-config.service';

interface AzdoBackendContext {
  organization: string;
  azurePath: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly appConfiguration = inject(ApplicationConfigurationService);
  private readonly clientAppName = this.appConfiguration.clientAppName.trim();
  private readonly timeoutMs = this.appConfiguration.http.timeoutMs;
  private readonly retryCount = this.appConfiguration.http.retryCount;
  private readonly retryDelayMs = this.appConfiguration.http.retryDelayMs;
  private readonly metadataCacheTtlMs =
    this.appConfiguration.http.metadataCacheTtlMs;
  private readonly workItemConfigCacheTtlMs =
    this.appConfiguration.http.workItemConfigCacheTtlMs;
  private readonly testPlansCacheTtlMs =
    this.appConfiguration.http.testPlansCacheTtlMs;
  private readonly metadataCache = new Map<
    string,
    { expiresAt: number; value: AzdoMetadataResult }
  >();
  private readonly metadataInFlight = new Map<
    string,
    Promise<AzdoMetadataResult>
  >();
  private readonly workItemConfigCache = new Map<
    string,
    { expiresAt: number; value: WorkItemConfigResult }
  >();
  private readonly workItemConfigInFlight = new Map<
    string,
    Promise<WorkItemConfigResult>
  >();
  private readonly testPlansCache = new Map<
    string,
    { expiresAt: number; value: TestPlansResult }
  >();
  private readonly testPlansInFlight = new Map<
    string,
    Promise<TestPlansResult>
  >();

  constructor(
    private http: HttpClient,
    private apiErrorService: ApiErrorService,
    private azdoConfigService: AzdoConfigService,
  ) {}

  private buildCommonHeaders(): HttpHeaders {
    const snapshot = this.azdoConfigService.getContextSnapshot();
    let headers = new HttpHeaders().set(
      API_HEADERS.clientApp,
      this.clientAppName,
    );

    if (snapshot.correlationId.trim()) {
      headers = headers.set(
        API_HEADERS.correlationId,
        snapshot.correlationId.trim(),
      );
    }

    return headers;
  }

  private buildAzdoHeaders(configOverride?: AzdoContext): HttpHeaders {
    const snapshot = this.azdoConfigService.getContextSnapshot();
    const source = configOverride ?? snapshot;
    let headers = this.buildCommonHeaders();

    const organization =
      source.organization.trim() || snapshot.organization.trim();
    if (organization) {
      headers = headers.set(API_HEADERS.azdoOrganization, organization);
    }

    const azurePat = this.azdoConfigService.getRuntimeCredential();
    if (azurePat) {
      headers = headers.set(API_HEADERS.azurePat, azurePat);
    }

    return headers;
  }

  private getContextPayload(configOverride?: AzdoContext): AzdoBackendContext {
    const source = configOverride ?? this.azdoConfigService.getConfigSnapshot();
    return {
      organization: source.organization.trim(),
      azurePath: '',
    };
  }

  private requireRuntimeCredential(): void {
    this.requireApiConfiguration();
    if (!this.azdoConfigService.hasRuntimeCredential()) {
      throw new ApiRequestError(
        'Ingresa tu Azure PAT en Configuración Azure para actualizar la información.',
        undefined,
        'AZDO_CREDENTIAL_REQUIRED',
      );
    }
  }

  private requireApiConfiguration(): void {
    try {
      this.appConfiguration.requireApiBaseUrl();
    } catch (error) {
      if (error instanceof ApiConfigurationError) {
        throw new ApiRequestError(error.message, undefined, error.code);
      }
      throw error;
    }
  }

  private buildEndpoint(endpointName: ApiEndpointName): string {
    try {
      return this.appConfiguration.buildEndpoint(endpointName);
    } catch (error) {
      if (error instanceof ApiConfigurationError) {
        throw new ApiRequestError(error.message, undefined, error.code);
      }
      throw error;
    }
  }

  private toErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as { message?: string }).message;
      if (message) {
        return message;
      }
    }

    const mapped = error as ApiErrorShape;
    if (mapped?.message) {
      return this.apiErrorService.toMessage(mapped);
    }

    return 'Fallo inesperado al consumir la API.';
  }

  private toRequestError(error: unknown): ApiRequestError {
    const candidate =
      typeof error === 'object' && error !== null
        ? (error as { status?: unknown; code?: unknown })
        : {};
    const status =
      typeof candidate.status === 'number' ? candidate.status : undefined;
    const code =
      typeof candidate.code === 'string' ? candidate.code : undefined;
    if (status === 401) {
      this.azdoConfigService.clearRuntimeCredential();
    }
    return new ApiRequestError(this.toErrorMessage(error), status, code);
  }

  private isRetryableReadError(error: unknown): boolean {
    if (error instanceof HttpErrorResponse) {
      return (
        error.status === 0 ||
        error.status === 408 ||
        error.status === 429 ||
        error.status >= 500
      );
    }

    if (typeof error === 'object' && error !== null && 'status' in error) {
      const status = (error as { status?: number }).status;
      if (typeof status === 'number') {
        return (
          status === 0 || status === 408 || status === 429 || status >= 500
        );
      }
    }

    return false;
  }

  private withReadResilience<T>(source$: Observable<T>): Observable<T> {
    return source$.pipe(
      timeout(this.timeoutMs),
      retry({
        count: this.retryCount,
        delay: (error) =>
          this.isRetryableReadError(error)
            ? timer(this.retryDelayMs)
            : throwError(() => error),
      }),
    );
  }

  private withMutationSafety<T>(source$: Observable<T>): Observable<T> {
    // Las mutaciones y llamadas externas con costo no se reintentan automaticamente para evitar duplicados.
    return source$.pipe(timeout(this.timeoutMs));
  }

  private buildMetadataKey(configOverride?: AzdoContext): string {
    const snapshot = this.azdoConfigService.getContextSnapshot();
    const source = configOverride ?? snapshot;
    const organization =
      source.organization.trim() || snapshot.organization.trim();
    const sessionKey = snapshot.correlationId.trim() || 'no-session';
    return `${organization.toLowerCase()}::${sessionKey}`;
  }

  private buildWorkItemConfigKey(
    azdoProject: string,
    workItemType: string,
    configOverride?: AzdoContext,
  ): string {
    const metadataKey = this.buildMetadataKey(configOverride);
    return `${metadataKey}::${azdoProject.trim().toLowerCase()}::${workItemType.trim().toLowerCase()}`;
  }

  private buildProjectKey(
    azdoProject: string,
    configOverride?: AzdoContext,
  ): string {
    const metadataKey = this.buildMetadataKey(configOverride);
    return `${metadataKey}::${azdoProject.trim().toLowerCase()}`;
  }

  async generate(payload: GenerateRequest): Promise<GenerateResult> {
    try {
      this.requireApiConfiguration();
      const azdoContext = this.getContextPayload(payload.azdoContext);
      return await firstValueFrom(
        this.withMutationSafety(
          this.http.post<GenerateResult>(
            this.buildEndpoint('generate'),
            { ...payload, azdoContext },
            { headers: this.buildCommonHeaders() },
          ),
        ),
      );
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  async generateTestCases(
    payload: GenerateTestCasesRequest,
  ): Promise<GenerateResult> {
    try {
      this.requireApiConfiguration();
      return await firstValueFrom(
        this.withMutationSafety(
          this.http.post<GenerateResult>(
            this.buildEndpoint('generateTestCases'),
            {
              prompt: payload.prompt.trim(),
              systemPrompt: payload.systemPrompt.trim(),
              ...(payload.model?.trim() ? { model: payload.model.trim() } : {}),
            },
            { headers: this.buildCommonHeaders() },
          ),
        ),
      );
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  async create(
    payload: WorkItemPayload,
  ): Promise<CreateResult & { error?: string }> {
    try {
      this.requireRuntimeCredential();
      const context = this.azdoConfigService.getConfigSnapshot();
      const normalizedPayload: WorkItemPayload = {
        ...payload,
        azdoOrg: context.organization || payload.azdoOrg,
        iterationPath: normalizeAzdoPath(payload.iterationPath, 'iteration'),
        areaPath: normalizeAzdoPath(payload.areaPath, 'area'),
      };
      const [workItemConfig, testCaseConfig] = await Promise.all([
        this.fetchWorkItemConfig(
          normalizedPayload.azdoProject,
          normalizedPayload.workItemType || DEFAULT_WORK_ITEM_TYPE,
          context,
        ),
        normalizedPayload.testCases.length > 0
          ? this.fetchWorkItemConfig(
              normalizedPayload.azdoProject,
              AZDO_TEST_CASE_WORK_ITEM_TYPE,
              context,
            )
          : Promise.resolve(null),
      ]);
      if (testCaseConfig) {
        const stateField = testCaseConfig.fields.find(
          (field) => field.referenceName.toLowerCase() === 'system.state',
        );
        const allowedStates = stateField?.options ?? [];
        for (const testCase of normalizedPayload.testCases) {
          const validState = allowedStates.find(
            (state) =>
              state.toLowerCase() === testCase.state.trim().toLowerCase(),
          );
          if (!validState) {
            throw new Error(
              'El estado de uno de los Test Cases no esta disponible en el proyecto.',
            );
          }
          testCase.state = validState;
        }
      }
      const requestPayload: CreateWorkItemRequest = buildCreateWorkItemRequest(
        normalizedPayload,
        workItemConfig.fields,
      );

      return await this.createPrepared(requestPayload, context);
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  async createPrepared(
    requestPayload: CreateWorkItemRequest,
    config?: AzdoContext,
  ): Promise<CreateResult & { error?: string }> {
    try {
      this.requireRuntimeCredential();
      return await firstValueFrom(
        this.withMutationSafety(
          this.http.post<CreateResult & { error?: string }>(
            this.buildEndpoint('create'),
            requestPayload,
            { headers: this.buildAzdoHeaders(config) },
          ),
        ),
      );
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  async fetchAzdoMetadata(
    config?: AzdoContext,
    forceRefresh = false,
  ): Promise<AzdoMetadataResult> {
    this.requireRuntimeCredential();
    const cacheKey = this.buildMetadataKey(config);
    const runningRequest = this.metadataInFlight.get(cacheKey);
    if (runningRequest) {
      return await runningRequest;
    }

    if (!forceRefresh) {
      const cached = this.metadataCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    try {
      const azdoContext = this.getContextPayload(config);
      const request = firstValueFrom(
        this.withReadResilience(
          this.http.post<AzdoMetadataResult>(
            this.buildEndpoint('azdoMetadata'),
            { azdoContext },
            { headers: this.buildAzdoHeaders(config) },
          ),
        ),
      );

      this.metadataInFlight.set(cacheKey, request);
      const response = await request;
      this.metadataCache.set(cacheKey, {
        value: response,
        expiresAt: Date.now() + this.metadataCacheTtlMs,
      });

      return response;
    } catch (error) {
      throw this.toRequestError(error);
    } finally {
      this.metadataInFlight.delete(cacheKey);
    }
  }

  async fetchWorkItemConfig(
    azdoProject: string,
    workItemType = '',
    config?: AzdoContext,
    forceRefresh = false,
  ): Promise<WorkItemConfigResult> {
    this.requireRuntimeCredential();
    const cacheKey = this.buildWorkItemConfigKey(
      azdoProject,
      workItemType,
      config,
    );
    const runningRequest = this.workItemConfigInFlight.get(cacheKey);
    if (runningRequest) {
      return await runningRequest;
    }

    if (!forceRefresh) {
      const cached = this.workItemConfigCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    try {
      const normalizedProject = azdoProject.trim();
      const normalizedType = workItemType.trim();
      const azdoContext = this.getContextPayload(config);

      const request = firstValueFrom(
        this.withReadResilience(
          this.http.post<WorkItemConfigResult>(
            this.buildEndpoint('azdoWorkItemConfig'),
            {
              azdoProject: normalizedProject,
              workItemType: normalizedType,
              azdoContext,
            },
            {
              headers: this.buildAzdoHeaders(config),
            },
          ),
        ),
      );

      this.workItemConfigInFlight.set(cacheKey, request);
      const response = await request;
      this.workItemConfigCache.set(cacheKey, {
        value: response,
        expiresAt: Date.now() + this.workItemConfigCacheTtlMs,
      });

      return response;
    } catch (error) {
      throw this.toRequestError(error);
    } finally {
      this.workItemConfigInFlight.delete(cacheKey);
    }
  }

  getFreshWorkItemConfig(
    azdoProject: string,
    workItemType = '',
    config?: AzdoContext,
  ): WorkItemConfigResult | null {
    const cacheKey = this.buildWorkItemConfigKey(
      azdoProject,
      workItemType,
      config,
    );
    const cached = this.workItemConfigCache.get(cacheKey);
    return cached && cached.expiresAt > Date.now() ? cached.value : null;
  }

  async fetchTestPlans(
    azdoProject: string,
    config?: AzdoContext,
    forceRefresh = false,
  ): Promise<TestPlansResult> {
    this.requireRuntimeCredential();
    const cacheKey = this.buildProjectKey(azdoProject, config);
    const runningRequest = this.testPlansInFlight.get(cacheKey);
    if (runningRequest) {
      return await runningRequest;
    }

    if (!forceRefresh) {
      const cached = this.testPlansCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    try {
      const normalizedProject = azdoProject.trim();
      const azdoContext = this.getContextPayload(config);

      const request = firstValueFrom(
        this.withReadResilience(
          this.http.post<TestPlansResult>(
            this.buildEndpoint('azdoTestPlans'),
            {
              azdoProject: normalizedProject,
              azdoContext,
            },
            {
              headers: this.buildAzdoHeaders(config),
            },
          ),
        ),
      );

      this.testPlansInFlight.set(cacheKey, request);
      const response = await request;
      this.testPlansCache.set(cacheKey, {
        value: response,
        expiresAt: Date.now() + this.testPlansCacheTtlMs,
      });

      return response;
    } catch (error) {
      throw this.toRequestError(error);
    } finally {
      this.testPlansInFlight.delete(cacheKey);
    }
  }

  async evaluateWorkItem(
    payload: EvaluateWorkItemRequest,
  ): Promise<EvaluateWorkItemResponse> {
    try {
      this.requireRuntimeCredential();
      const azdoContext = this.getContextPayload(payload.azdoContext);
      return await firstValueFrom(
        this.withMutationSafety(
          this.http.post<EvaluateWorkItemResponse>(
            this.buildEndpoint('evaluateWorkItem'),
            {
              workItemId: payload.workItemId,
              azdoProject: payload.azdoProject.trim(),
              requestedModel: payload.requestedModel?.trim() || undefined,
              prompt: payload.prompt.trim(),
              systemPrompt: payload.systemPrompt.trim(),
              azdoContext,
            },
            { headers: this.buildAzdoHeaders(payload.azdoContext) },
          ),
        ),
      );
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  async searchWorkItems(
    payload: SearchWorkItemsRequest,
  ): Promise<SearchWorkItemsResponse> {
    try {
      this.requireRuntimeCredential();
      const azdoContext = this.getContextPayload(payload.azdoContext);
      const top = this.resolveWorkItemSearchTop(payload.top);
      const requestBody = {
        azdoProject: payload.azdoProject.trim(),
        areaPath: payload.areaPath?.trim() || undefined,
        iterationPath: payload.iterationPath?.trim() || undefined,
        searchText: payload.searchText?.trim() || undefined,
        ...(top === undefined ? {} : { top }),
        azdoContext,
      };

      return await firstValueFrom(
        this.withReadResilience(
          this.http.post<SearchWorkItemsResponse>(
            this.buildEndpoint('searchWorkItems'),
            requestBody,
            { headers: this.buildAzdoHeaders(payload.azdoContext) },
          ),
        ),
      );
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  private resolveWorkItemSearchTop(requestedTop?: number): number | undefined {
    return this.resolvePositiveInteger(requestedTop);
  }

  private resolvePositiveInteger(value: unknown): number | undefined {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : undefined;
  }
}
