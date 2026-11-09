import { HttpInterceptorFn } from '@angular/common/http';
import {
  API_CLIENT_APP_NAME,
  API_HEADERS,
} from '../config/api-contract';

function createCorrelationId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  const correlationId =
    req.headers.get(API_HEADERS.correlationId)?.trim() ||
    req.headers.get('X-Correlation-Id')?.trim() ||
    createCorrelationId();

  const clientApp =
    req.headers.get(API_HEADERS.clientApp)?.trim() ||
    req.headers.get('X-Client-App')?.trim() ||
    API_CLIENT_APP_NAME;

  const requestWithHeaders = req.clone({
    setHeaders: {
      'X-Correlation-Id': correlationId,
      'X-Client-App': clientApp,
    },
  });

  return next(requestWithHeaders);
};
