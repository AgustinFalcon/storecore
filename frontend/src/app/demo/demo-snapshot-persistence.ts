import { DemoSnapshotConflict } from './catalog/catalog-types';
import { decodeSnapshot, type DemoSnapshot } from './demo-model';
import { DemoSnapshotWriter } from './demo-snapshot-writer';

export interface PersistedDemoSnapshot {
  readonly raw: string | null;
  readonly snapshot: DemoSnapshot;
}

/** Sole browser-storage boundary for the executable Demo snapshot. */
export class DemoSnapshotPersistence {
  static readonly key = 'storecore.commercial-demo.v1';

  constructor(
    private readonly storage: Storage,
    private readonly assertWriter: () => void = () => DemoSnapshotWriter.browser.assertWritable(),
  ) {}

  load(fallback: DemoSnapshot): PersistedDemoSnapshot {
    const raw = this.storage.getItem(DemoSnapshotPersistence.key);
    return { raw, snapshot: raw !== null ? decodeSnapshot(raw) : decodeSnapshot(JSON.stringify(fallback)) };
  }

  raw(): string | null {
    return this.storage.getItem(DemoSnapshotPersistence.key);
  }

  current(fallback: DemoSnapshot): DemoSnapshot {
    const raw = this.raw();
    return raw !== null ? decodeSnapshot(raw) : decodeSnapshot(JSON.stringify(fallback));
  }

  revisionOr(fallback: number): number {
    const raw = this.raw();
    return raw !== null ? decodeSnapshot(raw).revision : fallback;
  }

  assertUnchanged(expectedRaw: string | null, expectedRevision: number): void {
    const raw = this.raw();
    if (raw !== expectedRaw || (raw !== null && decodeSnapshot(raw).revision !== expectedRevision)) {
      throw new DemoSnapshotConflict('Los datos cambiaron en otra pestaña. Recargá antes de guardar.');
    }
  }

  transact(expectedRaw: string | null, expectedRevision: number, mutation: () => DemoSnapshot): PersistedDemoSnapshot {
    this.assertWriter();
    this.assertUnchanged(expectedRaw, expectedRevision);
    return this.commit(mutation(), expectedRaw);
  }

  /** Explicit repair path. Normal writes never bypass decoding of current persistence. */
  replace(snapshot: DemoSnapshot): PersistedDemoSnapshot {
    this.assertWriter();
    return this.commit(snapshot, this.raw());
  }

  private commit(snapshot: DemoSnapshot, priorRaw: string | null): PersistedDemoSnapshot {
    const candidateRaw = JSON.stringify(snapshot);
    decodeSnapshot(candidateRaw);
    if (candidateRaw === priorRaw) return { raw: priorRaw, snapshot: decodeSnapshot(candidateRaw) };
    try {
      this.storage.setItem(DemoSnapshotPersistence.key, candidateRaw);
      const storedRaw = this.storage.getItem(DemoSnapshotPersistence.key);
      if (storedRaw !== candidateRaw) throw new Error('No se pudo verificar el guardado local de la demostración.');
      return { raw: storedRaw, snapshot: decodeSnapshot(storedRaw) };
    } catch (error) {
      try {
        if (priorRaw === null) this.storage.removeItem(DemoSnapshotPersistence.key);
        else this.storage.setItem(DemoSnapshotPersistence.key, priorRaw);
      } catch { /* Keep the original storage failure as the actionable error. */ }
      throw error;
    }
  }
}
