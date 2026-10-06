import { Observable } from 'rxjs';
import { AccessContext } from './access-context';
import { LoginResult } from './login-resolution';
export interface AccessCredentials {
  readonly email: string;
  readonly password: string;
  readonly returnPath?: string;
}
export interface IAccessRepository {
  signIn(credentials: AccessCredentials): Observable<LoginResult>;
  selectContext(challenge: string, context: AccessContext): Observable<LoginResult>;
}
