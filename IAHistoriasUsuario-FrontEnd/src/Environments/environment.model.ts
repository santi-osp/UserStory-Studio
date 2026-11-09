export interface ApiEnvironmentConfiguration {
  baseUrl: string | null;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  metadataCacheTtlMs: number;
  workItemConfigCacheTtlMs: number;
  testPlansCacheTtlMs: number;
}

export interface ApplicationEnvironment {
  env: 'local' | 'develop' | 'calidad' | 'production';
  api: ApiEnvironmentConfiguration;
}
