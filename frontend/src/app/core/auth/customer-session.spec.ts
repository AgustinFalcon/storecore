import { CustomerSession } from './customer-session';

describe('CustomerSession', () => {
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
