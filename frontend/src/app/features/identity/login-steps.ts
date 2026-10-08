import { Observable, map, of } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessContext } from '../../domain/access/access-context';
import { AccessCredentials, IAccessRepository } from '../../domain/access/access.repository';
import { LoginResolution, LoginResult } from '../../domain/access/login-resolution';
import { ReturnDestination } from '../../domain/access/return-destination';

/** Captures only a validated destination and never keeps a credential copy. */
export class CredentialCaptureStep {
  capture(email: string, password: string, destination: ReturnDestination): AccessCredentials | null {
    const passwordCodePoints = [...password].length;
    if (!email.trim() || email.length > 320 || passwordCodePoints < 12 || passwordCodePoints > 128) return null;
    const returnPath = destination === ReturnDestination.Unknown ? '/' : destination.routeFor(AccessContext.Customer) ?? destination.routeFor(AccessContext.User) ?? '/';
    return { email: email.trim(), password, returnPath };
  }
}

export class AuthenticationStep {
  constructor(private readonly repository: IAccessRepository) {}
  execute(credentials: AccessCredentials): Observable<LoginResult> { return this.repository.signIn(credentials); }
}

export class ChallengeSelectionStep {
  constructor(private readonly repository: IAccessRepository) {}
  execute(result: LoginResult, context: AccessContext): Observable<LoginResult> {
    return result.resolution === LoginResolution.ContextSelectionRequired && result.challenge && result.contexts.includes(context)
      ? this.repository.selectContext(result.challenge, context) : of(LoginResult.Unknown);
  }
}

/** Navigation is resolved only after the session and CSRF have been accepted. */
export class CompletionStep {
  constructor(private readonly coordinator: AccessCoordinator) {}
  execute(result: LoginResult): Observable<string | null> {
    return this.coordinator.acceptAuthenticated(result.context).pipe(map((state) =>
      state.permits(result.context) && state.activeContext === result.context ? result.destination.routeFor(result.context) : null));
  }
}
