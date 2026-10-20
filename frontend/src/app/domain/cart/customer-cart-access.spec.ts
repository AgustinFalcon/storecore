import { AccessContext } from '../access/access-context';
import { AccessState, SessionProbe } from '../access/session-probe';
import { UserRole } from '../user/user-role';
import { CustomerCartAccess } from './customer-cart-access';

describe('CustomerCartAccess closed authority', () => {
  const customer = SessionProbe.authenticated({ id: 'a', email: 'a@test', firstName: '', lastName: '', phone: '' }, 'csrf');
  const user = SessionProbe.authenticated({ id: 'operator', roles: [UserRole.Operator] }, 'csrf');
  it('allows mutations only with an accepted active CUSTOMER and identified actor', () => {
    expect(CustomerCartAccess.resolve(AccessState.resolve(customer, user, AccessContext.Customer), 'a')).toBe(CustomerCartAccess.Ready);
    expect(CustomerCartAccess.resolve(AccessState.resolve(customer, user, AccessContext.Customer), null)).toBe(CustomerCartAccess.SignIn);
  });
  it('asks for explicit selection with dual sessions and USER or Unknown active', () => {
    for (const context of [AccessContext.User, AccessContext.Unknown]) {
      expect(CustomerCartAccess.resolve(AccessState.resolve(customer, user, context), 'a')).toBe(CustomerCartAccess.SelectCustomer);
    }
  });
  it('fails closed for unknown, anonymous and USER-only authority', () => {
    expect(CustomerCartAccess.resolve(AccessState.Indeterminate, 'a')).toBe(CustomerCartAccess.Unknown);
    expect(CustomerCartAccess.resolve(AccessState.Anonymous, null)).toBe(CustomerCartAccess.SignIn);
    expect(CustomerCartAccess.resolve(AccessState.resolve(SessionProbe.Anonymous, user, AccessContext.User), 'a')).toBe(CustomerCartAccess.SignIn);
  });
});
