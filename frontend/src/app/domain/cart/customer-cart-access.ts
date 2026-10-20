import { AccessContext } from '../access/access-context';
import { AccessState, AccessStateKind } from '../access/session-probe';

/** One closed authority policy shared by the cart effects and their controls. */
export class CustomerCartAccess {
  private constructor(readonly canMutate: boolean, readonly requiresSelection: boolean, readonly label: string) {}
  static readonly Ready = new CustomerCartAccess(true, false, '');
  static readonly SelectCustomer = new CustomerCartAccess(false, true, 'Seleccioná el contexto cliente para comprar.');
  static readonly SignIn = new CustomerCartAccess(false, false, 'Entrá como cliente para comprar.');
  static readonly Unknown = new CustomerCartAccess(false, false, 'No se pudo comprobar el acceso de cliente.');

  static resolve(state: AccessState, actor: string | null): CustomerCartAccess {
    if (state.kind === AccessStateKind.Indeterminate) return CustomerCartAccess.Unknown;
    if (!actor || !state.permits(AccessContext.Customer)) return CustomerCartAccess.SignIn;
    return state.activeContext === AccessContext.Customer ? CustomerCartAccess.Ready : CustomerCartAccess.SelectCustomer;
  }
}
