import { getAzureConnectionMessage } from './azure-connection-message';

describe('getAzureConnectionMessage', () => {
  it('distinguishes organization, PAT and combined connection requirements', () => {
    expect(getAzureConnectionMessage('', false)).toBe(
      'Configura la organización y el Azure PAT para continuar.',
    );
    expect(getAzureConnectionMessage('', true)).toBe(
      'Configura la organización de Azure DevOps para cargar la información.',
    );
    expect(getAzureConnectionMessage('Org', false)).toBe(
      'Ingresa tu Azure PAT en Configuración Azure para actualizar la información.',
    );
    expect(getAzureConnectionMessage('Org', true)).toBe('');
  });
});
