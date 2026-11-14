export class ApiErrorCode {
  static readonly DeliveryConfigurationChanged = new ApiErrorCode('DELIVERY_CONFIGURATION_CHANGED', 'Cambió la opción de entrega. Actualizá las opciones y confirmá tu elección nuevamente.');
  static readonly DeliveryUnavailable = new ApiErrorCode('DELIVERY_UNAVAILABLE', 'La entrega no está disponible. Actualizá las opciones para continuar.');
  static readonly DeliverySelectionInvalid = new ApiErrorCode('DELIVERY_SELECTION_INVALID', 'Revisá la modalidad de entrega y su dirección.');
  static readonly CheckoutTotalInvalid = new ApiErrorCode('CHECKOUT_TOTAL_INVALID', 'El total no puede procesarse. Revisá el carrito.');
  static readonly CheckoutContextChanged = new ApiErrorCode('CHECKOUT_CONTEXT_CHANGED', 'El carrito o la dirección cambiaron. Revisá y confirmá la compra nuevamente.');
  get requiresDeliveryCorrection(): boolean { return [ApiErrorCode.DeliveryConfigurationChanged, ApiErrorCode.DeliveryUnavailable, ApiErrorCode.DeliverySelectionInvalid, ApiErrorCode.CheckoutTotalInvalid, ApiErrorCode.CheckoutContextChanged].includes(this); }
  static readonly CsrfInvalid = new ApiErrorCode('CSRF_INVALID', 'La clave de seguridad venció. Reintentá la acción.');
  static readonly ProductNotSellable = new ApiErrorCode(
    'PRODUCT_NOT_SELLABLE',
    'Hay productos que ya no están disponibles. Volvé al carrito y quitá esos artículos antes de pagar.',
  );
  static readonly UnsupportedCurrency = new ApiErrorCode(
    'UNSUPPORTED_CURRENCY',
    'La moneda de esta instalación no está disponible. Actualizá el carrito antes de continuar.',
  );
  static readonly Unknown = new ApiErrorCode('UNKNOWN', '');

  private constructor(
    readonly wire: string,
    readonly label: string,
  ) {}

  static fromWire(value: unknown): ApiErrorCode {
    const delivery = [this.DeliveryConfigurationChanged, this.DeliveryUnavailable, this.DeliverySelectionInvalid, this.CheckoutTotalInvalid, this.CheckoutContextChanged].find(code => code.wire === value);
    if (delivery) return delivery;
    if (value === ApiErrorCode.CsrfInvalid.wire) return ApiErrorCode.CsrfInvalid;
    if (value === ApiErrorCode.ProductNotSellable.wire) return ApiErrorCode.ProductNotSellable;
    if (value === ApiErrorCode.UnsupportedCurrency.wire) return ApiErrorCode.UnsupportedCurrency;
    return ApiErrorCode.Unknown;
  }
}
