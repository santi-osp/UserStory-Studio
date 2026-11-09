import { ApiEnvironmentConfiguration } from '../../Environments/environment.model';

export type ApiConfigurationErrorCode =
  | 'API_NOT_CONFIGURED'
  | 'INVALID_API_CONFIGURATION';

export class ApiConfigurationError extends Error {
  constructor(
    message: string,
    readonly code: ApiConfigurationErrorCode,
  ) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

const PLACEHOLDER_PATTERN =
  /(?:placeholder|pending|pendiente|replace[-_ ]?me|todo|<[^>]+>|\{[^}]+\}|__[^\s]+__)/i;

function invalidConfiguration(environmentName: string, detail: string): never {
  throw new ApiConfigurationError(
    `La URL del backend para el ambiente ${environmentName} no es válida: ${detail}.`,
    'INVALID_API_CONFIGURATION',
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '[::1]' ||
    normalizedHostname === '::1'
  );
}

export function validateApiConfiguration(
  api: ApiEnvironmentConfiguration,
  environmentName: string,
): string {
  const candidate = api.baseUrl?.trim() ?? '';
  if (!candidate) {
    throw new ApiConfigurationError(
      `El backend del ambiente ${environmentName} todavía no está configurado.`,
      'API_NOT_CONFIGURED',
    );
  }
  if (PLACEHOLDER_PATTERN.test(candidate)) {
    return invalidConfiguration(environmentName, 'contiene un placeholder');
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return invalidConfiguration(environmentName, 'debe ser una URL absoluta');
  }

  if (!parsed.hostname) {
    return invalidConfiguration(environmentName, 'no contiene un host');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return invalidConfiguration(
      environmentName,
      'usa un protocolo no soportado; debe usar HTTP o HTTPS',
    );
  }
  if (parsed.protocol === 'http:') {
    if (environmentName !== 'local') {
      return invalidConfiguration(
        environmentName,
        'HTTP solo está permitido en el ambiente local; debe usar HTTPS',
      );
    }
    if (!isLoopbackHostname(parsed.hostname)) {
      return invalidConfiguration(
        environmentName,
        'HTTP local solo permite localhost, 127.0.0.1 o ::1',
      );
    }
  }
  if (parsed.hostname.toLowerCase() === 'localhost' && parsed.port === '4200') {
    return invalidConfiguration(
      environmentName,
      'localhost:4200 corresponde al frontend',
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return invalidConfiguration(
      environmentName,
      'no debe contener credenciales, query string ni fragmento',
    );
  }

  return candidate.replace(/\/+$/, '');
}

export function buildApiUrl(
  api: ApiEnvironmentConfiguration,
  environmentName: string,
  endpoint: string,
): string {
  const baseUrl = validateApiConfiguration(api, environmentName);
  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint || PLACEHOLDER_PATTERN.test(normalizedEndpoint)) {
    return invalidConfiguration(environmentName, 'el endpoint no es válido');
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(normalizedEndpoint)) {
    return invalidConfiguration(
      environmentName,
      'los endpoints deben ser rutas relativas a la base',
    );
  }
  if (
    !normalizedEndpoint.startsWith('/') ||
    normalizedEndpoint.startsWith('//') ||
    normalizedEndpoint.includes('\\')
  ) {
    return invalidConfiguration(
      environmentName,
      'los endpoints deben iniciar con una sola barra',
    );
  }

  const parsedBase = new URL(`${baseUrl}/`);
  const parsedResult = new URL(normalizedEndpoint.slice(1), parsedBase);
  if (
    parsedResult.origin !== parsedBase.origin ||
    !parsedResult.pathname.startsWith(parsedBase.pathname)
  ) {
    return invalidConfiguration(
      environmentName,
      'el endpoint no puede sobrescribir la URL base',
    );
  }
  if (parsedResult.hash) {
    return invalidConfiguration(
      environmentName,
      'el endpoint no debe contener fragmento',
    );
  }
  if (/\/api\/api(?:\/|$)/i.test(parsedResult.pathname)) {
    return invalidConfiguration(environmentName, 'la ruta duplica /api/api');
  }

  return parsedResult.toString();
}
