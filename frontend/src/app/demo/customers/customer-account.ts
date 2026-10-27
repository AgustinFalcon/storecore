import { UserRole } from '../../domain/user/user-role';

export class CustomerAccountState {
  private constructor(readonly wire: string, readonly label: string, readonly permitsAccess: boolean) {}
  static readonly Active = new CustomerAccountState('ACTIVE', 'Activa', true);
  static readonly Restricted = new CustomerAccountState('RESTRICTED', 'Restringida', false);
  static readonly Unknown = new CustomerAccountState('', 'Estado desconocido', false);
  static readonly all = [this.Active, this.Restricted];
  static fromWire(raw: unknown): CustomerAccountState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CustomerAccountFilter {
  private constructor(readonly wire: string, readonly label: string, private readonly state?: CustomerAccountState) {}
  static readonly All = new CustomerAccountFilter('all', 'Todas las cuentas');
  static readonly Active = new CustomerAccountFilter('active', 'Activas', CustomerAccountState.Active);
  static readonly Restricted = new CustomerAccountFilter('restricted', 'Restringidas', CustomerAccountState.Restricted);
  static readonly Unknown = new CustomerAccountFilter('', 'Filtro desconocido', CustomerAccountState.Unknown);
  static readonly all = [this.All, this.Active, this.Restricted];
  static fromWire(raw: unknown): CustomerAccountFilter { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  matches(state: CustomerAccountState): boolean { return this === CustomerAccountFilter.All || state === this.state; }
}

export class CustomerAccountCommand {
  private constructor(readonly wire: string, readonly label: string, readonly target: CustomerAccountState) {}
  static readonly Restrict = new CustomerAccountCommand('restrict', 'Restringir cuenta', CustomerAccountState.Restricted);
  static readonly Reactivate = new CustomerAccountCommand('reactivate', 'Reactivar cuenta', CustomerAccountState.Active);
  static readonly Unknown = new CustomerAccountCommand('', 'Acción desconocida', CustomerAccountState.Unknown);
  static fromWire(raw: unknown): CustomerAccountCommand { return [this.Restrict, this.Reactivate].find(value => value.wire === raw) ?? this.Unknown; }
  apply(account: CustomerAccountAccess, reason: string): boolean {
    if (this === CustomerAccountCommand.Unknown || account.state === CustomerAccountState.Unknown) throw new Error('Estado o acción no reconocido.');
    if (this === CustomerAccountCommand.Restrict && !reason.trim()) throw new Error('Indicá el motivo de la restricción.');
    if (account.state === this.target) return false;
    if (!Number.isSafeInteger(account.generation + 1)) throw new Error('La generación de acceso no es válida. Revisá los datos Demo.');
    account.state = this.target; account.generation++; account.reason = reason.trim(); return true;
  }
}

export interface CustomerAccountAccess { state: CustomerAccountState; generation: number; reason: string; }
export class CustomerAdministrationAuthority {
  static canRead(role: UserRole): boolean { return role === UserRole.Admin || role === UserRole.Operator; }
  static canWrite(role: UserRole): boolean { return role === UserRole.Admin; }
}

/** Query owns matching and joins; names and email never establish ownership. */
export class CustomerAccountQuery {
  constructor(readonly text: string, readonly filter: CustomerAccountFilter) {}
  matches(customer: { id: string; firstName: string; lastName: string; email: string; access?: CustomerAccountAccess }): boolean {
    const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return this.filter.matches(customer.access?.state ?? CustomerAccountState.Unknown) && normalize(`${customer.id} ${customer.firstName} ${customer.lastName} ${customer.email}`).includes(normalize(this.text.trim()));
  }
  orders<T extends { actor: string }>(id: string, orders: readonly T[]): T[] { return orders.filter(order => order.actor === id); }
}

export function decodeCustomerAccess(raw: unknown, legacy: boolean): CustomerAccountAccess {
  if (legacy && raw === undefined) return { state: CustomerAccountState.Active, generation: 0, reason: '' };
  if (!raw || typeof raw !== 'object') return { state: CustomerAccountState.Unknown, generation: 0, reason: '' };
  const value = raw as { state?: { wire?: unknown }; generation?: unknown; reason?: unknown };
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0 || typeof value.reason !== 'string') return { state: CustomerAccountState.Unknown, generation: 0, reason: '' };
  return { state: CustomerAccountState.fromWire(value.state?.wire), generation: Number(value.generation), reason: value.reason };
}
