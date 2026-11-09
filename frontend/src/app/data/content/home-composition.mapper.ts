import { HomeBlockContent, HomeBlockKind, HomeComposition, HomeSection } from '../../domain/content/home-composition';
function record(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
/** The only translation of persisted block kinds and legacy rows. Invalid content never reaches a public renderer. */
export function mapHomeComposition(raw: unknown, publicOnly = false): HomeComposition {
  const row = record(raw);
  if (!Number.isSafeInteger(row['revision']) || (row['revision'] as number) < 0 || !Array.isArray(row['sections'])) throw new Error('La composición recibida no es válida.');
  const keys = new Set<string>();
  const sections: HomeSection[] = row['sections'].map((value: unknown) => {
    const section = record(value), content = record(section['content']);
    if (typeof section['key'] !== 'string' || !section['key'] || keys.has(section['key']) || typeof section['active'] !== 'boolean' || !Number.isSafeInteger(section['sortOrder']) || (section['sortOrder'] as number) < 0) throw new Error('La sección recibida no es válida.');
    keys.add(section['key']);
    let kind = HomeBlockKind.fromWire(section['kind']);
    // A missing kind is legacy only for the exact hero key and a complete valid schema.
    if (section['kind'] === undefined && section['key'] === 'hero' && HomeBlockKind.Hero.validate(content as unknown as HomeBlockContent)) kind = HomeBlockKind.Hero;
    if (!kind.validate(content as unknown as HomeBlockContent)) kind = HomeBlockKind.Unknown;
    return {
      key: section['key'], kind, active: section['active'], sortOrder: section['sortOrder'] as number,
      content: kind.known ? { ...content } as unknown as HomeBlockContent : { title: '' },
      updatedAt: typeof section['updatedAt'] === 'string' ? section['updatedAt'] : null,
    };
  });
  return { revision: row['revision'] as number, sections: sections.filter(section => !publicOnly || section.active && section.kind.known).sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)) };
}
