import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { IBrandingRepository, ReplaceBranding } from '../../domain/branding/branding.repository';
import { BrandingAuthorityError, MerchantBranding } from '../../domain/branding/merchant-branding';
function authority(body: unknown): MerchantBranding {
  const value = MerchantBranding.fromWire(readApiBody(body));
  if (!value) throw new BrandingAuthorityError();
  return value;
}
@Injectable()
export class BrandingHttpRepository implements IBrandingRepository {
  constructor(private readonly http: HttpClient) {}
  readPublic(): Observable<MerchantBranding | null> {
    return this.http.get<unknown>(environment.apiBaseUrl + '/storefront/branding').pipe(map(body => MerchantBranding.fromWire(readApiBody(body))));
  }
  readAdmin(): Observable<MerchantBranding> {
    return this.http.get<unknown>(environment.apiBaseUrl + '/user/settings/branding').pipe(map(authority));
  }
  replace(command: ReplaceBranding): Observable<MerchantBranding> {
    return this.http.put<unknown>(environment.apiBaseUrl + '/user/settings/branding', command).pipe(map(authority));
  }
}
