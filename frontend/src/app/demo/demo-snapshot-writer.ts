import { signal } from '@angular/core';
import { DemoSnapshotConflict } from './catalog/catalog-types';

export class DemoWriterStatus {
  private constructor(readonly wire: string, readonly writable: boolean, readonly guidance: string) {}

  static readonly Acquiring = new DemoWriterStatus('ACQUIRING', false, 'Preparando el guardado seguro de la demostración.');
  static readonly Writable = new DemoWriterStatus('WRITABLE', true, 'Los cambios de esta pestaña se guardan localmente.');
  static readonly ReadOnly = new DemoWriterStatus('READ_ONLY', false, 'Esta pestaña es de consulta. Cerrá la otra pestaña de la demo y recargá para guardar.');
  static readonly Unavailable = new DemoWriterStatus('UNAVAILABLE', false, 'Este navegador no permite coordinar el guardado seguro. Podés explorar la demo sin modificarla.');
  static readonly Unknown = new DemoWriterStatus('', false, 'El guardado no está disponible. Recargá la pantalla.');
  static readonly all = [this.Acquiring, this.Writable, this.ReadOnly, this.Unavailable] as const;

  static fromWire(raw: unknown): DemoWriterStatus {
    return this.all.find(status => status.wire === raw) ?? this.Unknown;
  }
}

/** Browser-only exclusion boundary: localStorage is persistence, never a lock. */
export class DemoSnapshotWriter {
  static readonly browser = new DemoSnapshotWriter();
  static readonly lockName = 'storecore.commercial-demo.snapshot-writer';
  readonly status = signal(DemoWriterStatus.Acquiring);
  private releaseLock: (() => void) | undefined;

  acquire(locks: LockManager | undefined = navigator.locks): Promise<void> {
    if (this.status() === DemoWriterStatus.Writable) return Promise.resolve();
    if (!locks) {
      this.status.set(DemoWriterStatus.Unavailable);
      return Promise.resolve();
    }
    this.status.set(DemoWriterStatus.Acquiring);
    return new Promise<void>(resolve => {
      void Promise.resolve().then(() => locks.request(DemoSnapshotWriter.lockName, { ifAvailable: true }, lock => {
        if (!lock) {
          this.status.set(DemoWriterStatus.ReadOnly);
          resolve();
          return;
        }
        this.status.set(DemoWriterStatus.Writable);
        const held = new Promise<void>(release => { this.releaseLock = release; });
        resolve();
        return held;
      })).catch(() => {
        this.status.set(DemoWriterStatus.Unavailable);
        resolve();
      });
    });
  }

  assertWritable(): void {
    if (!this.status().writable) throw new DemoSnapshotConflict(this.status().guidance);
  }

  release(): void {
    this.status.set(DemoWriterStatus.ReadOnly);
    this.releaseLock?.();
    this.releaseLock = undefined;
  }
}
