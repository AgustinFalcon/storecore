import { AccessContext } from './access-context';
import { AccessHome } from './access-home';
import { LoginResolution, LoginResult } from './login-resolution';
import { LoginStage } from './login-stage';
import { ReturnDestination } from './return-destination';
describe('closed access domain', () => {
  it('translates each known case once and fails closed for unsupported wire values', () => {
    for (const type of [AccessContext, AccessHome, LoginResolution, LoginStage, ReturnDestination]) {
      expect(type.fromWire(null)).toBe(type.Unknown);
      expect(type.fromWire('future')).toBe(type.Unknown);
      expect(type.fromWire({})).toBe(type.Unknown);
    }
    for (const value of [AccessContext.Customer, AccessContext.User]) expect(AccessContext.fromWire(value.wire)).toBe(value);
    for (const value of [AccessHome.Storefront, AccessHome.Operations]) expect(AccessHome.fromWire(value.wire)).toBe(value);
    for (const value of [ReturnDestination.Home, ReturnDestination.Catalog, ReturnDestination.CustomerProfile, ReturnDestination.CustomerOrders, ReturnDestination.UserOrders]) expect(ReturnDestination.fromWire(value.wire)).toBe(value);
    for (const value of [LoginStage.CollectCredentials, LoginStage.Authenticate, LoginStage.SelectContext, LoginStage.CompleteAccess]) expect(LoginStage.fromWire(value.wire)).toBe(value);
    for (const value of [LoginResolution.Authenticated, LoginResolution.ContextSelectionRequired, LoginResolution.Rejected, LoginResolution.Unavailable]) expect(LoginResolution.fromWire(value.wire)).toBe(value);
  });
  it('keeps destination authority within the selected context', () => {
    expect(ReturnDestination.CustomerOrders.routeFor(AccessContext.Customer)).toBe('/customer/orders');
    expect(ReturnDestination.CustomerOrders.routeFor(AccessContext.User)).toBeNull();
    expect(ReturnDestination.UserOrders.routeFor(AccessContext.Customer)).toBeNull();
    expect(ReturnDestination.Home.routeFor(AccessContext.User)).toBe('/user/home');
    expect(ReturnDestination.Home.routeFor(AccessContext.Unknown)).toBeNull();
    expect(ReturnDestination.Unknown.routeFor(AccessContext.Customer)).toBeNull();
  });
  it('accepts only the exact v1 route allow-list', () => {
    expect(ReturnDestination.fromPath('/catalog')).toBe(ReturnDestination.Catalog);
    for (const path of ['https://evil.test', '//evil.test', '/customer/orders?context=USER', '/catalog#x', '/%63atalog', '/checkout', '/customer/addresses', '/user/orders/1', '\\catalog', '/catalog?x=1', 'x'.repeat(2049)]) expect(ReturnDestination.fromPath(path)).toBe(ReturnDestination.Unknown);
  });
  it('rejects unknown context, mismatched home and cross-realm destinations', () => {
    expect(LoginResult.authenticated(AccessContext.Unknown, AccessHome.Storefront, ReturnDestination.Home)).toBe(LoginResult.Unknown);
    expect(LoginResult.authenticated(AccessContext.User, AccessHome.Storefront, ReturnDestination.Home)).toBe(LoginResult.Unknown);
    expect(LoginResult.authenticated(AccessContext.Customer, AccessHome.Storefront, ReturnDestination.UserOrders)).toBe(LoginResult.Unknown);
  });
});
