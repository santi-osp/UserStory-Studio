import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiErrorService } from '../services/api-error.service';

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const apiErrorService = inject(ApiErrorService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        return throwError(() => apiErrorService.mapHttpError(error));
      }

      return throwError(() => ({
        status: -1,
        code: 'UNEXPECTED_ERROR',
        message: 'Error inesperado de aplicación.',
      }));
    }),
  );
};
