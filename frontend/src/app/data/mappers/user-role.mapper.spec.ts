import { UserRole } from '../../domain/user/user-role';
import { mapUserSession } from './http-mappers';

describe('user role HTTP boundary', () => {
  it('maps roles through the closed boundary without promoting or leaking raw input', () => {
    expect(mapUserSession({ id: 1, roles: ['OPERATOR', 'SUPER_ADMIN', 'ADMIN'] })).toEqual({
      id: '1', roles: [UserRole.Operator, UserRole.Unknown, UserRole.Admin],
    });
    expect(mapUserSession({ roles: ['SUPER_ADMIN'] }).roles).toEqual([UserRole.Unknown]);
    expect(mapUserSession({ roles: 'ADMIN' }).roles).toEqual([]);
    expect(mapUserSession({}).roles).toEqual([]);
  });
});
