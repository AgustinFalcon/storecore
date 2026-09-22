import { UserSession } from './user-session';

describe('UserSession', () => {
  it('does not share state with a new instance', () => {
    const session = new UserSession();
    session.markAuthenticated();
    expect(session.authenticated()).toBe(true);

    const other = new UserSession();
    expect(other.authenticated()).toBe(false);
  });
});
