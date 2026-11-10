export class ApiErrorCode {
  static readonly CsrfInvalid = new ApiErrorCode('CSRF_INVALID', 'La clave de seguridad venció. Reintentá la acción.');
  static readonly ProductNotSellable = new ApiErrorCode(
    'PRODUCT_NOT_SELLABLE',
    'Hay productos que ya no están disponibles. Volvé al carrito y quitá esos artículos antes de pagar.',
  );
  static readonly Unknown = new ApiErrorCode('UNKNOWN', '');

  private constructor(
    readonly wire: string,
    readonly label: string,
  ) {}

  static fromWire(value: unknown): ApiErrorCode {
    if (value === ApiErrorCode.CsrfInvalid.wire) return ApiErrorCode.CsrfInvalid;
    if (value === ApiErrorCode.ProductNotSellable.wire) return ApiErrorCode.ProductNotSellable;
    return ApiErrorCode.Unknown;
  }
}
