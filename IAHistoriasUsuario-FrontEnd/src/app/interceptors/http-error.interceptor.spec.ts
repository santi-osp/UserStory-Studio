import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApiErrorService } from '../services/api-error.service';
import { httpErrorInterceptor } from './http-error.interceptor';

describe('httpErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApiErrorService,
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should map 500 errors to uniform shape', (done) => {
    http.post('/api/create', {}).subscribe({
      next: () => {
        fail('Expected an error response');
        done();
      },
      error: (error) => {
        expect(error.code).toBe('SERVER_ERROR');
        expect(error.status).toBe(500);
        done();
      },
    });

    const req = httpMock.expectOne('/api/create');
    req.flush(
      { message: 'boom' },
      {
        status: 500,
        statusText: 'Server Error',
        headers: { 'x-correlation-id': 'cid-500' },
      },
    );
  });
});
