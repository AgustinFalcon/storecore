import { AccessContext } from '../../domain/access/access-context';
import { AccessTransportCsrf, TransportCsrfOutcome } from './access-transport-csrf';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';

describe('transport CSRF reconciliation', () => {
  it('updates only the rotated realm token, never its identity or pending fence', () => {
    const customer = new CustomerSession(); const user = new UserSession();
    customer.invalidatePending(); user.setCsrf('other');
    const revision = customer.generation();
    expect(new AccessTransportCsrf(customer, user).reconcile(AccessContext.Customer, ' rotated ')).toBe(TransportCsrfOutcome.Applied);
    expect(customer.csrf()).toBe('rotated'); expect(user.csrf()).toBe('other');
    expect(customer.authenticated()).toBe(false); expect(customer.actorId()).toBeNull();
    expect(customer.transitionPending()).toBe(true); expect(customer.generation()).toBe(revision);
  });
  it('fails closed on unknown realm or absent token', () => {
    const customer = new CustomerSession(); const user = new UserSession();
    const owner = new AccessTransportCsrf(customer, user);
    expect(owner.reconcile(AccessContext.Unknown, 'raw')).toBe(TransportCsrfOutcome.Unknown);
    expect(owner.reconcile(AccessContext.User, null)).toBe(TransportCsrfOutcome.Unknown);
    expect(owner.reconcile(AccessContext.Customer, ' ')).toBe(TransportCsrfOutcome.Unknown);
    expect(customer.csrf()).toBe(''); expect(user.csrf()).toBe('');
  });
});
