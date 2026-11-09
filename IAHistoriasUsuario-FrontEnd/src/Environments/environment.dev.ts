import { ApplicationEnvironment } from './environment.model';
import { sharedApiConfiguration } from './environment.shared';

export const environment: ApplicationEnvironment = {
  env: 'develop',
  api: {
    baseUrl:
      'https://atsrfunchuiadllo-crh4e8c6e5edbpcx.eastus2-01.azurewebsites.net/api',
    ...sharedApiConfiguration,
  },
};
