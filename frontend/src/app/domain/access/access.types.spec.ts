import { AccessHome, IdentityRealm, LoginResolution, LoginResolutionKind, ReturnDestination } from './access.types';
import { CollectCredentialsStep, CompleteAccessStep } from './access.steps';

describe('closed unified access boundary', () => {
  it('maps only exact contexts and homes', () => {
    expect(IdentityRealm.fromWire('CUSTOMER')).toBe(IdentityRealm.Customer);
    expect(IdentityRealm.fromWire('USER')).toBe(IdentityRealm.User);
    expect(IdentityRealm.fromWire('user')).toBe(IdentityRealm.Unknown);
    expect(AccessHome.fromWire('OPERATIONS')).toBe(AccessHome.Operations);
    expect(AccessHome.fromWire('other')).toBe(AccessHome.Unknown);
  });
  it('rejects malformed and mismatched authenticated data before navigation', () => {
    for (const raw of [null, {}, { kind: 'NEW' }, { kind: 'AUTHENTICATED', context: 'USER', home: 'STOREFRONT', destination: { kind: 'HOME' } },
      { kind: 'AUTHENTICATED', context: 'USER', home: 'OPERATIONS', destination: { kind: 'NEW' } }]) {
      expect(LoginResolution.fromWire(raw)).toBe(LoginResolution.Unknown);
    }
  });
  it('resolves known destinations with context compatibility', () => {
    const resolution = LoginResolution.fromWire({ kind: 'AUTHENTICATED', context: 'CUSTOMER', home: 'STOREFRONT', destination: { kind: 'USER_ORDERS' } });
    expect(new CompleteAccessStep().execute(resolution)).toBe('/');
    expect(ReturnDestination.UserOrders.routeFor(IdentityRealm.User, AccessHome.Operations)).toBe('/user/orders');
    expect(ReturnDestination.Home.routeFor(IdentityRealm.User, AccessHome.Operations)).toBe('/user/home');
    expect(ReturnDestination.Catalog.routeFor(IdentityRealm.Unknown, AccessHome.Unknown)).toBeNull();
  });
  it('never replays untrusted return URLs', () => {
    for (const raw of ['https://evil.test', '//evil.test', '/catalog?context=USER', '/catalog#x', '/%63atalog', '/catalog\\', '/user/inventory', '/customer/orders/9', 'x'.repeat(4097)]) {
      expect(ReturnDestination.fromPath(raw)).toBe(ReturnDestination.Home);
    }
    expect(ReturnDestination.fromPath('/customer/orders')).toBe(ReturnDestination.CustomerOrders);
  });
  it('requires exactly the two independently verified known contexts', () => {
    const challenge = { kind: 'CONTEXT_SELECTION_REQUIRED', challenge: 'a'.repeat(32), contexts: ['CUSTOMER', 'USER'], expiresAt: '2030-01-01T00:00:00Z' };
    expect(LoginResolution.fromWire(challenge).kind).toBe(LoginResolutionKind.ContextSelectionRequired);
    for (const replacement of [{ contexts: ['CUSTOMER', 'CUSTOMER'] }, { contexts: ['CUSTOMER', 'ADMIN'] }, { challenge: 'short' }, { expiresAt: 'invalid' }]) {
      expect(LoginResolution.fromWire({ ...challenge, ...replacement })).toBe(LoginResolution.Unknown);
    }
  });
  it('collects bounded credentials and a closed return path without trimming passwords', () => {
    const step = new CollectCredentialsStep();
    expect(step.collect(' a@b.c ', ' twelve chars ', '//evil.test')).toEqual({ email: 'a@b.c', password: ' twelve chars ', returnPath: '/' });
    expect(step.collect('a@b.c', 'short', '/')).toBeNull();
    expect(step.collect('a@b.c', 'x'.repeat(129), '/')).toBeNull();
    expect(step.collect('a@b.c', '😀'.repeat(65), '/')).not.toBeNull();
    expect(step.collect('a@b.c', '😀'.repeat(6), '/')).toBeNull();
    expect(step.collect('a@b.c', '😀'.repeat(129), '/')).toBeNull();
  });
});
