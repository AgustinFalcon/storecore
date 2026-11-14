import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BrandingHttpRepository } from './branding-http.repository';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
const wire = { revision: 3, businessName: 'Tienda', logoUrl: null, primaryColor: '#767676', onPrimaryColor: '#ffffff' };
describe('branding HTTP authority boundary', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), BrandingHttpRepository] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('maps malformed public data to fallback and rejects malformed admin authority', async () => {
    const repo = TestBed.inject(BrandingHttpRepository), http = TestBed.inject(HttpTestingController);
    const publicRead = firstValueFrom(repo.readPublic()); http.expectOne(environment.apiBaseUrl + '/storefront/branding').flush({ code: 200, data: {} }); expect(await publicRead).toBeNull();
    const adminRead = firstValueFrom(repo.readAdmin()), rejected = expect(adminRead).rejects.toThrow(/inválida/);
    http.expectOne(environment.apiBaseUrl + '/user/settings/branding').flush({ code: 200, data: { ...wire, revision: 0 } }); await rejected;
  });
  it('sends expected revision with USER CSRF and accepts rotation through the existing interceptor', async () => {
    const repo = TestBed.inject(BrandingHttpRepository), http = TestBed.inject(HttpTestingController), session = TestBed.inject(UserSession);
    session.commit({ id: 'admin', roles: [UserRole.Admin] }, 'before');
    const result = firstValueFrom(repo.replace({ expectedRevision: 2, businessName: wire.businessName, logoUrl: '', primaryColor: wire.primaryColor, onPrimaryColor: wire.onPrimaryColor }));
    const request = http.expectOne(environment.apiBaseUrl + '/user/settings/branding');
    expect(request.request.method).toBe('PUT'); expect(request.request.body.expectedRevision).toBe(2); expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('before');
    request.flush({ code: 200, data: wire }, { headers: { 'X-CSRF-TOKEN': 'after' } });
    expect((await result).revision).toBe(3); expect(session.csrf()).toBe('after');
  });
});
