import type { ProductPrice, ProductVariant } from './product-detail.entity';

/** Exact ARS input validation; no rounding and no coercion of empty values. */
export function isArsAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 999999999999.99
    && /^\d+(?:\.\d{1,2})?$/.test(String(value));
}

/** Translate a form lexeme only after validating its exact decimal shape. */
export function parseArsAmountInput(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const amount = Number(raw);
  return isArsAmount(amount) ? amount : null;
}

export class VariantPricePolicy {
  private constructor(readonly wire: string, readonly label: string, readonly isOverride: boolean, readonly known: boolean) {}
  static readonly Inherited = new VariantPricePolicy('INHERITED', 'Heredado del producto', false, true);
  static readonly Override = new VariantPricePolicy('OVERRIDE', 'Precio propio', true, true);
  static readonly Unknown = new VariantPricePolicy('UNKNOWN', 'Política no informada', false, false);
  static fromWire(raw: unknown): VariantPricePolicy {
    return [this.Inherited, this.Override].find(value => value.wire === raw) ?? this.Unknown;
  }
}
export class VariantPriceCommand {
  private constructor(readonly wire: string, readonly label: string, readonly requiresBase: boolean, readonly known: boolean) {}
  static readonly Preserve = new VariantPriceCommand('PRESERVE', 'Conservar precio actual', false, true);
  static readonly Inherit = new VariantPriceCommand('INHERIT', 'Heredar del producto', false, true);
  static readonly Override = new VariantPriceCommand('OVERRIDE', 'Precio propio', true, true);
  static readonly Unknown = new VariantPriceCommand('UNKNOWN', 'Cambio no reconocido', false, false);
  static readonly selectable = [this.Preserve, this.Inherit, this.Override];
  static fromWire(raw: unknown): VariantPriceCommand {
    return this.selectable.find(value => value.wire === raw) ?? this.Unknown;
  }
  toWire(base: unknown): { mode: string; base?: number } {
    if (!this.known || this.requiresBase && !isArsAmount(base)) throw new Error('Precio propio no informado o inválido.');
    return this.requiresBase ? { mode: this.wire, base: base as number } : { mode: this.wire };
  }
}
export class SkuPriceResolution {
  private constructor(readonly known: boolean, readonly price: ProductPrice | null) {}
  static readonly Unknown = new SkuPriceResolution(false, null);
  static fromWire(raw: unknown): SkuPriceResolution {
    const row = record(raw), price = record(row['price']), offer = record(price['offer']);
    if (row['state'] !== 'KNOWN' || !isArsAmount(price['base']) || !isArsAmount(price['original']) || !isArsAmount(price['effective'])
      || price['original'] !== price['base'] || price['effective'] > price['base']) return this.Unknown;
    if (price['offer'] != null && (typeof offer['id'] !== 'string' || !offer['id'].trim() || typeof offer['name'] !== 'string' || !offer['name'].trim())) return this.Unknown;
    if (price['offer'] == null && price['effective'] !== price['base']) return this.Unknown;
    return new SkuPriceResolution(true, { base: price['base'], original: price['original'], effective: price['effective'],
      offer: price['offer'] == null ? null : { id: offer['id'] as string, name: offer['name'] as string } });
  }
}
function record(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
export class CatalogPriceKind {
  private constructor(readonly label: string) {}
  static readonly Exact = new CatalogPriceKind('');
  static readonly From = new CatalogPriceKind('Desde');
  static readonly Unknown = new CatalogPriceKind('Precio no disponible');
}
export class CatalogPricePresentation {
  private constructor(readonly kind: CatalogPriceKind, readonly sku: string | null, readonly quote: ProductPrice | null) {}
  static readonly Unknown = new CatalogPricePresentation(CatalogPriceKind.Unknown, null, null);
  get known(): boolean { return this.quote !== null; }
  get label(): string { return this.kind.label; }
  get original(): number | null { return this.quote?.offer && this.quote.original > this.quote.effective ? this.quote.original : null; }
  static fromVariants(variants: readonly ProductVariant[]): CatalogPricePresentation {
    const active = variants.filter(value => value.status.isPublic);
    if (!active.length || active.some(value => !value.price?.known || !value.pricePolicy?.known || !value.sku)) return this.Unknown;
    const ordered = [...active].sort((a, b) => a.price.price!.effective - b.price.price!.effective || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
    const first = ordered[0], quote = first.price.price!;
    const signature = (value: ProductPrice) => JSON.stringify([value.effective, value.original, value.offer?.id ?? null, value.offer?.name ?? null]);
    const exact = active.every(value => signature(value.price.price!) === signature(quote));
    return new CatalogPricePresentation(exact ? CatalogPriceKind.Exact : CatalogPriceKind.From, first.sku, quote);
  }
}
