import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { UserHttpRepository } from './user-http.repository';

describe('UserHttpRepository capabilities', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), UserHttpRepository],
  }));

  it('exposes capabilities through the GET contract only', async () => {
    const repository = TestBed.inject(UserHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repository.listCapabilities());
    const request = http.expectOne('/api/v1/user/capabilities');
    expect(request.request.method).toBe('GET');
    request.flush([{ module: 'CATALOG', state: 'ACTIVE', configVersion: 3 }]);
    await expect(pending).resolves.toEqual([
      { id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Active, configVersion: 3 },
    ]);
    http.verify();
  });
});
