import { UserRole } from '../../domain/user/user-role';
import { UserAction } from './user-action';

describe('UserAction', () => {
  it('never grants unknown roles operational actions', () => { expect(UserAction.forRoles([UserRole.Unknown])).toEqual([]); });
  it('makes personal account available to every known USER role', () => {
    for (const role of [UserRole.Admin, UserRole.Operator]) expect(UserAction.forRoles([role])).toContain(UserAction.Account);
    expect(UserAction.forRoles([UserRole.Unknown])).not.toContain(UserAction.Account);
  });
  it('hides administrator actions from an operator', () => {
    const actions = UserAction.forRoles([UserRole.Operator]);
    expect(actions).toContain(UserAction.Orders);
    expect(actions).toContain(UserAction.Catalog);
    expect(actions).not.toContain(UserAction.Promos);
    expect(actions).not.toContain(UserAction.Content);
    expect(actions).not.toContain(UserAction.MercadoLibre);
    expect(actions).toContain(UserAction.Capabilities);
    expect(actions).not.toContain(UserAction.ProfileImport);
  });
  it('recomputes role loss and grants all known actions to an admin', () => {
    expect(UserAction.forRoles([UserRole.Admin])).toContain(UserAction.ProfileImport);
    expect(UserAction.forRoles([UserRole.Admin])).toContain(UserAction.Content);
    expect(UserAction.forRoles([UserRole.Admin])).toContain(UserAction.MercadoLibre);
    expect(UserAction.forRoles([])).toEqual([]);
  });
});
