import type { DemoCatalogSnapshot, DemoProduct } from './catalog-model';

export class DemoVariantReferenceKind {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Cart = new DemoVariantReferenceKind('CART', 'carritos');
  static readonly Order = new DemoVariantReferenceKind('ORDER', 'pedidos');
  static readonly Reservation = new DemoVariantReferenceKind('RESERVATION', 'reservas de pedidos');
  static readonly Movement = new DemoVariantReferenceKind('MOVEMENT', 'movimientos');
  static readonly Return = new DemoVariantReferenceKind('RETURN', 'devoluciones');
  static readonly Mapping = new DemoVariantReferenceKind('MAPPING', 'vínculos de marketplace');
  static readonly Queue = new DemoVariantReferenceKind('QUEUE', 'cola de marketplace');
  static readonly Competitor = new DemoVariantReferenceKind('COMPETITOR', 'observaciones de competencia');
  static readonly Unknown = new DemoVariantReferenceKind('', 'referencias desconocidas');
  static readonly all = [this.Cart, this.Order, this.Reservation, this.Movement, this.Return, this.Mapping, this.Queue, this.Competitor];
  static fromWire(raw: unknown): DemoVariantReferenceKind { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
interface VariantIdentity { readonly sku: string; readonly variantId: string; }
export interface DemoVariantReferenceSource extends DemoCatalogSnapshot {
  readonly actors?: readonly { readonly cart: readonly VariantIdentity[] }[];
  readonly orders?: readonly { readonly lines: readonly VariantIdentity[]; readonly reservation?: { readonly lines: readonly VariantIdentity[] } }[];
  readonly movements?: readonly VariantIdentity[];
  readonly returns?: readonly { readonly lines: readonly VariantIdentity[] }[];
  readonly marketplace?: {
    readonly mappings: readonly (VariantIdentity & { readonly id: string })[];
    readonly queue: readonly { readonly mappingId: string }[];
  };
  readonly competitors?: readonly { readonly sku?: string; readonly details?: { readonly variantId: string } }[];
}
const key = (sku: string, variantId: string): string => JSON.stringify([sku, variantId]);

/** A pure index of identities, independent of statuses, UI and persistence mechanics. */
export class DemoVariantReferenceIndex {
  private constructor(private readonly entries: ReadonlyMap<string, readonly DemoVariantReferenceKind[]>) {}
  static from(source: DemoVariantReferenceSource): DemoVariantReferenceIndex {
    const entries = new Map<string, DemoVariantReferenceKind[]>();
    const add = (identity: VariantIdentity, kind: DemoVariantReferenceKind): void => {
      if (!identity.sku?.trim() || !identity.variantId?.trim()) throw new Error('La referencia de variante es inválida.');
      const identityKey = key(identity.sku, identity.variantId), kinds = entries.get(identityKey) ?? [];
      if (!kinds.includes(kind)) kinds.push(kind);
      entries.set(identityKey, kinds);
    };
    for (const actor of source.actors ?? []) for (const line of actor.cart) add(line, DemoVariantReferenceKind.Cart);
    for (const order of source.orders ?? []) {
      for (const line of order.lines) add(line, DemoVariantReferenceKind.Order);
      for (const line of order.reservation?.lines ?? []) add(line, DemoVariantReferenceKind.Reservation);
    }
    for (const movement of source.movements ?? []) add(movement, DemoVariantReferenceKind.Movement);
    for (const request of source.returns ?? []) for (const line of request.lines) add(line, DemoVariantReferenceKind.Return);
    const mappings = source.marketplace?.mappings ?? [];
    for (const mapping of mappings) add(mapping, DemoVariantReferenceKind.Mapping);
    for (const entry of source.marketplace?.queue ?? []) {
      const mapping = mappings.find(value => value.id === entry.mappingId);
      if (!mapping) throw new Error('La cola referencia un vínculo inexistente.');
      add(mapping, DemoVariantReferenceKind.Queue);
    }
    for (const competitor of source.competitors ?? []) if (competitor.details) {
      if (!competitor.sku) throw new Error('La observación no identifica un producto.');
      add({ sku: competitor.sku, variantId: competitor.details.variantId }, DemoVariantReferenceKind.Competitor);
    }
    return new DemoVariantReferenceIndex(entries);
  }
  references(sku: string, variantId: string): readonly DemoVariantReferenceKind[] { return [...(this.entries.get(key(sku, variantId)) ?? [])]; }
  requirePreserved(existing: DemoProduct, proposed: DemoProduct): void {
    const retained = new Set(proposed.variants.map(variant => variant.id));
    for (const variant of existing.variants) {
      const references = this.references(existing.sku, variant.id);
      if (!retained.has(variant.id) && references.length) throw new Error(`La variante ${variant.label} está referenciada en ${references.map(kind => kind.label).join(', ')}. Conservá su identidad; no puede eliminarse ni reemplazarse.`);
    }
  }
  validateCatalog(products: readonly DemoProduct[]): void {
    const identities = new Set(products.flatMap(product => product.variants.map(variant => key(product.sku, variant.id))));
    for (const identity of this.entries.keys()) if (!identities.has(identity)) throw new Error('La demo guardada contiene una referencia a una variante inexistente.');
  }
}
