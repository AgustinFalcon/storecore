import { DemoApplicationState } from '../demo-state';
import { decodeSnapshot, demoSeed, DemoContext, DemoSnapshot } from '../demo-model';
import { DemoSnapshotWriter } from '../demo-snapshot-writer';
import { DemoSnapshotPersistence } from '../demo-snapshot-persistence';
import { ContentDraft } from './content-draft';
import { UserRole } from '../../domain/user/user-role';

describe('SC16 v3 draft persistence and existing transaction authority', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(DemoSnapshotWriter.browser, 'assertWritable').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());
  it.each([1, 2])('migrates legacy v%s without changing Home, identities or aggregate revision', version => {
    const legacy: Partial<DemoSnapshot> = { ...demoSeed(), version }; delete legacy.contentDraft;
    const restored = decodeSnapshot(JSON.stringify(legacy));
    expect(restored.version).toBe(3); expect(restored.title).toBe(legacy.title); expect(restored.contentDraft.title).toBe(legacy.title);
    expect(restored.revision).toBe(legacy.revision); expect(restored.orders).toHaveLength(legacy.orders!.length);
    restored.contentDraft.blocks[0].title = 'Draft only'; expect(restored.blocks[0].title).not.toBe('Draft only');
  });
  it('rejects missing v3 and malformed explicit drafts, including legacy null', () => {
    const missing: Partial<DemoSnapshot> = { ...demoSeed() }; delete missing.contentDraft;
    expect(() => decodeSnapshot(JSON.stringify(missing))).toThrow();
    for (const version of [2, 3]) for (const contentDraft of [null, {}, { title: 'X', subtitle: '', blocks: [{ id: 'x', title: 'X', body: 'x' }, { id: 'x', title: 'Y', body: 'y' }] }]) expect(() => decodeSnapshot(JSON.stringify({ ...demoSeed(), version, contentDraft }))).toThrow();
  });
  it.each([UserRole.Admin, UserRole.Operator])('saves only draft under role %s while preserving Home after reload', role => {
    const state = new DemoApplicationState(); state.login(DemoContext.Admin, 'cliente', role);
    const home = ContentDraft.clone(state.data), draft = ContentDraft.clone(state.data.contentDraft); draft.title = 'Saved private draft';
    expect(state.saveContentDraft(draft, state.sessionEpoch())).toBe(true);
    const restored = new DemoApplicationState(); expect(restored.data.contentDraft.title).toBe(draft.title); expect(ContentDraft.clone(restored.data)).toEqual(home);
  });
  it('preserves the draft, Home and durable data on writer denial, stale epoch or failed write', () => {
    const state = new DemoApplicationState(); state.login(DemoContext.Admin);
    const before = JSON.stringify(state.data), draft = ContentDraft.clone(state.data.contentDraft); draft.title = 'Unsaved';
    expect(state.saveContentDraft(draft, state.sessionEpoch()-1)).toBe(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect(state.saveContentDraft(draft, state.sessionEpoch())).toBe(false); expect(JSON.stringify(state.data)).toBe(before); expect(localStorage.getItem(DemoSnapshotPersistence.key)).toBeNull();
    vi.spyOn(DemoSnapshotWriter.browser, 'assertWritable').mockImplementation(() => { throw new Error('read-only'); });
    expect(state.saveContentDraft(draft, state.sessionEpoch())).toBe(false); expect(JSON.stringify(state.data)).toBe(before);
  });
  it('does not overwrite a newer draft from another tab', () => {
    const first = new DemoApplicationState(), second = new DemoApplicationState(); first.login(DemoContext.Admin); second.login(DemoContext.Admin);
    const a = ContentDraft.clone(first.data.contentDraft), b = ContentDraft.clone(second.data.contentDraft); a.title = 'First'; b.title = 'Second';
    expect(first.saveContentDraft(a, first.sessionEpoch())).toBe(true); expect(second.saveContentDraft(b, second.sessionEpoch())).toBe(false);
    expect(second.data.contentDraft.title).not.toBe('Second'); expect(new DemoApplicationState().data.contentDraft.title).toBe('First');
  });
});
