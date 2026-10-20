import { Injectable, signal } from '@angular/core';
import { DemoCommerce, DemoContext, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';
import { DemoInboxPolicy } from './demo-inbox';
import { DemoAccessIntent, validateDemoIdentity } from './demo-access';
import { DemoRole } from './demo-roles';
import { validDemoSession } from './demo-snapshot';

const STORAGE_KEY = 'storecore.commercial-demo.v1';
@Injectable({ providedIn: 'root' })
export class DemoApplicationState {
  readonly commerce = new DemoCommerce(demoSeed(), undefined, undefined, () => ({ actorId: this.actorId(), context: this.context() }));
  readonly revision = signal(0);
  readonly context = signal(DemoContext.Unknown);
  readonly actorId = signal('cliente');
  readonly scenario = signal(DemoScenario.Approved);
  readonly message = signal('');
  readonly error = signal('');
  private persistedRevision = 0;
  private persistedRaw: string | null = null;
  constructor() {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) this.commerce.snapshot = decodeSnapshot(raw); this.persistedRaw = raw; this.persistedRevision = this.commerce.snapshot.revision; } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo leer la demo guardada.'); }
    new DemoInboxPolicy().reconcile(this.commerce.snapshot, new Date().toISOString());
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) this.error.set('Los datos cambiaron en otra pestaña. Recargá antes de continuar.'); });
    const savedContext = DemoContext.fromWire(sessionStorage.getItem('storecore.demo.context'));
    const savedActor = sessionStorage.getItem('storecore.demo.actor') ?? 'cliente';
    if (validDemoSession(this.commerce.snapshot.actors.find(actor => actor.id === savedActor), savedContext)) { this.actorId.set(savedActor); this.context.set(savedContext); }
  }
  get data() { this.revision(); return this.commerce.snapshot; }
  get actor() { this.revision(); return this.commerce.actor(this.actorId()); }
  run(action: () => void, result: string): boolean {
    if (!validDemoSession(this.data.actors.find(actor => actor.id === this.actorId()), this.context())) { this.error.set('Ingresá con un perfil de muestra autorizado.'); return false; }
    return this.transact(action, result);
  }
  private transact(action: () => void, result: string): boolean {
    this.error.set(''); this.message.set('');
    const before = JSON.stringify(this.commerce.snapshot);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== this.persistedRaw || (raw && decodeSnapshot(raw).revision !== this.persistedRevision)) throw new Error('Los datos cambiaron en otra pestaña. Recargá antes de guardar.');
      action(); new DemoInboxPolicy().reconcile(this.commerce.snapshot, new Date().toISOString()); const nextRaw = JSON.stringify(this.commerce.snapshot); localStorage.setItem(STORAGE_KEY, nextRaw); this.persistedRaw = nextRaw; this.persistedRevision = this.commerce.snapshot.revision;
      this.revision.update(value => value + 1); this.message.set(result); return true;
    } catch (error) { this.commerce.snapshot = decodeSnapshot(before); this.revision.update(value => value + 1); this.error.set(error instanceof Error ? error.message : 'No se pudo completar la operación.'); return false; }
  }
  rememberIntent(path: string): void { const intent = DemoAccessIntent.fromWire(path); if (intent !== DemoAccessIntent.Unknown) sessionStorage.setItem('storecore.demo.intent', intent.path); }
  consumeIntent(): string { const intent = DemoAccessIntent.fromWire(sessionStorage.getItem('storecore.demo.intent')); sessionStorage.removeItem('storecore.demo.intent'); return intent.destination(this.data, this.actorId(), this.context()); }
  registerCustomer(email: string, firstName: string, lastName: string): string | null {
    const normalized = email.trim().toLowerCase(), id = crypto.randomUUID();
    const error = validateDemoIdentity(normalized, firstName, lastName);
    if (error) { this.error.set(error); return null; }
    return this.transact(() => {
      if (this.data.actors.some(actor => actor.email.trim().toLowerCase() === normalized)) throw new Error('Email: ya existe un perfil comprador de muestra con esta dirección.');
      this.data.actors.push({ id, email: normalized, firstName: firstName.trim(), lastName: lastName.trim(), phone: '', role: DemoRole.Customer, addresses: [], cart: [], favorites: [] });
      this.data.revision++;
    }, 'Perfil de muestra creado.') ? id : null;
  }
  login(context: DemoContext, actor = 'cliente'): void { if (!validDemoSession(this.data.actors.find(value => value.id === actor), context)) throw new Error('El perfil no está autorizado para esa experiencia.'); this.actorId.set(actor); this.context.set(context); sessionStorage.setItem('storecore.demo.context', context.wire); sessionStorage.setItem('storecore.demo.actor', actor); this.error.set(''); }
  logout(): void { this.context.set(DemoContext.Unknown); sessionStorage.removeItem('storecore.demo.context'); sessionStorage.removeItem('storecore.demo.actor'); this.message.set('Sesión demo cerrada.'); }
  reset(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let storedRevision = this.persistedRevision;
      if (raw) { try { storedRevision = decodeSnapshot(raw).revision; } catch { /* Reset repairs corrupt persistence. */ } }
      const next = demoSeed(); next.revision = Math.max(storedRevision, this.persistedRevision) + 1;
      new DemoInboxPolicy().reconcile(next, new Date().toISOString());
      const nextRaw = JSON.stringify(next); localStorage.setItem(STORAGE_KEY, nextRaw);
      this.commerce.snapshot = next; this.persistedRevision = next.revision; this.persistedRaw = nextRaw;
      this.actorId.set('cliente'); this.logout(); this.scenario.set(DemoScenario.Approved); this.revision.update(value => value + 1); this.error.set(''); this.message.set('Demostración restablecida.');
    } catch { this.error.set('No se pudo restablecer la demostración.'); }
  }
}
