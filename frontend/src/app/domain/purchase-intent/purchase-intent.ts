export class PurchaseIntentKind {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly AddCartLine = new PurchaseIntentKind('ADD_CART_LINE', 'Agregar al carrito');
  static readonly None = new PurchaseIntentKind('NONE', 'Sin selección');
  static readonly Unknown = new PurchaseIntentKind('UNKNOWN', 'Selección no reconocida');
  static fromWire(raw: unknown): PurchaseIntentKind { return [this.AddCartLine, this.None].find(value => value.wire === raw) ?? this.Unknown; }
}

export class PurchaseIntentStage {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Captured = new PurchaseIntentStage('CAPTURED', 'Selección guardada');
  static readonly AwaitingCustomer = new PurchaseIntentStage('AWAITING_CUSTOMER', 'Entrá como cliente para continuar');
  static readonly Restoring = new PurchaseIntentStage('RESTORING', 'Comprobando selección');
  static readonly ReadyForConfirmation = new PurchaseIntentStage('READY', 'Revisá precio y disponibilidad y confirmá para agregar');
  static readonly Unavailable = new PurchaseIntentStage('UNAVAILABLE', 'Corregí o cancelá la selección');
  static readonly Expired = new PurchaseIntentStage('EXPIRED', 'La selección venció. Iniciá otro flujo');
  static readonly Completed = new PurchaseIntentStage('COMPLETED', 'Selección finalizada');
  static readonly Unknown = new PurchaseIntentStage('UNKNOWN', 'No se pudo recuperar la selección');
  static fromWire(raw: unknown): PurchaseIntentStage { return [this.Captured, this.AwaitingCustomer, this.Restoring, this.ReadyForConfirmation, this.Unavailable, this.Expired, this.Completed].find(value => value.wire === raw) ?? this.Unknown; }
}

export class CartLineConfirmationResult {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Idle = new CartLineConfirmationResult('IDLE', 'Pendiente de confirmación');
  static readonly Pending = new CartLineConfirmationResult('PENDING', 'Confirmando selección');
  static readonly Accepted = new CartLineConfirmationResult('ACCEPTED', 'Selección agregada al carrito');
  static readonly Rejected = new CartLineConfirmationResult('REJECTED', 'No se pudo aplicar la selección');
  static readonly OutcomeUnknown = new CartLineConfirmationResult('OUTCOME_UNKNOWN', 'No se pudo determinar el resultado. Revisá el carrito antes de confirmar nuevamente');
  static readonly Unknown = new CartLineConfirmationResult('UNKNOWN', 'Resultado no reconocido');
  static fromWire(raw: unknown): CartLineConfirmationResult { return [this.Idle, this.Pending, this.Accepted, this.Rejected, this.OutcomeUnknown].find(value => value.wire === raw) ?? this.Unknown; }
}

export class RestoredPurchaseAvailability {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Ready = new RestoredPurchaseAvailability('READY', 'Selección disponible');
  static readonly ProductUnavailable = new RestoredPurchaseAvailability('PRODUCT_UNAVAILABLE', 'Producto no disponible');
  static readonly VariantUnavailable = new RestoredPurchaseAvailability('VARIANT_UNAVAILABLE', 'Variante no disponible');
  static readonly QuantityUnavailable = new RestoredPurchaseAvailability('QUANTITY_UNAVAILABLE', 'Cantidad no disponible');
  static readonly Unknown = new RestoredPurchaseAvailability('UNKNOWN', 'Disponibilidad no comprobada');
  static fromWire(raw: unknown): RestoredPurchaseAvailability { return [this.Ready, this.ProductUnavailable, this.VariantUnavailable, this.QuantityUnavailable].find(value => value.wire === raw) ?? this.Unknown; }
}

export const PURCHASE_INTENT_TTL_MS = 15 * 60 * 1000;
export function validPurchaseFlowId(raw: unknown): raw is string { return typeof raw === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(raw); }
function validSku(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 128 && raw.trim() === raw;
}

/** The single wire translator rejects additional fields, including authority and commercial snapshots. */
export class PurchaseIntent {
  private constructor(readonly kind: PurchaseIntentKind, readonly flowId: string, readonly productSku: string,
    readonly variantSku: string, readonly quantity: number, readonly issuedAt: number, readonly expiresAt: number) { Object.freeze(this); }
  static readonly Unknown = new PurchaseIntent(PurchaseIntentKind.Unknown, '', '', '', 0, 0, 0);
  static capture(flowId: string, productSku: string, variantSku: string, quantity: number, now: number): PurchaseIntent {
    return this.fromWire({ version: 1, flowId, kind: PurchaseIntentKind.AddCartLine.wire, productSku, variantSku, quantity, issuedAt: now, expiresAt: now + PURCHASE_INTENT_TTL_MS }, now);
  }
  static fromWire(raw: unknown, now: number): PurchaseIntent {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return this.Unknown;
    const row = raw as Record<string, unknown>;
    const keys = ['version', 'flowId', 'kind', 'productSku', 'variantSku', 'quantity', 'issuedAt', 'expiresAt'];
    if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))
      || row['version'] !== 1 || PurchaseIntentKind.fromWire(row['kind']) !== PurchaseIntentKind.AddCartLine
      || !validPurchaseFlowId(row['flowId']) || !validSku(row['productSku']) || !validSku(row['variantSku'])
      || typeof row['quantity'] !== 'number' || !Number.isSafeInteger(row['quantity']) || row['quantity'] < 1 || row['quantity'] > 999
      || typeof row['issuedAt'] !== 'number' || !Number.isSafeInteger(row['issuedAt']) || row['issuedAt'] < 0
      || typeof row['expiresAt'] !== 'number' || !Number.isSafeInteger(row['expiresAt'])
      || row['expiresAt'] - row['issuedAt'] !== PURCHASE_INTENT_TTL_MS || row['issuedAt'] > now || row['expiresAt'] <= now) return this.Unknown;
    return new PurchaseIntent(PurchaseIntentKind.AddCartLine, row['flowId'], row['productSku'], row['variantSku'], row['quantity'], row['issuedAt'], row['expiresAt']);
  }
  toWire(): Readonly<Record<string, unknown>> {
    return { version: 1, flowId: this.flowId, kind: this.kind.wire, productSku: this.productSku, variantSku: this.variantSku, quantity: this.quantity, issuedAt: this.issuedAt, expiresAt: this.expiresAt };
  }
  get isKnown(): boolean { return this.kind === PurchaseIntentKind.AddCartLine; }
  expired(now: number): boolean { return this.expiresAt <= now; }
  revise(variantSku: string, quantity: number, now: number): PurchaseIntent { return PurchaseIntent.fromWire({ ...this.toWire(), variantSku, quantity }, now); }
}
