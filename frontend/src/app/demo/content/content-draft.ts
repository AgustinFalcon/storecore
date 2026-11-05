import type { DemoContentBlock } from '../demo-model';

export class ContentDraftIssue {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly None = new ContentDraftIssue('none', '');
  static readonly Title = new ContentDraftIssue('title', 'Completá el título principal.');
  static readonly Block = new ContentDraftIssue('block', 'Cada bloque requiere un identificador único, título y texto.');
  static readonly BlockTitle = new ContentDraftIssue('block-title', 'Completá el título de este bloque.');
  static readonly BlockBody = new ContentDraftIssue('block-body', 'Completá el texto de este bloque.');
  static readonly Unknown = new ContentDraftIssue('', 'El borrador guardado no es válido.');
  static readonly all = [this.None, this.Title, this.Block, this.BlockTitle, this.BlockBody] as const;
  static fromWire(raw: unknown): ContentDraftIssue { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export interface ContentDraftData { title: string; subtitle: string; blocks: DemoContentBlock[]; }

/** Copies are never shared between Home, the saved draft and the editor buffer. */
export class ContentDraft {
  static clone(value: ContentDraftData): ContentDraftData { return { title: value.title, subtitle: value.subtitle, blocks: value.blocks.map(block => ({ ...block })) }; }
  static empty(): ContentDraftData { return { title: '', subtitle: '', blocks: [] }; }
  static issue(value: ContentDraftData): ContentDraftIssue {
    if (!value.title.trim()) return ContentDraftIssue.Title;
    if (new Set(value.blocks.map(block => block.id)).size !== value.blocks.length || value.blocks.some(block => !block.id.trim())) return ContentDraftIssue.Block;
    if (value.blocks.some(block => !block.title.trim())) return ContentDraftIssue.BlockTitle;
    if (value.blocks.some(block => !block.body.trim())) return ContentDraftIssue.BlockBody;
    return ContentDraftIssue.None;
  }
  static same(left: ContentDraftData, right: ContentDraftData): boolean { return JSON.stringify(left) === JSON.stringify(right); }
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
    if (Object.keys(value).some(key => !['title', 'subtitle', 'blocks'].includes(key)) || typeof value['title'] !== 'string' || typeof value['subtitle'] !== 'string' || !Array.isArray(value['blocks'])) return invalid();
    if (value['blocks'].some(block => !block || typeof block !== 'object' || Array.isArray(block) || Object.keys(block).some(key => !['id', 'title', 'body'].includes(key)) || typeof block.id !== 'string' || typeof block.title !== 'string' || typeof block.body !== 'string')) return invalid();
    const draft: ContentDraftData = { title: value['title'], subtitle: value['subtitle'], blocks: value['blocks'] };
    if (this.issue(draft) !== ContentDraftIssue.None) return invalid();
    return this.clone(draft);
  }
}
