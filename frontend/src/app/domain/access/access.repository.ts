import { Observable } from 'rxjs';
import { IdentityRealm, LoginResolution } from './access.types';

export interface AccessCredentials { readonly email: string; readonly password: string; readonly returnPath?: string; }
export interface AccessRepository {
  authenticate(credentials: AccessCredentials): Observable<LoginResolution>;
  select(challenge: string, realm: IdentityRealm): Observable<LoginResolution>;
}
