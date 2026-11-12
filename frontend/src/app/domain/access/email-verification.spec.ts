import { CaptureVerificationLinkStep, EmailOwnership, VerificationFragmentState, VerificationOutcome, VerificationRequestState, VerificationStage } from './email-verification';
import { RecoveryRealm } from './recovery';

describe('email verification closed boundary', () => {
  it('round trips known types and never promotes future ownership or raw text', () => {
    expect(EmailOwnership.fromWire('VERIFIED')).toBe(EmailOwnership.Verified);
    expect(EmailOwnership.fromWire('UNKNOWN')).toBe(EmailOwnership.Unknown);
    for (const raw of ['verified', 'FUTURE', '<script>', {}, null]) {
      expect(EmailOwnership.fromWire(raw)).toBe(EmailOwnership.Unknown);
      expect(VerificationRequestState.fromWire(raw)).toBe(VerificationRequestState.Unknown);
      expect(VerificationOutcome.fromWire(raw)).toBe(VerificationOutcome.Unknown);
      expect(VerificationStage.fromWire(raw)).toBe(VerificationStage.Unknown);
      expect(VerificationFragmentState.fromWire(raw)).toBe(VerificationFragmentState.Unknown);
    }
    for (const state of [VerificationRequestState.Idle, VerificationRequestState.Submitting, VerificationRequestState.Accepted, VerificationRequestState.RateLimited, VerificationRequestState.Unavailable]) expect(VerificationRequestState.fromWire(state.wire)).toBe(state);
    for (const outcome of [VerificationOutcome.Ready, VerificationOutcome.Verified, VerificationOutcome.Invalid, VerificationOutcome.Expired, VerificationOutcome.Used, VerificationOutcome.Superseded, VerificationOutcome.RateLimited, VerificationOutcome.Unavailable]) expect(VerificationOutcome.fromWire(outcome.wire)).toBe(outcome);
    for (const stage of [VerificationStage.Inspecting, VerificationStage.Ready, VerificationStage.Submitting, VerificationStage.Result]) expect(VerificationStage.fromWire(stage.wire)).toBe(stage);
  });
  it('captures only exact realm and canonical 43-character base64url fragments', () => {
    const capture = new CaptureVerificationLinkStep(), token = 'a'.repeat(43);
    for (const realm of RecoveryRealm.all) expect(capture.capture(`#realm=${realm.wire}&token=${token}`)).toEqual({ realm, token });
    for (const raw of ['', `realm=unknown&token=${token}`, `realm=CUSTOMER&token=${token}`, `realm=customer&token=${token}&extra=x`, `realm=customer&realm=user&token=${token}`, `token=${token}&realm=customer`, `realm=customer&token=${token.slice(1)}`, `realm=customer&token=${token}=`, `realm=customer&token=%61${token.slice(1)}`, `realm=customer&token=${token}\n`]) expect(capture.capture(raw)).toEqual({ realm: RecoveryRealm.Unknown, token: '' });
  });
  it('does not replay router emissions after consuming the address-bar fragment', () => {
    expect(VerificationFragmentState.Waiting.accepts('')).toBe(true);
    expect(VerificationFragmentState.Captured.accepts('')).toBe(false);
    expect(VerificationFragmentState.Captured.accepts('#new-link')).toBe(true);
    expect(VerificationFragmentState.Unknown.accepts('#new-link')).toBe(false);
  });
});
