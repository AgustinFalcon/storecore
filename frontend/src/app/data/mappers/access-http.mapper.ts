import { AccessContext } from '../../domain/access/access-context';
import { AccessHome } from '../../domain/access/access-home';
import { LoginResolution, LoginResult } from '../../domain/access/login-resolution';
import { ReturnDestination } from '../../domain/access/return-destination';
function object(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}
/** Unified endpoints require the approved envelope, never a raw or partially understood payload. */
export function mapAccessResponse(raw: unknown): LoginResult {
  const envelope = object(raw);
  if (!envelope || envelope['code'] !== 200) return LoginResult.Unknown;
  const payload = object(envelope['data']);
  if (!payload) return LoginResult.Unknown;
  const resolution = LoginResolution.fromWire(payload['kind']);
  const destination = ReturnDestination.fromWire(object(payload['destination'])?.['kind']);
  if (resolution === LoginResolution.Authenticated) {
    return LoginResult.authenticated(AccessContext.fromWire(payload['context']), AccessHome.fromWire(payload['home']), destination);
  }
  if (resolution === LoginResolution.ContextSelectionRequired && typeof payload['challenge'] === 'string' && typeof payload['expiresAt'] === 'string' && Array.isArray(payload['contexts'])) {
    return LoginResult.selectionRequired(payload['challenge'], payload['contexts'].map(AccessContext.fromWire), payload['expiresAt'], destination);
  }
  return LoginResult.Unknown;
}
