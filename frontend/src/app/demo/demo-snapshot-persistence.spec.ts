import { DemoSnapshotConflict } from './catalog/catalog-types';
import { demoSeed } from './demo-model';
import { DemoSnapshotPersistence } from './demo-snapshot-persistence';

describe('DemoSnapshotPersistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  const repository = () => new DemoSnapshotPersistence(localStorage, () => {});

  it('uses a fallback without inventing durable state', () => {
    const fallback = demoSeed();
    const loaded = repository().load(fallback);
    expect(loaded.raw).toBeNull();
    expect(loaded.snapshot).toMatchObject({ version: fallback.version, revision: fallback.revision, title: fallback.title });
    expect(loaded.snapshot).not.toBe(fallback);
    expect(localStorage.length).toBe(0);
  });

  it('validates a candidate before crossing the storage boundary', () => {
    const invalid = demoSeed();
    invalid.products[0].onHand = -1;
    expect(() => repository().replace(invalid)).toThrow();
    expect(localStorage.getItem(DemoSnapshotPersistence.key)).toBeNull();
  });

  it('rejects deletion and equal-revision replacement by another tab', () => {
    const persistence = repository();
    const snapshot = demoSeed();
    const stored = persistence.replace(snapshot);
    persistence.assertUnchanged(stored.raw, snapshot.revision);
    localStorage.removeItem(DemoSnapshotPersistence.key);
    expect(() => persistence.assertUnchanged(stored.raw, snapshot.revision)).toThrow(DemoSnapshotConflict);
    localStorage.setItem(DemoSnapshotPersistence.key, JSON.stringify({ ...snapshot, title: 'Replaced' }));
    expect(() => persistence.assertUnchanged(stored.raw, snapshot.revision)).toThrow(DemoSnapshotConflict);
  });

  it('rejects a stale transaction before invoking its mutation', () => {
    const first = repository();
    const second = repository();
    const seed = demoSeed();
    const initial = first.replace(seed);
    const a = first.load(seed).snapshot;
    first.transact(initial.raw, seed.revision, () => { a.title = 'Primera'; a.revision++; return a; });
    const forbidden = vi.fn(() => seed);
    expect(() => second.transact(initial.raw, seed.revision, forbidden)).toThrow(DemoSnapshotConflict);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('repairs corrupt persistence only through explicit replacement', () => {
    localStorage.setItem(DemoSnapshotPersistence.key, '{corrupt');
    expect(() => repository().current(demoSeed())).toThrow();
    expect(() => repository().replace(demoSeed())).not.toThrow();
    expect(repository().current(demoSeed()).version).toBe(2);
  });

  it('treats an empty persisted value as corrupt instead of restoring the active fallback', () => {
    localStorage.setItem(DemoSnapshotPersistence.key, '');
    expect(() => repository().load(demoSeed())).toThrow();
    expect(() => repository().current(demoSeed())).toThrow();
    expect(() => repository().revisionOr(0)).toThrow();
  });

  it('restores prior durable data when readback verification fails', () => {
    const persistence = repository();
    const seed = demoSeed();
    const initial = persistence.replace(seed);
    const changed = persistence.load(seed).snapshot;
    changed.title = 'Cambio'; changed.revision++;
    const originalGet = Storage.prototype.getItem;
    let reads = 0;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      reads++;
      if (reads === 2) return '{tampered';
      return originalGet.call(this, key);
    });
    expect(() => persistence.transact(initial.raw, seed.revision, () => changed)).toThrow('verificar');
    vi.restoreAllMocks();
    expect(localStorage.getItem(DemoSnapshotPersistence.key)).toBe(initial.raw);
  });
});
