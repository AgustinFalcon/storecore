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

  it('posts profile manifest text unchanged for preview and merge', async () => {
    const repository = TestBed.inject(UserHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    const manifest = '{\n  "content": {"homeSections": []}\n}';
    for (const [url, execute] of [
      ['/api/v1/user/profiles/preview', () => repository.previewProfile(manifest)],
      ['/api/v1/user/profiles/merge', () => repository.mergeProfile(manifest)],
    ] as const) {
      const pending = firstValueFrom(execute()); const request = http.expectOne(url);
      expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ manifest });
      request.flush({ compatible: true, version: '1.0.0', diff: '[]' }); await expect(pending).resolves.toMatchObject({ compatible: true });
    }
    http.verify();
  });

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
