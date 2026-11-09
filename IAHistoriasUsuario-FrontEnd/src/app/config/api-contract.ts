export const API_ENDPOINTS = {
  create: '/v1.0.0/create',
  generate: '/v1.0.0/generate',
  generateTestCases: '/v1.0.0/generate-test-cases',
  azdoMetadata: '/v1.0.0/azdo/metadata',
  azdoWorkItemConfig: '/v1.0.0/azdo/workitem-config',
  azdoTestPlans: '/v1.0.0/azdo/test-plans',
  evaluateWorkItem: '/v1.0.0/azdo/hu/evaluate',
  searchWorkItems: '/v1.0.0/azdo/hu/search',
} as const;

export type ApiEndpointName = keyof typeof API_ENDPOINTS;

export const API_HEADERS = {
  correlationId: 'x-correlation-id',
  clientApp: 'x-client-app',
  azurePat: 'x-azdo-pat',
  azdoOrganization: 'x-azdo-organization',
} as const;

export const API_CLIENT_APP_NAME = 'historias-usuario-ia-web';
