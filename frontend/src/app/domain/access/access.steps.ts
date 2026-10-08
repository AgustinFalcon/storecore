import { Observable } from 'rxjs';
import { AccessCredentials, AccessRepository } from './access.repository';
import { IdentityRealm, LoginResolution, LoginResolutionKind, ReturnDestination } from './access.types';

export class CollectCredentialsStep {
  collect(email: string, password: string, returnPath: unknown): AccessCredentials | null {
    const passwordCodePoints = Array.from(password).length;
    if (!email.trim() || email.length > 320 || passwordCodePoints < 12 || passwordCodePoints > 128) return null;
    return { email: email.trim(), password, returnPath: ReturnDestination.fromPath(returnPath).path ?? '/' };
  }
}
export class AuthenticateStep {
  constructor(private readonly repository: AccessRepository) {}
  execute(credentials: AccessCredentials): Observable<LoginResolution> { return this.repository.authenticate(credentials); }
}
export class SelectContextStep {
  constructor(private readonly repository: AccessRepository) {}
  execute(resolution: LoginResolution, realm: IdentityRealm, now: number): Observable<LoginResolution> | null {
    if (resolution.kind !== LoginResolutionKind.ContextSelectionRequired || resolution.expiresAt <= now || !realm.known || !resolution.contexts.includes(realm)) return null;
    return this.repository.select(resolution.challenge, realm);
  }
}
export class CompleteAccessStep {
  execute(resolution: LoginResolution): string | null {
    return resolution.kind === LoginResolutionKind.Authenticated ? resolution.route : null;
  }
}
