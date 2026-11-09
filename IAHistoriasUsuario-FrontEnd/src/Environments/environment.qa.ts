import { ApplicationEnvironment } from './environment.model';
import { sharedApiConfiguration } from './environment.shared';

export const environment: ApplicationEnvironment = {
  env: 'calidad',
  api: {
    baseUrl: null,
    ...sharedApiConfiguration,
  },
};
