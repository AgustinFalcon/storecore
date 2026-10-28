import { Injectable, signal } from '@angular/core';
import { DemoCommerce, DemoContext, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';
import { DemoSnapshotPersistence } from './demo-snapshot-persistence';
import { DemoSnapshotWriter } from './demo-snapshot-writer';
import { UserRole } from '../domain/user/user-role';
import { CustomerAccountCommand, CustomerAdministrationAuthority } from './customers/customer-account';

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
  readonly role = signal(UserRole.Unknown);
  readonly sessionEpoch = signal(0);
  private customerGeneration: number | null = null;
  private authorizationReadable = true;
  private persistedRevision = 0;
  private persistedRaw: string | null = null;
  constructor() {
    try { const persisted = this.persistence.load(this.commerce.snapshot); this.commerce.snapshot = persisted.snapshot; this.persistedRaw = persisted.raw; this.persistedRevision = persisted.snapshot.revision; } catch (error) { this.authorizationReadable = false; this.error.set(error instanceof SyntaxError ? 'Los datos Demo guardados no son válidos. Revisá la demostración o restablecela explícitamente.' : error instanceof Error ? error.message : 'No se pudo leer la demo guardada.'); }
    window.addEventListener('storage', event => { if (event.key === DemoSnapshotPersistence.key) { if (this.context() === DemoContext.Customer) { try { this.validateCustomerSession(); } catch { this.logout(); } } this.error.set('Los datos cambiaron en otra pestaña. Recargá antes de continuar.'); } });
    const savedContext = DemoContext.fromWire(sessionStorage.getItem('storecore.demo.context'));
    const savedActor = sessionStorage.getItem('storecore.demo.actor') ?? 'cliente';
    if (this.authorizationReadable && this.commerce.snapshot.actors.some(actor => actor.id === savedActor)) {
      this.actorId.set(savedActor);
      if (savedContext === DemoContext.Admin) { this.context.set(savedContext); this.role.set(UserRole.fromWire(sessionStorage.getItem('storecore.demo.role'))); }
      else if (savedContext === DemoContext.Customer) { const raw = sessionStorage.getItem('storecore.demo.generation'); this.customerGeneration = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null; try { this.validateCustomerSession(); this.context.set(savedContext); } catch { this.logout(); } }
    }
  }
  get data() { this.revision(); return this.commerce.snapshot; }
  get authorizationAvailable(): boolean { return this.authorizationReadable; }
  get canResetDemo(): boolean { return !this.authorizationReadable || this.context() !== DemoContext.Admin || this.role() === UserRole.Admin; }
  get actor() { this.revision(); return this.commerce.actor(this.actorId()); }
  run(action: () => void, result: string): boolean {
    this.error.set(''); this.message.set('');
    const before = JSON.stringify(this.commerce.snapshot);
    try {
      if (!this.authorizationReadable) throw new Error('Los datos guardados no son válidos. Restablecé explícitamente la demo.');
      if (this.context() === DemoContext.Customer) this.validateCustomerSession();
      const persisted = this.persistence.transact(this.persistedRaw, this.persistedRevision, () => { action(); return this.commerce.snapshot; });
      this.commerce.snapshot = persisted.snapshot; this.persistedRaw = persisted.raw; this.persistedRevision = persisted.snapshot.revision;
      this.revision.update(value => value + 1); this.message.set(result); this.revokeAffectedSession(); return true;
    } catch (error) { this.commerce.snapshot = decodeSnapshot(before); this.revision.update(value => value + 1); this.error.set(error instanceof Error ? error.message : 'No se pudo completar la operación.'); return false; }
  }
  login(context: DemoContext, actor = 'cliente', role = UserRole.Admin): boolean {
    try {
      if (!this.authorizationReadable) throw new Error('La autorización guardada no es válida. Restablecé la demo.');
      if (this.persistedRaw !== null && this.persistence.raw() === null) throw new Error('Los datos guardados desaparecieron. Recargá la Demo.');
      const current = this.persistence.current(this.commerce.snapshot); const access = current.actors.find(value => value.id === actor)?.access;
      if (context === DemoContext.Customer && !access?.state.permitsAccess) throw new Error('Esta cuenta está restringida o no tiene un estado reconocido.');
      this.sessionEpoch.update(value => value + 1); this.actorId.set(actor); this.context.set(context); this.role.set(context === DemoContext.Admin ? role : UserRole.Unknown);
      this.customerGeneration = context === DemoContext.Customer ? access!.generation : null;
      sessionStorage.setItem('storecore.demo.context', context.wire); sessionStorage.setItem('storecore.demo.actor', actor); sessionStorage.setItem('storecore.demo.role', this.role().wire);
      if (this.customerGeneration !== null) sessionStorage.setItem('storecore.demo.generation', String(this.customerGeneration)); else sessionStorage.removeItem('storecore.demo.generation');
      this.error.set(''); return true;
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); return false; }
  }
  validateCustomerSession(): void {
    if (!this.authorizationReadable || this.customerGeneration === null) throw new Error('Iniciá una nueva sesión Demo.');
    if (this.persistedRaw !== null && this.persistence.raw() === null) throw new Error('Los datos guardados desaparecieron. Recargá la Demo.');
    const current = this.persistence.current(this.commerce.snapshot); const access = current.actors.find(value => value.id === this.actorId())?.access;
    if (!access?.state.permitsAccess || access.generation !== this.customerGeneration) throw new Error('La sesión Demo fue revocada. Iniciá sesión nuevamente.');
  }
  private revokeAffectedSession(): void { if (this.context() === DemoContext.Customer) { try { this.validateCustomerSession(); } catch { this.logout(); } } }
  changeCustomerAccount(id: string, command: CustomerAccountCommand, reason: string): boolean { if (this.context() !== DemoContext.Admin || !CustomerAdministrationAuthority.canWrite(this.role())) { this.error.set('Acceso denegado.'); return false; } return this.run(() => this.commerce.changeCustomerAccount(this.role(), id, command, reason), 'Estado de la cuenta guardado en esta Demo.'); }
  logout(): void { this.sessionEpoch.update(value => value + 1); this.customerGeneration = null; this.role.set(UserRole.Unknown); this.context.set(DemoContext.Unknown); sessionStorage.removeItem('storecore.demo.context'); sessionStorage.removeItem('storecore.demo.actor'); sessionStorage.removeItem('storecore.demo.generation'); sessionStorage.removeItem('storecore.demo.role'); this.message.set('Sesión demo cerrada.'); }
  reset(): boolean {
    if (!this.canResetDemo) { this.error.set('El rol Operador no puede restablecer los datos Demo.'); return false; }
    try {
      let storedRevision = this.persistedRevision;
      try { storedRevision = this.persistence.revisionOr(storedRevision); } catch { /* Reset repairs corrupt persistence. */ }
      const next = demoSeed(); next.revision = Math.max(storedRevision, this.persistedRevision) + 1;
      next.actors.forEach(actor => { if (actor.access) actor.access.generation = next.revision; });
      const persisted = this.persistence.replace(next);
      this.commerce.snapshot = persisted.snapshot; this.persistedRevision = persisted.snapshot.revision; this.persistedRaw = persisted.raw;
      this.authorizationReadable = true;
      this.actorId.set('cliente'); this.logout(); this.scenario.set(DemoScenario.Approved); this.revision.update(value => value + 1); this.error.set(''); this.message.set('Demostración restablecida.');
      return true;
    } catch { this.error.set('No se pudo restablecer la demostración.'); return false; }
  }
}
