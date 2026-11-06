import type { DemoContentBlock } from '../demo-model';
import { ContentBannerTheme, ContentBannerDestination, ContentMerchandisingCodec, type ContentBanner } from './content-merchandising';

export class ContentDraftIssue {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly None = new ContentDraftIssue('none', '');
  static readonly Title = new ContentDraftIssue('title', 'Completá el título principal.');
  static readonly Block = new ContentDraftIssue('block', 'Cada bloque requiere un identificador único, título y texto.');
  static readonly BlockTitle = new ContentDraftIssue('block-title', 'Completá el título de este bloque.');
  static readonly BlockBody = new ContentDraftIssue('block-body', 'Completá el texto de este bloque.');
  static readonly Banner = new ContentDraftIssue('banner', 'Usá hasta tres banners con título, descripción, diseño y destino válidos.');
  static readonly Categories = new ContentDraftIssue('categories', 'Elegí hasta doce categorías sin repetir.');
  static readonly Unknown = new ContentDraftIssue('', 'El borrador guardado no es válido.');
  static readonly all = [this.None, this.Title, this.Block, this.BlockTitle, this.BlockBody, this.Banner, this.Categories] as const;
  static fromWire(raw: unknown): ContentDraftIssue { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export interface ContentDraftData { title: string; subtitle: string; blocks: DemoContentBlock[]; banners?: ContentBanner[]; categories?: string[]; }

/** Copies are never shared between Home, the saved draft and the editor buffer. */
export class ContentDraft {
  static seed(value: ContentDraftData, categories: readonly string[]): ContentDraftData {
    return { ...this.clone(value), banners: [{ id: 'workshop-selection', title: 'Equipá tu próximo proyecto', body: 'Descubrí herramientas y equipamiento para trabajar con confianza.', theme: ContentBannerTheme.Workshop, destination: ContentBannerDestination.Catalog }], categories: [...new Set(categories)].slice(0, 12) };
  }
  static clone(value: ContentDraftData): ContentDraftData { return { title: value.title, subtitle: value.subtitle, blocks: value.blocks.map(block => ({ ...block })), banners: (value.banners ?? []).map(banner => ({ ...banner })), ...(value.categories === undefined ? {} : { categories: [...value.categories] }) }; }
  static empty(): ContentDraftData { return { title: '', subtitle: '', blocks: [], banners: [], categories: [] }; }
  static issue(value: ContentDraftData): ContentDraftIssue {
    if (!value.title.trim()) return ContentDraftIssue.Title;
    if (new Set(value.blocks.map(block => block.id)).size !== value.blocks.length || value.blocks.some(block => !block.id.trim())) return ContentDraftIssue.Block;
    if (value.blocks.some(block => !block.title.trim())) return ContentDraftIssue.BlockTitle;
    if (value.blocks.some(block => !block.body.trim())) return ContentDraftIssue.BlockBody;
    const banners = value.banners ?? [], categories = value.categories ?? [];
    if (banners.length > 3 || new Set(banners.map(banner => banner.id)).size !== banners.length || banners.some(banner => !banner.id.trim() || !banner.title.trim() || banner.title.length > 100 || !banner.body.trim() || banner.body.length > 240 || banner.theme === ContentBannerTheme.Unknown || banner.destination === ContentBannerDestination.Unknown)) return ContentDraftIssue.Banner;
    if (categories.length > 12 || new Set(categories).size !== categories.length || categories.some(category => !category.trim() || category.length > 120)) return ContentDraftIssue.Categories;
    return ContentDraftIssue.None;
  }
  static same(left: ContentDraftData, right: ContentDraftData): boolean { return JSON.stringify(this.clone(left)) === JSON.stringify(this.clone(right)); }
  static reorder(value: ContentDraftData, index: number, delta: number): ContentDraftData {
    const result = this.clone(value), target = index + delta;
    if (Number.isInteger(index) && Number.isInteger(delta) && index >= 0 && index < result.blocks.length && target >= 0 && target < result.blocks.length) [result.blocks[index], result.blocks[target]] = [result.blocks[target], result.blocks[index]];
    return result;
  }
  /** Sole persisted draft translator. Invalid free-text structures reject the snapshot. */
  static fromWire(raw: unknown): ContentDraftData {
    const invalid = (): never => { throw new Error(ContentDraftIssue.Unknown.label); };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
    const value = raw as Record<string, unknown>;
    if (Object.keys(value).some(key => !['title', 'subtitle', 'blocks', 'banners', 'categories'].includes(key)) || typeof value['title'] !== 'string' || typeof value['subtitle'] !== 'string' || !Array.isArray(value['blocks'])) return invalid();
    if (value['blocks'].some(block => !block || typeof block !== 'object' || Array.isArray(block) || Object.keys(block).some(key => !['id', 'title', 'body'].includes(key)) || typeof block.id !== 'string' || typeof block.title !== 'string' || typeof block.body !== 'string')) return invalid();
    let banners: ContentBanner[], categories: string[];
    try { banners = ContentMerchandisingCodec.banners(value['banners']); categories = ContentMerchandisingCodec.categories(value['categories']); } catch { return invalid(); }
    const draft: ContentDraftData = { title: value['title'], subtitle: value['subtitle'], blocks: value['blocks'], banners, ...(value['categories'] === undefined ? {} : { categories }) };
    if (this.issue(draft) !== ContentDraftIssue.None) return invalid();
    return this.clone(draft);
  }
}
