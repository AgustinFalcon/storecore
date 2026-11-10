import { UserSession } from './user-session';
import { UserRole } from '../../domain/user/user-role';

describe('UserSession', () => {
  it('keeps recovery epoch across reload and CSRF rotation, and replaces it after logout or actor changes', () => {
    sessionStorage.clear(); const session = new UserSession(); const principal = { id: '42', roles: [UserRole.Operator] };
    session.commit(principal, 'csrf'); const epoch = session.authenticationEpoch();
    session.setCsrf('next'); session.commit(principal, 'next'); expect(session.authenticationEpoch()).toBe(epoch);
    expect(new UserSession().authenticationEpoch()).toBe(epoch);
    session.beginAuthenticationEpoch(); expect(session.authenticationEpoch()).not.toBe(epoch); expect(session.csrf()).toBe('next');
    session.clear(); session.commit(principal, 'csrf'); expect(session.authenticationEpoch()).not.toBe(epoch);
    const next = session.authenticationEpoch(); session.commit({ id: '43', roles: [UserRole.Operator] }, 'csrf'); expect(session.authenticationEpoch()).not.toBe(next);
  });
  it('commits principal known roles and CSRF together and clears all of them', () => {
    const session = new UserSession();
    session.commit({ id: '42', roles: [UserRole.Unknown, UserRole.Operator] }, ' csrf ');
    expect(session.authenticated()).toBe(true);
    expect(session.principal()).toEqual({ id: '42', roles: [UserRole.Operator] });
    expect(session.roles()).toEqual([UserRole.Operator]);
    expect(session.csrf()).toBe('csrf');
    session.clear();
    expect(session.principal()).toBeNull();
    expect(session.roles()).toEqual([]);
    expect(session.csrf()).toBe('');
  });
  it('cannot commit unknown-only roles or absent CSRF', () => {
    const session = new UserSession();
    expect(() => session.commit({ id: '42', roles: [UserRole.Unknown] }, 'csrf')).toThrow();
    expect(() => session.commit({ id: '42', roles: [UserRole.Operator] }, '')).toThrow();
    expect(session.authenticated()).toBe(false);
  });
  it('does not share state with a new instance', () => {
    const session = new UserSession();
    session.markAuthenticated();
    expect(session.authenticated()).toBe(true);

    const other = new UserSession();
    expect(other.authenticated()).toBe(false);
  });
});
