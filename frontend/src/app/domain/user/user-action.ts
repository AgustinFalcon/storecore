import { UserRole } from './user-role';

/** Closed navigation actions follow the current backend role requirements. */
export class UserAction {
  private constructor(readonly path: string, readonly label: string, private readonly roles: readonly UserRole[]) {}
  static readonly Content = new UserAction('/user/content', 'Contenido', [UserRole.Admin, UserRole.Operator]);
  static readonly Catalog = new UserAction('/user/catalog', 'Catálogo', [UserRole.Admin, UserRole.Operator]);
  static readonly Offers = new UserAction('/user/offers', 'Ofertas', [UserRole.Admin, UserRole.Operator]);
  static readonly Promos = new UserAction('/user/promos', 'Promos', [UserRole.Admin]);
  static readonly Orders = new UserAction('/user/orders', 'Fulfillment', [UserRole.Admin, UserRole.Operator]);
  static readonly Inventory = new UserAction('/user/inventory', 'Inventario', [UserRole.Admin, UserRole.Operator]);
  static readonly MercadoLibre = new UserAction('/user/mercadolibre', 'Mercado Libre', [UserRole.Admin, UserRole.Operator]);
  static readonly Capabilities = new UserAction('/user/capabilities', 'Capabilities', [UserRole.Admin]);
  static readonly ProfileImport = new UserAction('/user/profile-import', 'Importar perfil', [UserRole.Admin]);
  static readonly Unknown = new UserAction('', 'Acción no reconocida', []);
  static fromWire(raw: unknown): UserAction { return ACTION_BY_PATH.get(raw) ?? UserAction.Unknown; }
  permits(roles: readonly UserRole[]): boolean { return this.roles.some((role) => roles.includes(role)); }
  static forRoles(roles: readonly UserRole[]): readonly UserAction[] { return ACTIONS.filter((action) => action.permits(roles)); }
}
const ACTIONS = [UserAction.Content, UserAction.Catalog, UserAction.Offers, UserAction.Promos, UserAction.Orders, UserAction.Inventory, UserAction.MercadoLibre, UserAction.Capabilities, UserAction.ProfileImport];
const ACTION_BY_PATH = new Map<unknown, UserAction>(ACTIONS.map(action => [action.path, action]));
