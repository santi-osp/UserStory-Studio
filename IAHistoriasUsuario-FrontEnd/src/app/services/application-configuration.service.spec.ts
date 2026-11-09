import { TestBed } from '@angular/core/testing';
import { ApplicationEnvironment } from '../../Environments/environment.model';
import { sharedApiConfiguration } from '../../Environments/environment.shared';
import { API_ENDPOINTS } from '../config/api-contract';
import {
  APPLICATION_ENVIRONMENT,
  ApplicationConfigurationService,
} from './application-configuration.service';

describe('ApplicationConfigurationService', () => {
  function configure(source: ApplicationEnvironment): void {
    TestBed.configureTestingModule({
      providers: [{ provide: APPLICATION_ENVIRONMENT, useValue: source }],
    });
  }

  it('exposes the validated build-time API configuration through one boundary', () => {
    configure({
      env: 'local',
      api: {
        baseUrl: 'http://localhost:7071/api',
        ...sharedApiConfiguration,
      },
    });

    const service = TestBed.inject(ApplicationConfigurationService);

    expect(service.requireApiBaseUrl()).toBe('http://localhost:7071/api');
    expect(service.buildEndpoint('generate')).toBe(
      'http://localhost:7071/api/v1.0.0/generate',
    );
  });

  it('builds every HUIA API endpoint from the configured base URL', () => {
    configure({
      env: 'develop',
      api: {
        baseUrl: 'https://backend.example/api',
        ...sharedApiConfiguration,
      },
    });

    const service = TestBed.inject(ApplicationConfigurationService);
    for (const endpointName of Object.keys(API_ENDPOINTS) as (
      keyof typeof API_ENDPOINTS
    )[]) {
      const parsed = new URL(service.buildEndpoint(endpointName));
      expect(parsed.pathname).toBe(`/api${API_ENDPOINTS[endpointName]}`);
      expect(parsed.search).toBe('');
    }
  });

  it('rejects operational values outside the absolute client ceilings', () => {
    configure({
      env: 'local',
      api: {
        baseUrl: 'https://localhost:7071/api',
        ...sharedApiConfiguration,
        retryCount: 4,
      },
    });

    expect(() => TestBed.inject(ApplicationConfigurationService)).toThrowError(
      /api\.retryCount/,
    );
  });
});
