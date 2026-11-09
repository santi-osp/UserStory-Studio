import { ApiEnvironmentConfiguration } from './environment.model';

export const sharedApiConfiguration: Omit<
  ApiEnvironmentConfiguration,
  'baseUrl'
> = {
  timeoutMs: 120000,
  retryCount: 1,
  retryDelayMs: 250,
  metadataCacheTtlMs: 300000,
  workItemConfigCacheTtlMs: 120000,
  testPlansCacheTtlMs: 120000,
};
