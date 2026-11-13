export class CartLineMutationOutcome {
  private constructor(readonly label: string) {}

  static readonly Accepted = new CartLineMutationOutcome('La cantidad final quedó guardada en el carrito.');
  static readonly Rejected = new CartLineMutationOutcome('No se pudo aplicar la cantidad solicitada.');
  static readonly OutcomeUnknown = new CartLineMutationOutcome('No pudimos confirmar si el carrito cambió.');
  static readonly Unknown = new CartLineMutationOutcome('Resultado de carrito desconocido.');
}

export interface SetCartLineCommand {
  readonly sku: string;
  readonly quantity: number;
  readonly report?: (outcome: CartLineMutationOutcome) => void;
}
