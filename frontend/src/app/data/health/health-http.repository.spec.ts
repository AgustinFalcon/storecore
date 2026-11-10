import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HealthHttpRepository } from './health-http.repository';
import { HealthStatus } from '../../domain/health/health-status';

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
    await expect(pending).resolves.toEqual({ status: HealthStatus.Up });
  });

  it('maps a future or malformed successful payload to Unknown', async () => {
    const repo = TestBed.inject(HealthHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.read());
    const req = ctrl.expectOne('/api/v1/health');
    req.flush({ code: 200, data: { status: 'DEGRADED' } });
    await expect(pending).resolves.toEqual({ status: HealthStatus.Unknown });
  });
});
