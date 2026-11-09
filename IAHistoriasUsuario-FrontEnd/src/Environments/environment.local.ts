import { ApplicationEnvironment } from './environment.model';
import { sharedApiConfiguration } from './environment.shared';

export const environment: ApplicationEnvironment = {
  env: 'local',
  api: {
    baseUrl: 'http://localhost:7071/api',
    ...sharedApiConfiguration,
  },
};
