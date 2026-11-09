export class CustomerAccountState {
  private constructor(readonly wire: string, readonly label: string, readonly permitsLogin: boolean) {}
  static readonly Active = new CustomerAccountState('ACTIVE', 'Activa', true);
  static readonly Suspended = new CustomerAccountState('SUSPENDED', 'Suspendida', false);
  static readonly Unknown = new CustomerAccountState('UNKNOWN', 'Estado no disponible', false);
  static readonly filterable = [CustomerAccountState.Active, CustomerAccountState.Suspended] as const;
  static fromWire(raw: unknown): CustomerAccountState { return this.filterable.find((state) => state.wire === raw) ?? this.Unknown; }
}

export class CustomerStateTransition {
  private constructor(readonly wire: string, readonly label: string, readonly target: CustomerAccountState) {}
  static readonly Suspend = new CustomerStateTransition('SUSPEND', 'Suspender cuenta', CustomerAccountState.Suspended);
  static readonly Reactivate = new CustomerStateTransition('REACTIVATE', 'Reactivar cuenta', CustomerAccountState.Active);
  static readonly Unknown = new CustomerStateTransition('UNKNOWN', 'Acción no disponible', CustomerAccountState.Unknown);
  static fromWire(raw: unknown): CustomerStateTransition {
    return [this.Suspend, this.Reactivate].find((transition) => transition.wire === raw) ?? this.Unknown;
  }
  static for(state: CustomerAccountState): CustomerStateTransition {
    if (state === CustomerAccountState.Active) return this.Suspend;
    if (state === CustomerAccountState.Suspended) return this.Reactivate;
    return this.Unknown;
  }
}

export interface AdminCustomer {
  readonly id: number; readonly firstName: string; readonly lastName: string; readonly email: string;
  readonly phone: string | null; readonly state: CustomerAccountState; readonly createdAt: string;
  readonly orderCount: number; readonly lastOrderAt: string | null;
}

export interface CustomerPage { readonly items: readonly AdminCustomer[]; readonly page: number; readonly pageSize: number; readonly total: number; }
export interface CustomerQuery { readonly query: string; readonly state: CustomerAccountState | null; readonly page: number; }
