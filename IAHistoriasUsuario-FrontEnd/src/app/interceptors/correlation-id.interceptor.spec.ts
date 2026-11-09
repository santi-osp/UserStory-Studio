import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { API_CLIENT_APP_NAME } from '../config/api-contract';
import { correlationIdInterceptor } from './correlation-id.interceptor';

describe('correlationIdInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([correlationIdInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should add correlation and client headers', () => {
    http.post('/api/generate', { prompt: 'hello' }).subscribe();

    const req = httpMock.expectOne('/api/generate');
    expect(req.request.headers.has('X-Correlation-Id')).toBeTrue();
    expect(req.request.headers.get('X-Client-App')).toBe(
      API_CLIENT_APP_NAME,
    );

    req.flush({ ok: true });
  });

  it('should preserve custom tracing headers when already provided', () => {
    const externalUrl =
      'https://sdipfunchuiadllo.azurewebsites.net/api/v1.0.0/generate';

    http
      .post(
        externalUrl,
        { prompt: 'hello' },
        {
          headers: {
            'x-correlation-id': 'cid-123',
            'x-client-app': 'custom-app',
          },
        },
      )
      .subscribe();

    const req = httpMock.expectOne(externalUrl);
    expect(req.request.headers.get('X-Correlation-Id')).toBe('cid-123');
    expect(req.request.headers.get('X-Client-App')).toBe('custom-app');

    req.flush({ ok: true });
  });

  it('should also add tracing headers for absolute urls when missing', () => {
    const externalUrl =
      'https://sdipfunchuiadllo.azurewebsites.net/api/v1.0.0/generate';

    http.post(externalUrl, { prompt: 'hello' }).subscribe();

    const req = httpMock.expectOne(externalUrl);
    expect(req.request.headers.has('X-Correlation-Id')).toBeTrue();
    expect(req.request.headers.get('X-Client-App')).toBe(
      API_CLIENT_APP_NAME,
    );

    req.flush({ ok: true });
  });
});
