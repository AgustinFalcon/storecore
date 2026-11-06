import { ContentDraft, ContentDraftIssue } from './content-draft';
import { AddContentItemStep, ContentBannerTheme, ContentBannerDestination, MerchandisingItemKind, MoveContentItemStep, RemoveContentItemStep, SelectContentCategoryStep } from './content-merchandising';
import { DemoApplicationState } from '../demo-state';
import { DemoContext, decodeSnapshot, demoSeed } from '../demo-model';
import { DemoSnapshotWriter } from '../demo-snapshot-writer';

describe('SC16 merchandising draft contract', () => {
  const banner = () => ({ id: 'workshop', title: 'Prepará tu taller', body: 'Herramientas para tu proyecto.', theme: ContentBannerTheme.Workshop, destination: ContentBannerDestination.Catalog });
  const draft = () => ({ title: 'Mi tienda', subtitle: 'Todo para trabajar', blocks: [], banners: [banner()], categories: ['Herramientas', 'Seguridad'] });
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(DemoSnapshotWriter.browser, 'assertWritable').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());
  it('translates theme and destination once and rejects unknown values or malformed extensions', () => {
    for (const type of [ContentBannerTheme, ContentBannerDestination]) { for (const value of type.all) expect(type.fromWire(value.wire)).toBe(value); expect(type.fromWire('invented')).toBe(type.Unknown); }
    for (const value of MerchandisingItemKind.all) expect(MerchandisingItemKind.fromWire(value.wire)).toBe(value); expect(MerchandisingItemKind.fromWire('invented')).toBe(MerchandisingItemKind.Unknown);
    const restored = ContentDraft.fromWire(JSON.parse(JSON.stringify(draft())));
    expect(restored.banners![0].theme).toBe(ContentBannerTheme.Workshop); expect(restored.banners![0].destination).toBe(ContentBannerDestination.Catalog);
    for (const change of [{ banners: null }, { categories: null }, { categories: ['A', 'A'] }, { banners: [{ ...banner(), destination: { wire: 'https://evil.invalid' } }] }, { banners: [{ ...banner(), theme: { wire: 'unknown' } }] }, { banners: [banner(), banner()] }]) expect(() => ContentDraft.fromWire({ ...draft(), ...change })).toThrow(ContentDraftIssue.Unknown.label);
  });
  it('upgrades historical drafts while preserving explicit empty category selections', () => {
    const old = { title: 'Anterior', subtitle: '', blocks: [] };
    expect(ContentDraft.fromWire(old).banners).toEqual([]); expect(ContentDraft.fromWire(old).categories).toBeUndefined();
    expect(ContentDraft.fromWire({ ...old, categories: [] }).categories).toEqual([]);
    const snapshot = demoSeed(); snapshot.contentDraft = old;
    expect(decodeSnapshot(JSON.stringify(snapshot)).contentDraft.title).toBe('Anterior');
    const seeded = ContentDraft.seed(old, ['Herramientas', 'Seguridad', 'Herramientas']);
    expect(seeded.banners).toHaveLength(1); expect(seeded.categories).toEqual(['Herramientas', 'Seguridad']);
  });
  it('isolates preview edits and respects ordering and limits', () => {
    const original = draft(), preview = ContentDraft.clone(original); preview.banners![0].title = 'Otra'; preview.categories!.reverse();
    expect(original.banners[0].title).toBe('Prepará tu taller'); expect(original.categories[0]).toBe('Herramientas');
    expect(new MoveContentItemStep().execute(original.categories, 0, 1)).toEqual(['Seguridad', 'Herramientas']);
    expect(new MoveContentItemStep().execute(original.categories, 0, -1)).toEqual(original.categories);
    expect(ContentDraft.issue({ ...draft(), banners: [{ ...banner(), title: ' ' }] })).toBe(ContentDraftIssue.Banner);
    expect(ContentDraft.issue({ ...draft(), categories: Array.from({ length: 13 }, (_, i) => String(i)) })).toBe(ContentDraftIssue.Categories);
  });
  it('models add, remove and category selection as bounded flow steps', () => {
    expect(new AddContentItemStep().execute(['A'], 'B', 2)).toEqual(['A', 'B']);
    expect(new AddContentItemStep().execute(['A', 'B'], 'C', 2)).toEqual(['A', 'B']);
    expect(new RemoveContentItemStep().execute(['A', 'B'], 0)).toEqual(['B']);
    expect(new RemoveContentItemStep().execute(['A'], 4)).toEqual(['A']);
    const selection = new SelectContentCategoryStep();
    expect(selection.execute(['Herramientas'], 'Seguridad', true, true)).toEqual(['Herramientas', 'Seguridad']);
    expect(selection.execute(['Herramientas'], 'Retirada', true, false)).toEqual(['Herramientas']);
    expect(selection.execute(['Retirada'], 'Retirada', false, false)).toEqual([]);
  });
  it('saves and reloads merchandising without publishing or sharing buffers', () => {
    const state = new DemoApplicationState(); state.login(DemoContext.Admin);
    const home = { title: state.data.title, blocks: JSON.stringify(state.data.blocks) }, buffer = draft();
    expect(state.saveContentDraft(buffer, state.sessionEpoch())).toBe(true); buffer.banners[0].title = 'Mutado'; buffer.categories.reverse();
    const restored = new DemoApplicationState();
    expect(restored.data.contentDraft.banners![0].title).toBe('Prepará tu taller'); expect(restored.data.contentDraft.categories).toEqual(['Herramientas', 'Seguridad']);
    expect(restored.data.title).toBe(home.title); expect(JSON.stringify(restored.data.blocks)).toBe(home.blocks);
  });
});
