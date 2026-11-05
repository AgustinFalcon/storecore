import { DemoSnapshotConflict } from './catalog/catalog-types';
import { DemoSnapshotPersistence } from './demo-snapshot-persistence';
import { demoSeed } from './demo-model';
import { DemoSnapshotWriter, DemoWriterStatus } from './demo-snapshot-writer';

function lockManager(): LockManager {
  let held = false;
  return {
    request: (_name: string, _options: LockOptions, callback: LockGrantedCallback<unknown>) => Promise.resolve().then(async () => {
      if (held) return callback(null);
      held = true;
      try { return await callback({ name: DemoSnapshotWriter.lockName, mode: 'exclusive' }); }
      finally { held = false; }
    }),
  } as LockManager;
}

describe('DemoSnapshotWriter', () => {
  beforeEach(() => localStorage.clear());

  it('maps unknown status and fails closed without Web Locks', async () => {
    expect(DemoWriterStatus.fromWire('future')).toBe(DemoWriterStatus.Unknown);
    const writer = new DemoSnapshotWriter();
    await writer.acquire(undefined);
    expect(writer.status()).toBe(DemoWriterStatus.Unavailable);
    expect(() => writer.assertWritable()).toThrow(DemoSnapshotConflict);
  });

  it('keeps the Demo readable when browser coordination fails', async () => {
    const writer = new DemoSnapshotWriter();
    await writer.acquire({ request: () => { throw new Error('Browser policy'); } } as unknown as LockManager);
    expect(writer.status()).toBe(DemoWriterStatus.Unavailable);
    expect(() => writer.assertWritable()).toThrow('navegador');
  });

  it('allows one writer and prevents denied callbacks from mutating', async () => {
    const locks = lockManager();
    const first = new DemoSnapshotWriter();
    const second = new DemoSnapshotWriter();
    await Promise.all([first.acquire(locks), second.acquire(locks)]);
    expect(first.status()).toBe(DemoWriterStatus.Writable);
    expect(second.status()).toBe(DemoWriterStatus.ReadOnly);
    const primary = new DemoSnapshotPersistence(localStorage, () => first.assertWritable());
    const denied = new DemoSnapshotPersistence(localStorage, () => second.assertWritable());
    const snapshot = demoSeed();
    const initial = primary.replace(snapshot);
    const forbidden = vi.fn(() => snapshot);
    expect(() => denied.transact(initial.raw, snapshot.revision, forbidden)).toThrow('otra pestaña');
    expect(forbidden).not.toHaveBeenCalled();
    first.release();
    await Promise.resolve();
    await Promise.resolve();
    const next = new DemoSnapshotWriter();
    await next.acquire(locks);
    expect(next.status()).toBe(DemoWriterStatus.Writable);
    next.release();
  });
});
