import { Injectable, InjectionToken, inject } from '@angular/core';
import { environment } from '../../Environments/environment';
import {
  ApiEnvironmentConfiguration,
  ApplicationEnvironment,
} from '../../Environments/environment.model';
import {
  API_CLIENT_APP_NAME,
  API_ENDPOINTS,
  ApiEndpointName,
} from '../config/api-contract';
import {
  ApiConfigurationError,
  buildApiUrl,
  validateApiConfiguration,
} from '../utils/api-url';

const MAX_TIMEOUT_MS = 300_000;
const MAX_RETRY_COUNT = 3;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_CACHE_TTL_MS = 3_600_000;

export const APPLICATION_ENVIRONMENT =
  new InjectionToken<ApplicationEnvironment>('APPLICATION_ENVIRONMENT', {
    providedIn: 'root',
    factory: () => environment,
  });

@Injectable({ providedIn: 'root' })
export class ApplicationConfigurationService {
  private readonly source = inject(APPLICATION_ENVIRONMENT);

  readonly environmentName = this.source.env;
  readonly clientAppName = API_CLIENT_APP_NAME;
  readonly http = this.validateOperationalConfiguration(this.source.api);

  requireApiBaseUrl(): string {
    return validateApiConfiguration(this.source.api, this.source.env);
  }

  buildEndpoint(endpointName: ApiEndpointName): string {
    return buildApiUrl(
      this.source.api,
      this.source.env,
      API_ENDPOINTS[endpointName],
    );
  }

  private validateOperationalConfiguration(
    api: ApiEnvironmentConfiguration,
  ): ApiEnvironmentConfiguration {
    this.requireIntegerInRange('timeoutMs', api.timeoutMs, 1, MAX_TIMEOUT_MS);
    this.requireIntegerInRange(
      'retryCount',
      api.retryCount,
      0,
      MAX_RETRY_COUNT,
    );
    this.requireIntegerInRange(
      'retryDelayMs',
      api.retryDelayMs,
      0,
      MAX_RETRY_DELAY_MS,
    );
    this.requireIntegerInRange(
      'metadataCacheTtlMs',
      api.metadataCacheTtlMs,
      1,
      MAX_CACHE_TTL_MS,
    );
    this.requireIntegerInRange(
      'workItemConfigCacheTtlMs',
      api.workItemConfigCacheTtlMs,
      1,
      MAX_CACHE_TTL_MS,
    );
    this.requireIntegerInRange(
      'testPlansCacheTtlMs',
      api.testPlansCacheTtlMs,
      1,
      MAX_CACHE_TTL_MS,
    );
    return api;
  }

  private requireIntegerInRange(
    key: string,
    value: number,
    minimum: number,
    maximum: number,
  ): void {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new ApiConfigurationError(
        `La configuracion api.${key} debe estar entre ${minimum} y ${maximum}.`,
        'INVALID_API_CONFIGURATION',
      );
    }
  }
}
