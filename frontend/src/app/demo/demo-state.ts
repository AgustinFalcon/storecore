import { Injectable, signal } from '@angular/core';
import { DemoCommerce, DemoContext, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';
import { DemoSnapshotPersistence } from './demo-snapshot-persistence';
import { DemoSnapshotWriter } from './demo-snapshot-writer';

@Injectable({ providedIn: 'root' })
export class DemoApplicationState {
  readonly writerStatus = DemoSnapshotWriter.browser.status.asReadonly();
  readonly commerce = new DemoCommerce();
  private readonly persistence = new DemoSnapshotPersistence(localStorage);
  readonly revision = signal(0);
  readonly context = signal(DemoContext.Unknown);
  readonly actorId = signal('cliente');
  readonly scenario = signal(DemoScenario.Approved);
  readonly message = signal('');
  readonly error = signal('');
  private persistedRevision = 0;
  private persistedRaw: string | null = null;
  constructor() {
    try { const persisted = this.persistence.load(this.commerce.snapshot); this.commerce.snapshot = persisted.snapshot; this.persistedRaw = persisted.raw; this.persistedRevision = persisted.snapshot.revision; } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo leer la demo guardada.'); }
    window.addEventListener('storage', event => { if (event.key === DemoSnapshotPersistence.key) this.error.set('Los datos cambiaron en otra pestaña. Recargá antes de continuar.'); });
    const savedContext = DemoContext.fromWire(sessionStorage.getItem('storecore.demo.context'));
    const savedActor = sessionStorage.getItem('storecore.demo.actor') ?? 'cliente';
    if (this.commerce.snapshot.actors.some(actor => actor.id === savedActor)) { this.actorId.set(savedActor); this.context.set(savedContext); }
  }
  get data() { this.revision(); return this.commerce.snapshot; }
  get actor() { this.revision(); return this.commerce.actor(this.actorId()); }
  run(action: () => void, result: string): boolean {
    this.error.set(''); this.message.set('');
    const before = JSON.stringify(this.commerce.snapshot);
    try {
      const persisted = this.persistence.transact(this.persistedRaw, this.persistedRevision, () => { action(); return this.commerce.snapshot; });
      this.commerce.snapshot = persisted.snapshot; this.persistedRaw = persisted.raw; this.persistedRevision = persisted.snapshot.revision;
      this.revision.update(value => value + 1); this.message.set(result); return true;
    } catch (error) { this.commerce.snapshot = decodeSnapshot(before); this.revision.update(value => value + 1); this.error.set(error instanceof Error ? error.message : 'No se pudo completar la operación.'); return false; }
  }
  login(context: DemoContext, actor = 'cliente'): void { this.actorId.set(actor); this.context.set(context); sessionStorage.setItem('storecore.demo.context', context.wire); sessionStorage.setItem('storecore.demo.actor', actor); this.error.set(''); }
  logout(): void { this.context.set(DemoContext.Unknown); sessionStorage.removeItem('storecore.demo.context'); sessionStorage.removeItem('storecore.demo.actor'); this.message.set('Sesión demo cerrada.'); }
  reset(): void {
    try {
      let storedRevision = this.persistedRevision;
      try { storedRevision = this.persistence.revisionOr(storedRevision); } catch { /* Reset repairs corrupt persistence. */ }
      const next = demoSeed(); next.revision = Math.max(storedRevision, this.persistedRevision) + 1;
      const persisted = this.persistence.replace(next);
      this.commerce.snapshot = persisted.snapshot; this.persistedRevision = persisted.snapshot.revision; this.persistedRaw = persisted.raw;
      this.actorId.set('cliente'); this.logout(); this.scenario.set(DemoScenario.Approved); this.revision.update(value => value + 1); this.error.set(''); this.message.set('Demostración restablecida.');
    } catch { this.error.set('No se pudo restablecer la demostración.'); }
  }
}
