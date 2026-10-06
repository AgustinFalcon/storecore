import { CustomerSession } from './customer-session';

describe('CustomerSession', () => {
  it('commits the principal with CSRF and clears both atomically', () => {
    const session = new CustomerSession();
    const principal = { id: '1', email: 'a@example.test', firstName: 'A', lastName: 'B', phone: '' };
    session.commit(principal, ' csrf ');
    expect(session.principal()).toEqual(principal);
    expect(session.authenticated()).toBe(true);
    expect(session.csrf()).toBe('csrf');
    session.clear();
    expect(session.principal()).toBeNull();
    expect(session.authenticated()).toBe(false);
    expect(session.csrf()).toBe('');
  });
  it('tracks cookie session and in-memory CSRF without a bearer', () => {
    const session = new CustomerSession();
    expect(session.authenticated()).toBe(false);
    expect(session.csrf()).toBe('');

    session.markAuthenticated();
    session.setCsrf(' csrf-1 ');
    expect(session.authenticated()).toBe(true);
    expect(session.csrf()).toBe('csrf-1');

    session.clear();
    expect(session.authenticated()).toBe(false);
    expect(session.csrf()).toBe('');
  });
});
