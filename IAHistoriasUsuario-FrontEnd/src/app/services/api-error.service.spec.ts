import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorService } from './api-error.service';

describe('ApiErrorService', () => {
  const service = new ApiErrorService();

  it('does not expose a request URL through generic HTTP errors', () => {
    const mapped = service.mapHttpError(
      new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        url: 'https://backend.example/api/v1.0.0/generate',
      }),
    );

    expect(mapped.message).toBe('Error no controlado en la llamada HTTP.');
    expect(JSON.stringify(mapped)).not.toContain('backend.example');
  });
});
