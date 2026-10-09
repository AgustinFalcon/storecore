import type { DemoSnapshot } from './demo-model';
import { PaymentStatus } from '../domain/order/payment-status';
import { DemoSyncStatus } from './demo-process-types';
import { DemoIncidentKind, ensureFulfillment } from './demo-fulfillment';
import { ensureCompetitorDetails } from './demo-marketplace';

export class DemoAlertCategory {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Orders = new DemoAlertCategory('orders', 'Pedidos y entregas');
  static readonly PostSale = new DemoAlertCategory('post-sale', 'Devoluciones y reembolsos');
  static readonly Stock = new DemoAlertCategory('stock', 'Inventario');
  static readonly Marketplace = new DemoAlertCategory('marketplace', 'Canales y competencia');
  static readonly Unknown = new DemoAlertCategory('', 'Alerta desconocida');
  static readonly all = [this.Orders, this.PostSale, this.Stock, this.Marketplace];
  static fromWire(raw: unknown): DemoAlertCategory { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoAlertRead {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Unread = new DemoAlertRead('unread', 'Sin leer');
  static readonly Read = new DemoAlertRead('read', 'Leída');
  static readonly Unknown = new DemoAlertRead('', 'Lectura desconocida');
  static fromWire(raw: unknown): DemoAlertRead { return [this.Read, this.Unread].find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoAlertResolution {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Active = new DemoAlertResolution('active', 'Requiere atención');
  static readonly Resolved = new DemoAlertResolution('resolved', 'Evento registrado / resuelto');
  static readonly Unknown = new DemoAlertResolution('', 'Resolución desconocida');
  static fromWire(raw: unknown): DemoAlertResolution { return [this.Active, this.Resolved].find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoAlertFilter {
  private constructor(readonly wire: string, readonly label: string, readonly matches: (read: DemoAlertRead) => boolean) {}
  static readonly All = new DemoAlertFilter('all', 'Historial completo', () => true);
  static readonly Unread = new DemoAlertFilter('unread', 'Sin leer', value => value === DemoAlertRead.Unread);
  static readonly Read = new DemoAlertFilter('read', 'Leídas', value => value === DemoAlertRead.Read);
  static readonly Unknown = new DemoAlertFilter('', 'Filtro desconocido', () => false);
  static readonly all = [this.All, this.Unread, this.Read];
  static fromWire(raw: unknown): DemoAlertFilter { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export interface DemoAlert { id: string; audience: string; category: DemoAlertCategory; read: DemoAlertRead; created: string; text: string; orderId?: string; sku?: string; resolution: DemoAlertResolution; }
export interface DemoInbox { alerts: DemoAlert[]; preferences: { audience: string; category: DemoAlertCategory; enabled: boolean }[]; }
export class DemoInboxPolicy {
  audience(admin: boolean, actor: string): string { return admin ? 'admin' : `customer:${actor}`; }
  visible(state: DemoSnapshot, audience: string): DemoAlert[] { return (state.inbox?.alerts ?? []).filter(value => value.audience === audience).slice().reverse(); }
  enabled(state: DemoSnapshot, audience: string, category: DemoAlertCategory): boolean { return state.inbox?.preferences.find(value => value.audience === audience && value.category === category)?.enabled !== false; }
  mark(state: DemoSnapshot, audience: string, id: string, read: DemoAlertRead): void { const alert = state.inbox?.alerts.find(value => value.id === id && value.audience === audience); if (!alert || read === DemoAlertRead.Unknown || alert.read === DemoAlertRead.Unknown || alert.category === DemoAlertCategory.Unknown) throw new Error('La alerta no pertenece al contexto actual.'); alert.read = read; }
  preference(state: DemoSnapshot, audience: string, category: DemoAlertCategory, enabled: boolean): void { if (category === DemoAlertCategory.Unknown) throw new Error('Categoría desconocida.'); state.inbox ??= { alerts: [], preferences: [] }; const entry = state.inbox.preferences.find(value => value.audience === audience && value.category === category); if (entry) entry.enabled = enabled; else state.inbox.preferences.push({ audience, category, enabled }); }
  /** Stable event IDs preserve read state across reloads and repeated reconciliation. */
  reconcile(state: DemoSnapshot, now: string): void {
    state.inbox ??= { alerts: [], preferences: [] };
    const add = (id: string, audience: string, category: DemoAlertCategory, text: string, resolved = false, orderId?: string, sku?: string) => {
      const existing = state.inbox!.alerts.find(value => value.id === `${audience}:${id}`);
      if (existing) { existing.resolution = resolved ? DemoAlertResolution.Resolved : DemoAlertResolution.Active; return; }
      if (this.enabled(state, audience, category)) state.inbox!.alerts.push({ id: `${audience}:${id}`, audience, category, read: DemoAlertRead.Unread, created: now, text, orderId, sku, resolution: resolved ? DemoAlertResolution.Resolved : DemoAlertResolution.Active });
    };
    for (const order of state.orders) {
      for (const audience of ['admin', this.audience(false, order.actor)]) {
        const fulfillment = ensureFulfillment(order);
        const incidentId = `${audience}:incident:${order.id}`;
        const existingIncident = state.inbox.alerts.find(value => value.id === incidentId);
        const pendingIncident = fulfillment.incident !== DemoIncidentKind.None && fulfillment.incident !== DemoIncidentKind.Unknown;
        if (pendingIncident) {
          const text = `${order.id} · ${fulfillment.incident.label}: ${fulfillment.incidentText}`;
          if (existingIncident && (existingIncident.resolution === DemoAlertResolution.Resolved || existingIncident.text !== text)) { existingIncident.read = DemoAlertRead.Unread; existingIncident.created = now; }
          add(`incident:${order.id}`, audience, DemoAlertCategory.Orders, text, false, order.id);
          if (existingIncident) existingIncident.text = text;
        } else if (existingIncident) existingIncident.resolution = DemoAlertResolution.Resolved;
        add(`payment:${order.id}`, audience, DemoAlertCategory.Orders, `${order.id} · Revisá el resultado del pago`, order.payment !== PaymentStatus.Pending, order.id);
        order.history.forEach((text, index) => add(`event:${order.id}:${index}`, audience, DemoAlertCategory.Orders, `${order.id} · ${text}`, true, order.id));
      }
    }
    for (const event of state.postSaleAlerts ?? []) for (const audience of ['admin', this.audience(false, event.actor)]) add(`return:${event.id}`, audience, DemoAlertCategory.PostSale, `${event.orderId} · ${event.text}`, true, event.orderId);
    for (const product of state.products) for (const variant of product.variants ?? []) {
      const available = variant.onHand - variant.reserved; const low = product.active && variant.active && available < state.settings.lowStockThreshold;
      const existing = state.inbox.alerts.find(value => value.id === `admin:stock:${variant.id}`);
      const text = `${product.name} · ${variant.name}: ${available} disponibles`;
      if (existing) {
        if (low && (existing.resolution === DemoAlertResolution.Resolved || existing.text !== text)) { existing.read = DemoAlertRead.Unread; existing.created = now; }
        existing.text = text;
        existing.resolution = low ? DemoAlertResolution.Active : DemoAlertResolution.Resolved;
      }
      if (low) add(`stock:${variant.id}`, 'admin', DemoAlertCategory.Stock, text, false, undefined, product.sku);
    }
    for (const job of state.syncJobs ?? []) if (job.status === DemoSyncStatus.Failed || state.inbox.alerts.some(value => value.id === `admin:sync:${job.id}`)) add(`sync:${job.id}`, 'admin', DemoAlertCategory.Marketplace, `${job.sku} · Revisá la sincronización simulada`, job.status !== DemoSyncStatus.Failed, undefined, job.sku);
    for (const competitor of state.competitors) { const details = ensureCompetitorDetails(competitor, state); for (const signal of details.signals) add(`competitor:${competitor.id}:${signal.operation}`, 'admin', DemoAlertCategory.Marketplace, `${competitor.name} · Cambio de precio de muestra ${signal.percent.toFixed(1)}%`, false, undefined, competitor.sku); if (competitor.unread && !details.signals.length) add(`competitor:${competitor.id}:${competitor.history.length}`, 'admin', DemoAlertCategory.Marketplace, `${competitor.name} · Cambio de precio de muestra`, false, undefined, competitor.sku); }
    if (state.marketplace) state.version = 5;
  }
}
export function decodeInbox(state: DemoSnapshot): void {
  state.inbox ??= { alerts: [], preferences: [] };
  const allowed = (audience: string) => audience === 'admin' || state.actors.some(actor => audience === `customer:${actor.id}`);
  if (!Array.isArray(state.inbox.alerts) || !Array.isArray(state.inbox.preferences)) throw new Error('Las alertas guardadas son inválidas.');
  for (const alert of state.inbox.alerts) {
    alert.category = DemoAlertCategory.fromWire(alert.category?.wire); alert.read = DemoAlertRead.fromWire(alert.read?.wire); alert.resolution = DemoAlertResolution.fromWire(alert.resolution?.wire);
    if (typeof alert.id !== 'string' || !alert.id || !allowed(alert.audience) || typeof alert.text !== 'string' || typeof alert.created !== 'string' || (alert.orderId && !state.orders.some(order => order.id === alert.orderId && (alert.audience === 'admin' || alert.audience === `customer:${order.actor}`))) || (alert.sku && !state.products.some(product => product.sku === alert.sku))) throw new Error('Destino de alerta inválido.');
  }
  if (new Set(state.inbox.alerts.map(value => value.id)).size !== state.inbox.alerts.length) throw new Error('Alerta duplicada.');
  for (const preference of state.inbox.preferences) { preference.category = DemoAlertCategory.fromWire(preference.category?.wire); if (!allowed(preference.audience) || typeof preference.enabled !== 'boolean') throw new Error('Preferencia de alerta inválida.'); }
}
