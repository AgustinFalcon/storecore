/** Curated visual choices and destinations: persisted content cannot inject CSS or links. */
export class ContentBannerTheme {
  private constructor(readonly wire: string, readonly label: string, readonly cssClass: string, readonly symbol: string) {}
  static readonly Workshop = new ContentBannerTheme('workshop', 'Taller · azul', 'banner-workshop', '⌁');
  static readonly Safety = new ContentBannerTheme('safety', 'Seguridad · verde', 'banner-safety', '◈');
  static readonly Organization = new ContentBannerTheme('organization', 'Organización · dorado', 'banner-organization', '▦');
  static readonly Unknown = new ContentBannerTheme('', 'Diseño no reconocido', '', '');
  static readonly all = [this.Workshop, this.Safety, this.Organization] as const;
  static fromWire(raw: unknown): ContentBannerTheme { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ContentBannerDestination {
  private constructor(readonly wire: string, readonly label: string, readonly path: string) {}
  static readonly Catalog = new ContentBannerDestination('catalog', 'Ver catálogo', '/demo/catalog');
  static readonly Offers = new ContentBannerDestination('offers', 'Ver ofertas', '/demo/offers');
  static readonly Unknown = new ContentBannerDestination('', 'Destino no reconocido', '');
  static readonly all = [this.Catalog, this.Offers] as const;
  static fromWire(raw: unknown): ContentBannerDestination { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export interface ContentBanner { id: string; title: string; body: string; theme: ContentBannerTheme; destination: ContentBannerDestination; }

export class MerchandisingItemKind {
  private constructor(readonly wire: string, readonly editorSelector: string, readonly datasetKey: string, readonly ctaSegment: string, readonly ownerRemovalFocusSelector: string, readonly emptyRemovalFocusSelector: string) {}
  static readonly Banner = new MerchandisingItemKind('banner', '[data-banner-editor]', 'bannerEditor', 'banner', 'input', '[data-cta="content-banner-add"]');
  static readonly Category = new MerchandisingItemKind('category', '[data-category-editor]', 'categoryEditor', 'category', '[data-cta="content-category-remove"]', '#content-categories-heading');
  static readonly Unknown = new MerchandisingItemKind('', '', '', '', '', '');
  static readonly all = [this.Banner, this.Category] as const;
  static fromWire(raw: unknown): MerchandisingItemKind { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

/** One translator for the optional merchandising extension of historical drafts. */
export class ContentMerchandisingCodec {
  static banners(raw: unknown): ContentBanner[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 3) throw Error('Banners inválidos.');
    return raw.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['id', 'title', 'body', 'theme', 'destination'].includes(key)) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.body !== 'string') throw Error('Banner inválido.');
      return { id: value.id, title: value.title, body: value.body, theme: ContentBannerTheme.fromWire(value.theme?.wire), destination: ContentBannerDestination.fromWire(value.destination?.wire) };
    });
  }
  static categories(raw: unknown): string[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 12 || raw.some(value => typeof value !== 'string' || !value.trim() || value.length > 120) || new Set(raw).size !== raw.length) throw Error('Categorías inválidas.');
    return [...raw];
  }
}

export class MoveContentItemStep {
  execute<T>(items: readonly T[], index: number, delta: number): T[] {
    const result = [...items], target = index + delta;
    if (Number.isInteger(index) && Number.isInteger(delta) && index >= 0 && index < result.length && target >= 0 && target < result.length) [result[index], result[target]] = [result[target], result[index]];
    return result;
  }
}

export class AddContentItemStep {
  execute<T>(items: readonly T[], item: T, maximum: number): T[] {
    return items.length >= maximum ? [...items] : [...items, item];
  }
}

export class RemoveContentItemStep {
  execute<T>(items: readonly T[], index: number): T[] {
    return Number.isInteger(index) && index >= 0 && index < items.length ? items.filter((_, position) => position !== index) : [...items];
  }
}

export class SelectContentCategoryStep {
  execute(selected: readonly string[], category: string, enabled: boolean, selectable: boolean): string[] {
    if (enabled && !selectable) return [...selected];
    return enabled ? [...new Set([...selected, category])] : selected.filter(value => value !== category);
  }
}
