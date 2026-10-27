/** Exact integer-money arithmetic for the demo checkout boundary. */
export class DemoMoney {
  static multiply(unit: number, quantity: number): number {
    const result = unit * quantity;
    if (!Number.isSafeInteger(unit) || !Number.isSafeInteger(quantity) || !Number.isSafeInteger(result)) {
      throw new Error('El importe del pedido excede el rango monetario admitido.');
    }
    return result;
  }

  static add(left: number, right: number): number {
    const result = left + right;
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || !Number.isSafeInteger(result)) {
      throw new Error('El total del pedido excede el rango monetario admitido.');
    }
    return result;
  }
}
