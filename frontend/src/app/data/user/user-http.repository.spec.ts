import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, retry } from 'rxjs';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { UserHttpRepository } from './user-http.repository';

describe('UserHttpRepository capability command', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), UserHttpRepository],
  }));

  it('sends UUID and expected version, reusing the same body on retry and mapping the result', async () => {
    const repo = TestBed.inject(UserHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    const command = {
      module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused,
      correlationId: '600ecef2-188e-4a96-969e-7bfd4a15c8ce', expectedConfigVersion: 7,
    };
    const pending = firstValueFrom(repo.setCapability(command).pipe(retry(1)));
    const first = http.expectOne('/api/v1/user/capabilities/CATALOG/state');
    expect(first.request.method).toBe('POST');
    expect(first.request.body).toEqual({ state: 'PAUSED', correlationId: command.correlationId, expectedConfigVersion: 7 });
    first.flush({}, { status: 503, statusText: 'Unavailable' });
    const second = http.expectOne('/api/v1/user/capabilities/CATALOG/state');
    expect(second.request.body).toEqual(first.request.body);
    second.flush({ module: 'CATALOG', state: 'PAUSED', configVersion: 8 });
    await expect(pending).resolves.toEqual({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, configVersion: 8 });
    http.verify();
  });
});
