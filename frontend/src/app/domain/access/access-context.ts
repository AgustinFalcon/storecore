export class AccessContext {
  private constructor(readonly wire: string, readonly label: string, readonly isKnown: boolean) {}
  static readonly Customer = new AccessContext('CUSTOMER', 'Mi cuenta', true);
  static readonly User = new AccessContext('USER', 'Operaciones', true);
  static readonly Unknown = new AccessContext('', 'Acceso no reconocido', false);
  static fromWire(raw: unknown): AccessContext {
    return CONTEXTS.get(raw) ?? AccessContext.Unknown;
  }
}
const CONTEXTS = new Map<unknown, AccessContext>([
  [AccessContext.Customer.wire, AccessContext.Customer], [AccessContext.User.wire, AccessContext.User],
]);
