import { AuthenticateRecoveredRealm, CaptureNewPasswordStep, CaptureRecoveryLinkStep, CaptureRecoveryRequestStep, RecoveryOutcome, RecoveryRealm } from './recovery';

describe('closed recovery domain and capture steps', () => {
  it('round-trips realms and fails closed without exposing wire text', () => {
    for (const realm of RecoveryRealm.all) expect(RecoveryRealm.fromWire(realm.wire)).toBe(realm);
    for (const raw of [null, {}, 'admin', 'CUSTOMER']) {
      expect(RecoveryRealm.fromWire(raw)).toBe(RecoveryRealm.Unknown);
      expect(AuthenticateRecoveredRealm.fromWire(raw).active).toBe(false);
      expect(RecoveryOutcome.fromWire(raw)).toBe(RecoveryOutcome.Unknown);
    }
    expect(AuthenticateRecoveredRealm.forRealm(RecoveryRealm.User).realm).toBe(RecoveryRealm.User);
  });
  it('accepts only an unambiguous realm and base64url secret', () => {
    const step = new CaptureRecoveryLinkStep(), token = 'a'.repeat(43);
    for (const realm of RecoveryRealm.all) expect(step.capture(`realm=${realm.wire}&token=${token}`)).toEqual({ realm, token });
    for (const fragment of ['', `realm=admin&token=${token}`, `realm=user&token=${token}&realm=customer`, 'realm=user&token=short', `realm=user&token=${token}&extra=value`]) {
      expect(step.capture(fragment)).toEqual({ realm: RecoveryRealm.Unknown, token: '' });
    }
  });
  it('validates request independently of account existence and counts Unicode code points', () => {
    const request = new CaptureRecoveryRequestStep(), password = new CaptureNewPasswordStep();
    expect(request.accepts(RecoveryRealm.Unknown, 'person@example.test')).toBe(false);
    expect(request.accepts(RecoveryRealm.Customer, ' person@example.test ')).toBe(true);
    expect(request.accepts(RecoveryRealm.Customer, 'broken')).toBe(false);
    for (const size of [12, 128]) expect(password.accepts('😀'.repeat(size), '😀'.repeat(size))).toBe(true);
    for (const size of [11, 129]) expect(password.accepts('😀'.repeat(size), '😀'.repeat(size))).toBe(false);
    expect(password.accepts(' password-long ', 'password-long')).toBe(false);
    expect(password.accepts(' '.repeat(12), ' '.repeat(12))).toBe(true);
  });
});
