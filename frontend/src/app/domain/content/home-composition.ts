export class HomeBlockKind {
  static readonly Hero = new HomeBlockKind('HERO', 'Portada', 500);
  static readonly CategoryRail = new HomeBlockKind('CATEGORY_RAIL', 'Categorías', null, 12);
  static readonly ProductRail = new HomeBlockKind('PRODUCT_RAIL', 'Productos', null, 20);
  static readonly PromoBanner = new HomeBlockKind('PROMO_BANNER', 'Banner promocional', 300);
  static readonly Unknown = new HomeBlockKind('UNKNOWN', 'Bloque no compatible', null);
  static readonly editable = [this.Hero, this.CategoryRail, this.ProductRail, this.PromoBanner] as const;
  static fromWire(raw: unknown): HomeBlockKind { return this.editable.find(kind => kind.wire === raw) ?? this.Unknown; }
  private constructor(readonly wire: string, readonly label: string, readonly bodyLimit: number | null, readonly referenceLimit = 0) {}
  get known(): boolean { return this !== HomeBlockKind.Unknown; }
  get referencesCategories(): boolean { return this === HomeBlockKind.CategoryRail; }
  get referencesProducts(): boolean { return this === HomeBlockKind.ProductRail; }
  blankContent(): HomeBlockContent {
    if (this.referencesCategories) return { title: '', categoryIds: [] };
    if (this.referencesProducts) return { title: '', skus: [] };
    return { title: '', body: '' };
  }
  validate(content: HomeBlockContent): boolean {
    if (!this.known || typeof content.title !== 'string' || !content.title.trim() || content.title.length > 120) return false;
    const allowed = this.bodyLimit !== null ? ['title', 'body', 'ctaLabel', 'ctaPath'] : this.referencesCategories ? ['title', 'categoryIds'] : ['title', 'skus'];
    if (Object.keys(content).some(key => !allowed.includes(key))) return false;
    if (this.bodyLimit !== null) {
      return typeof content.body === 'string' && content.body.length <= this.bodyLimit &&
        (content.ctaLabel === undefined || typeof content.ctaLabel === 'string' && content.ctaLabel.length <= 80) &&
        (content.ctaPath === undefined || isInternalRoute(content.ctaPath));
    }
    const refs = this.referencesCategories ? content.categoryIds : content.skus;
    return Array.isArray(refs) && refs.length >= 1 && refs.length <= this.referenceLimit &&
      refs.every(ref => this.referencesCategories ? Number.isSafeInteger(ref) && Number(ref) > 0 : typeof ref === 'string' && !!ref.trim() && ref === ref.trim() && ref.length <= 128) && new Set(refs).size === refs.length;
  }
}

export function isInternalRoute(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2_048 && /^\/(?!\/)/.test(value) && !/[\\\s]/.test(value) && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    !/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value);
}

export interface HomeBlockContent {
  readonly title: string;
  readonly body?: string;
  readonly ctaLabel?: string;
  readonly ctaPath?: string;
  readonly categoryIds?: readonly number[];
  readonly skus?: readonly string[];
}
export interface HomeSection {
  readonly key: string;
  readonly kind: HomeBlockKind;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly content: HomeBlockContent;
  readonly updatedAt: string | null;
}
export interface HomeComposition { readonly revision: number; readonly sections: readonly HomeSection[]; }
export interface ReplaceHomeComposition { readonly expectedRevision: number; readonly sections: readonly HomeSection[]; }
export function validComposition(home: HomeComposition): boolean {
  return Number.isSafeInteger(home.revision) && home.revision >= 0 && new Set(home.sections.map(section => section.key)).size === home.sections.length &&
    home.sections.every(section => typeof section.key === 'string' && !!section.key.trim() && section.key === section.key.trim() && section.key.length <= 80 && typeof section.active === 'boolean' && Number.isSafeInteger(section.sortOrder) && section.sortOrder >= 0 && section.kind.validate(section.content));
}
