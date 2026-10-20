import type { DemoActor } from './demo-model';
import { DemoRole } from './demo-roles';

/** Customer selection is an exact validated identity, separate from free-text search. */
export class DemoCustomerOrderFilter {
  private constructor(readonly customerId: string | null, readonly label: string, readonly matches: (order: { readonly actor: string }) => boolean) {}
  static readonly All = new DemoCustomerOrderFilter(null, 'Todos los clientes', () => true);
  static readonly Unknown = new DemoCustomerOrderFilter(null, 'Cliente desconocido', () => false);
  static fromWire(raw: unknown, actors: readonly Pick<DemoActor, 'id' | 'role' | 'firstName' | 'lastName'>[]): DemoCustomerOrderFilter {
    if (raw === null || raw === undefined) return this.All;
    if (typeof raw !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(raw)) return this.Unknown;
    const customer = actors.find(actor => actor.id === raw && actor.role === DemoRole.Customer);
    return customer ? new DemoCustomerOrderFilter(customer.id, `Pedidos de ${customer.firstName} ${customer.lastName}`, order => order.actor === customer.id) : this.Unknown;
  }
}
