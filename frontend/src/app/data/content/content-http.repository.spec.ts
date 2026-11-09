import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HomeBlockKind as Kind } from '../../domain/content/home-composition';
import { ContentHttpRepository } from './content-http.repository';
const wire = {revision: 4, sections: [{key: 'hero', kind: Kind.Hero.wire, active: true, sortOrder: 0, content: {title: 'Tienda', body: ''}, updatedAt: '2026-11-08T12:00:00Z'}]};
describe('content HTTP repository', () => {
  beforeEach(() => TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(), ContentHttpRepository]}));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('keeps public and admin reads separate and serializes an atomic expected-revision replacement', async () => {
    const repo = TestBed.inject(ContentHttpRepository), http = TestBed.inject(HttpTestingController);
    const publicRead = firstValueFrom(repo.readPublic());
    http.expectOne(environment.apiBaseUrl + '/content/home').flush({code: 200, data: wire}); expect((await publicRead).sections[0].kind).toBe(Kind.Hero);
    const adminRead = firstValueFrom(repo.readAdmin());
    http.expectOne(environment.apiBaseUrl + '/user/content/home').flush(wire);
    const home = await adminRead, save = firstValueFrom(repo.replace({expectedRevision: home.revision, sections: home.sections}));
    const request = http.expectOne(environment.apiBaseUrl + '/user/content/home');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({expectedRevision: 4, sections: [{key: 'hero', kind: Kind.Hero.wire, active: true, sortOrder: 0, content: wire.sections[0].content}]});
    request.flush({...wire, revision: 5}); expect((await save).revision).toBe(5);
  });
  it('propagates stale-revision HTTP errors and never substitutes missing data', async () => {
    const repo = TestBed.inject(ContentHttpRepository), http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(repo.replace({expectedRevision: 1, sections: []}));
    const rejection = expect(result).rejects.toMatchObject({status: 409});
    http.expectOne(environment.apiBaseUrl + '/user/content/home').flush({}, {status: 409, statusText: 'Conflict'}); await rejection;
    const missing = firstValueFrom(repo.readPublic()), invalid = expect(missing).rejects.toThrow();
    http.expectOne(environment.apiBaseUrl + '/content/home').flush({}); await invalid;
  });
});
