import { UserRole } from '../../domain/user/user-role';
import { UserAction } from '../../domain/user/user-action';

describe('UserAction', () => {
  it('translates action paths once and unknown actions grant no permissions', () => {
    for (const action of UserAction.forRoles([UserRole.Admin])) expect(UserAction.fromWire(action.path)).toBe(action);
    expect(UserAction.fromWire('future')).toBe(UserAction.Unknown);
    expect(UserAction.Unknown.permits([UserRole.Admin])).toBe(false);
  });
  it('never grants unknown roles operational actions', () => { expect(UserAction.forRoles([UserRole.Unknown])).toEqual([]); });
  it('hides administrator actions from an operator', () => {
    const actions = UserAction.forRoles([UserRole.Operator]);
    expect(actions).toContain(UserAction.Orders);
    expect(actions).toContain(UserAction.Catalog);
    expect(actions).toContain(UserAction.Offers);
    expect(actions).not.toContain(UserAction.Promos);
    expect(actions).not.toContain(UserAction.Capabilities);
    expect(actions).not.toContain(UserAction.ProfileImport);
  });
  it('recomputes role loss and grants all known actions to an admin', () => {
    expect(UserAction.forRoles([UserRole.Admin])).toContain(UserAction.ProfileImport);
    expect(UserAction.forRoles([UserRole.Admin])).toContain(UserAction.Offers);
    expect(UserAction.forRoles([])).toEqual([]);
  });
});
