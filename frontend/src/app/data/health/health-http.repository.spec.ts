import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HealthHttpRepository } from './health-http.repository';

describe('HealthHttpRepository', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HealthHttpRepository],
    });
  });

  it('unwraps an AssistTime envelope', async () => {
    const repo = TestBed.inject(HealthHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.read());
    TestBed.inject(HttpClient);
    const req = ctrl.expectOne('/api/v1/health');
    req.flush({
      code: 200,
      data: { status: 'UP' },
      message: null,
      errorCode: null,
      retryable: null,
      traceId: 't-1',
    });
    await expect(pending).resolves.toEqual({ status: 'UP' });
  });
});
