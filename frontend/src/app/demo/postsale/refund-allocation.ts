/** Allocates the immutable paid line total in integer cents; shipping is intentionally excluded. */
export class DemoRefundAllocation {
  amount(lineTotal: number, bought: number, prior: number, quantity: number): number {
    if (![lineTotal, bought, prior, quantity].every(Number.isSafeInteger) || lineTotal < 0 || bought < 1 || prior < 0 || quantity < 1 || prior + quantity > bought) throw new Error('No se puede calcular el reintegro para esas unidades.');
    const base = Math.floor(lineTotal / bought);
    const residue = lineTotal % bought;
    return base * quantity + Math.max(0, Math.min(prior + quantity, residue) - Math.min(prior, residue));
  }
}
