export class CheckoutAttemptState {
  static readonly Idle = new CheckoutAttemptState('IDLE', '', false, false, false);
  static readonly Pending = new CheckoutAttemptState('PENDING', 'Procesando el pago…', true, false, false);
  static readonly Retryable = new CheckoutAttemptState('RETRYABLE', 'Reintentar el mismo pago', false, true, false);
  static readonly ProductUnavailable = new CheckoutAttemptState('PRODUCT_UNAVAILABLE', 'Corregir carrito', false, false, true);
  static readonly Succeeded = new CheckoutAttemptState('SUCCEEDED', 'Pago iniciado', false, false, false);
  static readonly Unknown = new CheckoutAttemptState('UNKNOWN', 'Intento de pago no disponible', false, false, false);

  private constructor(readonly wire: string, readonly label: string, readonly inFlight: boolean, readonly paymentRetry: boolean, readonly requiresCartCorrection: boolean) {}

  static fromWire(value: unknown): CheckoutAttemptState {
    return [this.Idle, this.Pending, this.Retryable, this.ProductUnavailable, this.Succeeded].find((state) => state.wire === value) ?? this.Unknown;
  }
}
