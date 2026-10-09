/** Variant identity and attributes are open data, never an enum of presentations. */
export interface DemoMedia { id: string; src: string; alt: string; }
export class DemoCurrency {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly ARS = new DemoCurrency('ARS', 'Pesos argentinos');
  static readonly Unknown = new DemoCurrency('', 'Moneda desconocida');
  static fromWire(raw: unknown): DemoCurrency { return raw === this.ARS.wire ? this.ARS : this.Unknown; }
}
export interface DemoSellableVariant {
  id: string; name: string; attributes: { name: string; value: string }[];
  price: number; onHand: number; reserved: number; active: boolean; images: DemoMedia[];
}
export const DEMO_MEDIA = Array.from({ length: 12 }, (_, index) => `/assets/demo/DEMO-${String(index + 1).padStart(3, '0')}.svg`);
export function validateMedia(images: DemoMedia[]): void {
  if (!Array.isArray(images) || images.some(image => !image || typeof image.id !== 'string' || !image.id || !DEMO_MEDIA.includes(image.src) || typeof image.alt !== 'string' || !image.alt.trim()) || new Set(images.map(image => image.id)).size !== images.length) throw new Error('Elegí imágenes locales y completá su texto alternativo.');
}
export function validateVariants(variants: DemoSellableVariant[]): void {
  if (!Array.isArray(variants) || variants.length < 1 || variants.some(variant => !variant || typeof variant.id !== 'string' || !variant.id || typeof variant.name !== 'string' || !variant.name.trim() || typeof variant.active !== 'boolean' || !Number.isSafeInteger(variant.price) || variant.price <= 0 || !Number.isSafeInteger(variant.onHand) || !Number.isSafeInteger(variant.reserved) || variant.reserved < 0 || variant.onHand < variant.reserved || !Array.isArray(variant.attributes) || variant.attributes.some(attribute => !attribute || typeof attribute.name !== 'string' || typeof attribute.value !== 'string' || !attribute.name.trim() || !attribute.value.trim()) || new Set(variant.attributes.map(attribute => attribute.name.trim().toLowerCase())).size !== variant.attributes.length) || new Set(variants.map(variant => variant.id)).size !== variants.length || new Set(variants.map(variant => variant.name.trim().toLowerCase())).size !== variants.length) throw new Error('Cada variante necesita identidad y nombre únicos, atributos sin duplicar, precio y stock entero válido.');
  variants.forEach(variant => validateMedia(variant.images));
}
