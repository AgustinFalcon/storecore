/** Session role is separate from the experience requested by a route. */
export class DemoRole {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Customer = new DemoRole('CUSTOMER', 'Comprador de muestra');
  static readonly Admin = new DemoRole('ADMIN', 'Administrador de muestra');
  static readonly Unknown = new DemoRole('', 'Rol no reconocido');
  static readonly all = [this.Customer, this.Admin];
  static fromWire(raw: unknown): DemoRole { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
