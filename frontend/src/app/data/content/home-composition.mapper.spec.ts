import { HomeBlockKind as Kind, validComposition } from '../../domain/content/home-composition';
import { mapHomeComposition } from './home-composition.mapper';
const section = (kind: unknown = Kind.Hero.wire, content: unknown = { title: 'Portada', body: '' }, key = 'hero') => ({ key, kind, active: true, sortOrder: 0, content, updatedAt: null });
describe('home composition boundary', () => {
  it('translates every closed kind and fails closed for future or malformed states', () => {
    for (const kind of Kind.editable) expect(Kind.fromWire(kind.wire)).toBe(kind);
    for (const raw of ['future', null, undefined, 1, {}]) expect(Kind.fromWire(raw)).toBe(Kind.Unknown);
    expect(Kind.Unknown.label).toBe('Bloque no compatible');
  });
  it('validates exact typed schemas, numeric category identifiers, limits and unique references', () => {
    const good = [
      section(), section(Kind.PromoBanner.wire, { title: 'Promo', body: 'A', ctaPath: '/catalog?offers=1', ctaLabel: 'Ver' }, 'promo'),
      section(Kind.CategoryRail.wire, { title: 'Categorías', categoryIds: [1, 2] }, 'categories'),
      section(Kind.ProductRail.wire, { title: 'Productos', skus: ['SKU-A'] }, 'products'),
    ];
    const home = mapHomeComposition({ revision: 3, sections: good });
    expect(new Set(home.sections.map(row => row.kind))).toEqual(new Set(Kind.editable));
    expect(validComposition(home)).toBe(true);
    for (const [kind, content] of [
      [Kind.Hero, { title: '', body: '' }], [Kind.Hero, { title: 'A', body: 'x'.repeat(501) }],
      [Kind.PromoBanner, { title: 'A', body: 'x'.repeat(301) }], [Kind.Hero, { title: 'A', body: '', extra: true }],
      [Kind.CategoryRail, { title: 'A', categoryIds: ['1'] }], [Kind.CategoryRail, { title: 'A', categoryIds: [1, 1] }],
      [Kind.CategoryRail, { title: 'A', categoryIds: [0] }], [Kind.CategoryRail, { title: 'A', categoryIds: Array.from({length: 13}, (_, i) => i + 1) }],
      [Kind.ProductRail, { title: 'A', skus: [] }], [Kind.ProductRail, { title: 'A', skus: ['A', 'A'] }],
      [Kind.ProductRail, { title: 'A', skus: Array.from({length: 21}, (_, i) => String(i)) }],
    ] as const) {
      const mapped = mapHomeComposition({ revision: 0, sections: [section(kind.wire, content)] });
      expect(mapped.sections[0].kind).toBe(Kind.Unknown);
      expect(validComposition(mapped)).toBe(false);
    }
  });
  it('rejects external and browser-normalized unsafe CTA paths', () => {
    for (const ctaPath of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2fevil.test', '/ %0a', 'catalog', 'javascript:alert(1)', '/' + 'a'.repeat(2_048)]) {
      expect(mapHomeComposition({ revision: 1, sections: [section(Kind.Hero.wire, { title: 'A', body: '', ctaPath })] }, true).sections).toEqual([]);
    }
  });
  it('only translates a complete legacy hero and omits unknown, invalid and inactive public rows in order', () => {
    const hero = section(undefined); delete (hero as {kind?: unknown}).kind;
    const other = { ...hero, key: 'legacy', content: { title: 'Never public', body: '' } };
    const rows = [other, { ...section(), key: 'inactive', active: false }, { ...section(), key: 'z', sortOrder: 2 }, hero, { ...section(), key: 'a', sortOrder: 2 }];
    expect(mapHomeComposition({ revision: 1, sections: rows }).sections.find(row => row.key === 'legacy')?.kind).toBe(Kind.Unknown);
    expect(mapHomeComposition({ revision: 1, sections: rows }, true).sections.map(row => row.key)).toEqual(['hero', 'a', 'z']);
    expect(mapHomeComposition({ revision: 1, sections: [{...hero, content: {title: 'Missing body'}}] }, true).sections).toEqual([]);
  });
  it('does not fabricate missing persisted content or accept malformed envelopes', () => {
    for (const raw of [null, {}, {revision: -1, sections: []}, {revision: 1, sections: null}, {revision: 1, sections: [section(), section()]}]) expect(() => mapHomeComposition(raw)).toThrow();
    expect(mapHomeComposition({revision: 0, sections: []})).toEqual({revision: 0, sections: []});
  });
});
