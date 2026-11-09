import { ApplicationEnvironment } from './environment.model';
import { sharedApiConfiguration } from './environment.shared';

export const environment: ApplicationEnvironment = {
  env: 'production',
  api: {
    baseUrl: null,
    ...sharedApiConfiguration,
  },
};
