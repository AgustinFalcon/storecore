import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, retry } from 'rxjs';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { CapabilityCommandStatus } from '../../domain/user/capability-command-status';
import { UserHttpRepository } from './user-http.repository';

describe('UserHttpRepository capability command', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), UserHttpRepository],
  }));

  it('translates durable command results and malformed responses at the HTTP boundary', async () => {
    const repo = TestBed.inject(UserHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    for (const [result, expected] of [
      [JSON.stringify({ module: 'CATALOG', state: 'PAUSED', configVersion: 8 }), CapabilityCommandStatus.Completed],
      [JSON.stringify({ status: 'ABORTED' }), CapabilityCommandStatus.Aborted],
      [null, CapabilityCommandStatus.Unknown],
      ['not-json', CapabilityCommandStatus.Unknown],
    ]) {
      const pending = firstValueFrom(repo.capabilityCommandStatus('600ecef2-188e-4a96-969e-7bfd4a15c8ce'));
      http.expectOne('/api/v1/user/capabilities/commands/600ecef2-188e-4a96-969e-7bfd4a15c8ce').flush({ result });
      await expect(pending).resolves.toBe(expected);
    }
    http.verify();
  });

  it('rejects Unknown before any HTTP request', async () => {
    const repo = TestBed.inject(UserHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    await expect(firstValueFrom(repo.setCapability({
      module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Unknown,
      expectedConfigVersion: 1, correlationId: crypto.randomUUID(), reason: 'test',
    }))).rejects.toThrow('Comando de configuración no válido.');
    http.expectNone(request => request.method === 'POST');
    http.verify();
  });

  it('sends UUID and expected version, reusing the same body on retry and mapping the result', async () => {
    const repo = TestBed.inject(UserHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    const command = {
      module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused,
      correlationId: '600ecef2-188e-4a96-969e-7bfd4a15c8ce', expectedConfigVersion: 7,
      reason: 'Mantenimiento programado',
    };
    const pending = firstValueFrom(repo.setCapability(command).pipe(retry(1)));
    const first = http.expectOne('/api/v1/user/capabilities/CATALOG/state');
    expect(first.request.method).toBe('POST');
    expect(first.request.body).toEqual({ state: 'PAUSED', correlationId: command.correlationId, expectedConfigVersion: 7, reason: command.reason });
    first.flush({}, { status: 503, statusText: 'Unavailable' });
    const second = http.expectOne('/api/v1/user/capabilities/CATALOG/state');
    expect(second.request.body).toEqual(first.request.body);
    second.flush({ module: 'CATALOG', state: 'PAUSED', configVersion: 8 });
    await expect(pending).resolves.toEqual({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, configVersion: 8 });
    http.verify();
  });
});
