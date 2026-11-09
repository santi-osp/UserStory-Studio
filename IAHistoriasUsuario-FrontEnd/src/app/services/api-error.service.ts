import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorShape } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ApiErrorService {
  mapHttpError(error: HttpErrorResponse): ApiErrorShape {
    if (error.status === 0) {
      return {
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'No fue posible conectar con el servicio.',
        detail: this.readDetail(error),
      };
    }

    const correlationId = this.tryReadHeader(error, 'x-correlation-id');
    const detail = this.readDetail(error);

    if (error.status === 400) {
      return {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'La solicitud enviada no es valida.',
        correlationId,
        detail,
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        status: error.status,
        code: 'UNAUTHORIZED',
        message: 'No autorizado para ejecutar esta operacion.',
        correlationId,
        detail,
      };
    }

    if (error.status === 408) {
      return {
        status: 408,
        code: 'TIMEOUT',
        message: 'El servicio tardo demasiado en responder.',
        correlationId,
        detail,
      };
    }

    if (error.status >= 500) {
      return {
        status: error.status,
        code: 'SERVER_ERROR',
        message: 'Error interno del servicio. Intenta nuevamente.',
        correlationId,
        detail,
      };
    }

    return {
      status: error.status,
      code: 'UNEXPECTED_ERROR',
      message: 'Error no controlado en la llamada HTTP.',
      correlationId,
      detail,
    };
  }

  toMessage(error: ApiErrorShape): string {
    return error.correlationId
      ? `${error.message} (Correlation-Id: ${error.correlationId})`
      : error.message;
  }

  private tryReadHeader(
    error: HttpErrorResponse,
    headerName: string,
  ): string | undefined {
    try {
      return error.headers?.get(headerName) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private readDetail(error: HttpErrorResponse): string | undefined {
    if (!error.error) {
      return undefined;
    }

    if (typeof error.error === 'string') {
      return error.error;
    }

    if (typeof error.error === 'object') {
      const message =
        (error.error.message as string | undefined) ??
        (error.error.error as string | undefined);
      return message;
    }

    return undefined;
  }
}
