import { AccessContext } from '../../domain/access/access-context';
import { AccessHome } from '../../domain/access/access-home';
import { LoginResolution, LoginResult } from '../../domain/access/login-resolution';
import { ReturnDestination } from '../../domain/access/return-destination';
import { mapAccessResponse } from './access-http.mapper';
const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const authenticated = { kind: LoginResolution.Authenticated.wire, context: AccessContext.Customer.wire, home: AccessHome.Storefront.wire, destination: { kind: ReturnDestination.Home.wire } };
const challenge = { kind: LoginResolution.ContextSelectionRequired.wire, challenge: 'a'.repeat(40), contexts: [AccessContext.Customer.wire, AccessContext.User.wire], expiresAt: '2026-10-06T10:01:00Z', destination: { kind: ReturnDestination.Home.wire } };
describe('unified access response mapper', () => {
  it('maps a coherent authenticated result and closed return destination', () => {
    const result = mapAccessResponse(envelope(authenticated));
    expect(result.resolution).toBe(LoginResolution.Authenticated);
    expect(result.context).toBe(AccessContext.Customer);
    expect(result.home).toBe(AccessHome.Storefront);
    expect(result.destination).toBe(ReturnDestination.Home);
  });
  it('maps only a verified dual-context challenge', () => {
    const result = mapAccessResponse(envelope(challenge));
    expect(result.resolution).toBe(LoginResolution.ContextSelectionRequired);
    expect(result.context).toBe(AccessContext.Unknown);
    expect(result.contexts).toEqual([AccessContext.Customer, AccessContext.User]);
  });
  it('fails closed for unknown, missing or inconsistent authenticated fields', () => {
    for (const data of [null, {}, { ...authenticated, kind: 'FUTURE' }, { ...authenticated, context: 'FUTURE' }, { ...authenticated, home: 'FUTURE' }, { ...authenticated, home: AccessHome.Operations.wire }, { ...authenticated, destination: { kind: ReturnDestination.UserOrders.wire } }, { ...authenticated, destination: null }]) expect(mapAccessResponse(envelope(data))).toBe(LoginResult.Unknown);
    expect(mapAccessResponse(authenticated)).toBe(LoginResult.Unknown);
    expect(mapAccessResponse({ code: 201, data: authenticated })).toBe(LoginResult.Unknown);
  });
  it('fails closed for malformed challenge data and duplicate or unsupported contexts', () => {
    for (const data of [{ ...challenge, challenge: '' }, { ...challenge, challenge: 'a'.repeat(257) }, { ...challenge, expiresAt: 'invalid' }, { ...challenge, contexts: [AccessContext.Customer.wire, AccessContext.Customer.wire] }, { ...challenge, contexts: [AccessContext.Customer.wire, 'FUTURE'] }, { ...challenge, destination: { kind: 'FUTURE' } }]) expect(mapAccessResponse(envelope(data))).toBe(LoginResult.Unknown);
  });
});
