import { ApiEnvironmentConfiguration } from '../../Environments/environment.model';
import { sharedApiConfiguration } from '../../Environments/environment.shared';
import { buildApiUrl, validateApiConfiguration } from './api-url';

function api(baseUrl: string | null): ApiEnvironmentConfiguration {
  return {
    baseUrl,
    ...sharedApiConfiguration,
  };
}

describe('api-url', () => {
  it('allows HTTP and HTTPS for the supported local loopback hosts', () => {
    [
      'http://localhost:7071/api',
      'https://localhost:7071/api',
      'http://127.0.0.1:7071/api',
      'https://127.0.0.1:7071/api',
      'http://[::1]:7071/api',
      'https://[::1]:7071/api',
    ].forEach((baseUrl) => {
      expect(validateApiConfiguration(api(baseUrl), 'local'))
        .withContext(baseUrl)
        .toBe(baseUrl);
    });
  });

  it('builds the configured HTTP local backend URL without changing protocol', () => {
    const result = buildApiUrl(
      api('http://localhost:7071/api'),
      'local',
      '/v1.0.0/generate?mode=validate&source=local',
    );

    expect(result).toBe(
      'http://localhost:7071/api/v1.0.0/generate?mode=validate&source=local',
    );
  });

  it('builds an HTTPS backend URL without a double slash', () => {
    expect(
      buildApiUrl(
        api('https://localhost:7071/api/'),
        'local',
        '/v1.0.0/generate',
      ),
    ).toBe('https://localhost:7071/api/v1.0.0/generate');
  });

  it('preserves functional query params in a deployed environment', () => {
    const result = buildApiUrl(
      api('https://backend.example/api'),
      'develop',
      '/v1.0.0/azdo/hu/search?top=25&text=hello%20world',
    );
    const parsed = new URL(result);

    expect(parsed.origin).toBe('https://backend.example');
    expect(parsed.pathname).toBe('/api/v1.0.0/azdo/hu/search');
    expect(parsed.searchParams.get('top')).toBe('25');
    expect(parsed.searchParams.get('text')).toBe('hello world');
  });

  it('rejects path traversal and network-path endpoints', () => {
    const deployedApi = api('https://backend.example/api');
    expect(() =>
      buildApiUrl(deployedApi, 'develop', '/../external'),
    ).toThrowError(/sobrescribir/);
    expect(() =>
      buildApiUrl(deployedApi, 'develop', '//external.example/path'),
    ).toThrowError(/una sola barra/);
  });

  it('rejects remote HTTP and lookalike loopback hosts in local', () => {
    ['http://backend.example/api', 'http://localhost.example/api'].forEach(
      (baseUrl) => {
        expect(() => validateApiConfiguration(api(baseUrl), 'local'))
          .withContext(baseUrl)
          .toThrowError(/HTTP local solo permite/);
      },
    );
  });

  it('rejects HTTP, including loopback, in every deployed environment', () => {
    ['develop', 'calidad', 'production'].forEach((environmentName) => {
      ['http://backend.example/api', 'http://localhost:7071/api'].forEach(
        (baseUrl) => {
          expect(() =>
            validateApiConfiguration(api(baseUrl), environmentName),
          )
            .withContext(`${environmentName}: ${baseUrl}`)
            .toThrowError(/debe usar HTTPS/);
        },
      );
    });
  });

  it('allows remote HTTPS in every deployed environment', () => {
    ['develop', 'calidad', 'production'].forEach((environmentName) => {
      expect(
        validateApiConfiguration(
          api('https://backend.example/api'),
          environmentName,
        ),
      )
        .withContext(environmentName)
        .toBe('https://backend.example/api');
    });
  });

  it('rejects an unconfigured environment before parsing a base URL', () => {
    expect(() =>
      buildApiUrl(
        api(null),
        'calidad',
        '/v1.0.0/generate',
      ),
    ).toThrowError(
      'El backend del ambiente calidad todavía no está configurado.',
    );
  });

  it('rejects absolute endpoints and duplicated api segments', () => {
    expect(() =>
      buildApiUrl(
        api('https://localhost:7071/api'),
        'local',
        'https://example.test/v1.0.0/generate',
      ),
    ).toThrowError(/rutas relativas/);
    expect(() =>
      buildApiUrl(
        api('https://localhost:7071/api'),
        'local',
        'ftp://example.test/file',
      ),
    ).toThrowError(/rutas relativas/);
    expect(() =>
      buildApiUrl(
        api('https://localhost:7071/api'),
        'local',
        '/api/v1.0.0/generate',
      ),
    ).toThrowError(/duplica \/api\/api/);
  });

  it('rejects non-HTTP protocols and embedded credentials', () => {
    expect(() =>
      validateApiConfiguration(api('ftp://backend.example/api'), 'develop'),
    ).toThrowError(/protocolo no soportado/);
    expect(() =>
      validateApiConfiguration(
        api('https://user:secret@backend.example/api'),
        'develop',
      ),
    ).toThrowError(/credenciales/);
  });

  it('rejects malformed and relative base URLs', () => {
    ['not a url', '/api'].forEach((baseUrl) => {
      expect(() => validateApiConfiguration(api(baseUrl), 'local'))
        .withContext(baseUrl)
        .toThrowError(/URL absoluta/);
    });
  });
});
