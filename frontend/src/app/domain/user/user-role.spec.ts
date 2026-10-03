import { UserRole } from './user-role';

describe('UserRole', () => {
  it('decodes only the exact registered wires', () => {
    expect(UserRole.fromWire('ADMIN')).toBe(UserRole.Admin);
    expect(UserRole.fromWire('OPERATOR')).toBe(UserRole.Operator);
    for (const value of [null, undefined, '', 'admin', ' ADMIN ', 'CUSTOMER', 'SUPER_ADMIN', 1, { toString: () => 'ADMIN' }]) {
      expect(UserRole.fromWire(value)).toBe(UserRole.Unknown);
    }
  });

  it('gives unknown roles a fixed safe label and no internal identity', () => {
    expect(UserRole.Unknown.label).toBe('Rol no reconocido');
    expect(UserRole.Unknown.wire).toBe('');
    expect(UserRole.hasKnownRole([])).toBe(false);
    expect(UserRole.hasKnownRole([UserRole.Unknown])).toBe(false);
    expect(UserRole.hasKnownRole([UserRole.Unknown, UserRole.Operator])).toBe(true);
  });

});
