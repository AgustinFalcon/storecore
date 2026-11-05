import { ProfileCompatibility, ProfileDiffOperation, ProfileImportPhase, PreviewValidity, ProfileManifestDraft, ProfileReviewDecoder } from './profile-import';

const section = { sectionKey: 'hero', content: { title: 'Hola' }, active: true, sortOrder: 0 };
const manifest = (sections: unknown[] = [section]): string => JSON.stringify({ profile_name: 'profile', profile_version: '1.0.0', coreCompatibility: '1.x', content: { homeSections: sections } });
const change = { sectionKey: 'hero', operation: 'ADD', after: { content: section.content, active: true, sortOrder: 0 } };

describe('profile closed types', () => {
  it('translates every phase once and closes future states', () => {
    for (const phase of [ProfileImportPhase.Editing, ProfileImportPhase.Previewing, ProfileImportPhase.Reviewing, ProfileImportPhase.Confirming, ProfileImportPhase.Merging, ProfileImportPhase.Succeeded, ProfileImportPhase.Failed, ProfileImportPhase.ResultUncertain, ProfileImportPhase.AccessDenied]) expect(ProfileImportPhase.fromWire(phase.wire)).toBe(phase);
    expect(ProfileImportPhase.fromWire('future')).toBe(ProfileImportPhase.Unknown);
    expect(ProfileImportPhase.Previewing.busy).toBe(true);
    expect(ProfileImportPhase.ResultUncertain.canEdit).toBe(false);
    for (const item of [PreviewValidity.Missing, PreviewValidity.Stale, PreviewValidity.Valid, PreviewValidity.Incompatible]) expect(PreviewValidity.fromWire(item.wire)).toBe(item);
    expect(PreviewValidity.fromWire(null)).toBe(PreviewValidity.Unknown);
    for (const item of [ProfileDiffOperation.Add, ProfileDiffOperation.Update, ProfileDiffOperation.Unchanged]) expect(ProfileDiffOperation.fromWire(item.wire)).toBe(item);
    expect(ProfileDiffOperation.fromWire('DELETE')).toBe(ProfileDiffOperation.Unknown);
    expect(ProfileCompatibility.fromWire(true)).toBe(ProfileCompatibility.Compatible);
    expect(ProfileCompatibility.fromWire(false)).toBe(ProfileCompatibility.Incompatible);
    expect(ProfileCompatibility.fromWire('true')).toBe(ProfileCompatibility.Unknown);
  });
});
describe('ProfileManifestDraft', () => {
  const draft = new ProfileManifestDraft();
  it('creates canonical explicit selection while retaining the payload', () => {
    const text = draft.select(manifest(), ['hero']);
    expect(JSON.parse(text).mergeSelection).toEqual({ homeSections: ['hero'] });
    expect(draft.keys(text)).toEqual(['hero']);
    expect(draft.select(text, [])).toContain('"homeSections": []');
    expect(() => draft.select(text, ['absent'])).toThrow();
    expect(() => draft.select(text, ['hero', 'hero'])).toThrow();
  });
  it.each(['', 'null', '[]', '{', '{"content":null}', '{"password":"value"}', '{"p\\u0061ssword":"value"}'])('rejects invalid or sensitive input %s', (text) => expect(() => draft.parse(text)).toThrow());
  it('enforces 100 sections and 20,000 UTF8 bytes with no invented manifest size limit', () => {
    expect(draft.keys(manifest(Array.from({ length: 100 }, (_, i) => ({ ...section, sectionKey: `s${i}` }))))).toHaveLength(100);
    expect(() => draft.parse(manifest(Array.from({ length: 101 }, (_, i) => ({ ...section, sectionKey: `s${i}` }))))).toThrow();
    expect(() => draft.parse(manifest([{ ...section, content: { title: 'é'.repeat(10000) } }]))).toThrow();
    expect(() => draft.parse(manifest([{ ...section, content: { title: 'a'.repeat(19988) } }]))).not.toThrow();
  });
  it.each([{ sectionKey: 1 }, { sectionKey: 'BAD' }, { content: [] }, { active: 'true' }, { sortOrder: 1.5 }, { sortOrder: -1 }])('rejects malformed section %j', (override) => expect(() => draft.parse(manifest([{ ...section, ...override }]))).toThrow());
  it('rejects duplicate keys', () => expect(() => draft.parse(manifest([section, section]))).toThrow());
});
describe('ProfileReviewDecoder', () => {
  const decoder = new ProfileReviewDecoder();
  it.each([[change], { changes: [change] }])('accepts backend diff shape %j', (shape) => {
    const review = decoder.decode({ compatible: true, version: '1.0.0', diff: JSON.stringify(shape) });
    expect(review.known).toBe(true); expect(review.changes[0].operation).toBe(ProfileDiffOperation.Add);
  });
  it('keeps unknown operation typed without exposing its wire as a valid status', () => {
    const review = decoder.decode({ compatible: true, version: '1.0.0', diff: JSON.stringify([{ ...change, operation: 'FUTURE' }]) });
    expect(review.known).toBe(false); expect(review.changes[0].operation).toBe(ProfileDiffOperation.Unknown);
  });
  it.each(['invalid', '{}', 'null', '[{"sectionKey":"hero"}]', JSON.stringify([change, change]), JSON.stringify([{ ...change, after: { password: 'private' } }]), '[{"sectionKey":"hero","operation":"ADD","after":{"p\\u0061ssword":"x"}}]'])('rejects unknown or sensitive diff without exposing content', (diff) => {
    expect(decoder.decode({ compatible: true, version: '1.0.0', diff })).toMatchObject({ known: false, changes: [] });
  });
  it.each([{}, { content: [], active: true, sortOrder: 0 }, { content: {}, active: 'true', sortOrder: 0 }, { content: {}, active: true, sortOrder: -1 }, { content: {}, active: true, sortOrder: 0.5 }])('rejects malformed snapshots %j', (after) => {
    expect(decoder.decode({ compatible: true, version: '1.0.0', diff: JSON.stringify([{ ...change, after }]) }).known).toBe(false);
  });
  it('rejects compatible version mismatch and missing before on updates', () => {
    expect(decoder.decode({ compatible: true, version: 'future', diff: JSON.stringify([change]) }).known).toBe(false);
    expect(decoder.decode({ compatible: true, version: '1.0.0', diff: JSON.stringify([{ ...change, operation: 'UPDATE' }]) }).known).toBe(false);
  });
  it('accepts a large authoritative before snapshot while retaining the incoming 20,000-byte limit', () => {
    const before = { content: { title: 'a'.repeat(20_001) }, active: true, sortOrder: 0 };
    const update = { ...change, operation: 'UPDATE', before };
    expect(decoder.decode({ compatible: true, version: '1.0.0', diff: JSON.stringify([update]) }).known).toBe(true);
    expect(decoder.decode({ compatible: true, version: '1.0.0', diff: JSON.stringify([{ ...update, after: before }]) }).known).toBe(false);
  });
});
