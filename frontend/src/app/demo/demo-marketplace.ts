import type { DemoSnapshot } from './demo-model';
import { DemoSyncStatus, type DemoCompetitor } from './demo-process-types';

export class DemoMLAccountStatus {
  private constructor(readonly wire: string, readonly label: string, readonly action: string, readonly canProcess = false) {}
  static readonly Disconnected = new DemoMLAccountStatus('disconnected', 'Desconectada', 'Autorizar cuenta de muestra');
  static readonly Authorized = new DemoMLAccountStatus('authorized', 'Autorizada (simulada)', 'Pausar canal', true);
  static readonly Expired = new DemoMLAccountStatus('expired', 'Autorización de muestra vencida', 'Renovar autorización de muestra');
  static readonly Error = new DemoMLAccountStatus('error', 'Error de cuenta simulado', 'Recuperar cuenta de muestra');
  static readonly Paused = new DemoMLAccountStatus('paused', 'Canal pausado', 'Reanudar canal simulado');
  static readonly Unknown = new DemoMLAccountStatus('', 'Cuenta desconocida', 'Restablecer demostración');
  static readonly all = [this.Disconnected, this.Authorized, this.Expired, this.Error, this.Paused];
  static fromWire(raw: unknown): DemoMLAccountStatus { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoMappingStatus {
  private constructor(readonly wire: string, readonly label: string, readonly eligible = false) {}
  static readonly Linked = new DemoMappingStatus('linked', 'Vinculado', true);
  static readonly Unlinked = new DemoMappingStatus('unlinked', 'Sin vincular');
  static readonly Conflict = new DemoMappingStatus('conflict', 'Conflicto de mapping');
  static readonly Unknown = new DemoMappingStatus('', 'Vínculo desconocido');
  static fromWire(raw: unknown): DemoMappingStatus { return [this.Linked, this.Unlinked, this.Conflict].find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoObservationStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Recent = new DemoObservationStatus('recent', 'Observación reciente');
  static readonly Stale = new DemoObservationStatus('stale', 'Datos desactualizados');
  static readonly Unavailable = new DemoObservationStatus('unavailable', 'Fuente de muestra no disponible');
  static readonly Unknown = new DemoObservationStatus('', 'Observación desconocida');
  static readonly all = [this.Recent, this.Stale, this.Unavailable];
  static fromWire(raw: unknown): DemoObservationStatus { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export interface DemoVariantMapping { id: string; sku: string; variantId: string; listingId: string; variationId: string; status: DemoMappingStatus; local: number; desired: number; desiredAt: string; observed?: number; observedAt?: string; confirmed?: number; confirmedAt?: string; generation: number; }
export interface DemoMLQueueEntry { id: string; mappingId: string; generation: number; desired: number; status: DemoSyncStatus; created: string; attempts: number; lastAttempt?: string; error: string; }
export interface DemoMarketState { account: DemoMLAccountStatus; accountAt: string; mappings: DemoVariantMapping[]; queue: DemoMLQueueEntry[]; }
export interface DemoCompetitorObservation { operation: string; price: number; at: string; }
export class DemoMarketSignalRead {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Unread = new DemoMarketSignalRead('unread', 'Sin leer');
  static readonly Read = new DemoMarketSignalRead('read', 'Leída');
  static readonly Unknown = new DemoMarketSignalRead('', 'Lectura desconocida');
  static fromWire(raw: unknown): DemoMarketSignalRead { return [this.Unread, this.Read].find(value => value.wire === raw) ?? this.Unknown; }
}
export interface DemoCompetitorSignal { operation: string; at: string; percent: number; read: DemoMarketSignalRead; }
export interface DemoCompetitorDetails { source: string; variantId: string; observedAt: string; availability: DemoObservationStatus; observations: DemoCompetitorObservation[]; signals: DemoCompetitorSignal[]; }

const date = (raw: unknown): raw is string => typeof raw === 'string' && Number.isFinite(Date.parse(raw));
const quantity = (raw: unknown): raw is number => Number.isSafeInteger(raw) && Number(raw) >= 0;
const stamp = '2026-10-09T10:00:00.000Z';
export function ensureMarketplace(state: DemoSnapshot, now = stamp): DemoMarketState {
  if (!state.marketplace) {
    state.marketplace = { account: state.mlConnected ? DemoMLAccountStatus.Authorized : DemoMLAccountStatus.Disconnected, accountAt: now, mappings: [], queue: [] };
    for (const listing of state.listings) {
      const product = state.products.find(value => value.sku === listing.sku);
      const variant = product?.variants?.[0];
      if (!variant) continue;
      const local = product!.active && variant.active ? variant.onHand - variant.reserved : 0;
      state.marketplace.mappings.push({ id: `mapping-${variant.id}`, sku: product!.sku, variantId: variant.id, listingId: `SIM-${product!.sku}`, variationId: `SIM-${variant.id}`, status: listing.linked ? DemoMappingStatus.Linked : DemoMappingStatus.Unlinked, local, desired: local, desiredAt: now, generation: 0 });
    }
    new DemoMarketplaceProjection().refresh(state, now);
  }
  return state.marketplace;
}

/** A projection records debt even when authorization or processing is paused. */
export class DemoMarketplaceProjection {
  refresh(state: DemoSnapshot, now: string): void {
    const market = state.marketplace!;
    for (const mapping of market.mappings) {
      const product = state.products.find(value => value.sku === mapping.sku);
      const variant = product?.variants?.find(value => value.id === mapping.variantId);
      if (!variant) { mapping.status = DemoMappingStatus.Conflict; continue; }
      mapping.local = product!.active && variant.active ? variant.onHand - variant.reserved : 0;
      if (mapping.status !== DemoMappingStatus.Linked) continue;
      if (mapping.desired !== mapping.local) { mapping.desired = mapping.local; mapping.desiredAt = now; mapping.generation++; for (const entry of market.queue.filter(value => value.mappingId === mapping.id && (value.status === DemoSyncStatus.Queued || value.status === DemoSyncStatus.Failed))) entry.status = DemoSyncStatus.Superseded; }
      if (mapping.confirmed === mapping.desired || market.queue.some(value => value.mappingId === mapping.id && value.generation === mapping.generation)) continue;
      for (const entry of market.queue.filter(value => value.mappingId === mapping.id && (value.status === DemoSyncStatus.Queued || value.status === DemoSyncStatus.Failed))) entry.status = DemoSyncStatus.Superseded;
      market.queue.push({ id: `projection-${mapping.id}-${mapping.generation}`, mappingId: mapping.id, generation: mapping.generation, desired: mapping.desired, status: DemoSyncStatus.Queued, created: now, attempts: 0, error: '' });
    }
    state.mlConnected = market.account === DemoMLAccountStatus.Authorized;
    for (const listing of state.listings) {
      const mapping = market.mappings.find(value => value.sku === listing.sku);
      if (!mapping) continue;
      listing.linked = mapping.status === DemoMappingStatus.Linked; listing.desired = mapping.desired; listing.observed = mapping.observed; listing.confirmed = mapping.confirmed;
      listing.error = market.queue.some(value => value.mappingId === mapping.id && value.status === DemoSyncStatus.Failed);
    }
  }
}
export class DemoMarketplaceMapping {
  save(state: DemoSnapshot, sku: string, variantId: string, listingId: string, variationId: string, now: string): void {
    const market = ensureMarketplace(state, now);
    if (market.account === DemoMLAccountStatus.Unknown) throw new Error('Restablecé la cuenta de muestra desconocida.');
    const variant = state.products.find(value => value.sku === sku)?.variants?.find(value => value.id === variantId);
    if (!variant || !/^SIM-[\w:-]{1,80}$/.test(listingId) || !/^SIM-[\w:-]{1,80}$/.test(variationId)) throw new Error('Seleccioná una variante y una identidad de muestra SIM- válida.');
    if (market.mappings.some(value => value.variantId !== variantId && value.status !== DemoMappingStatus.Unlinked && value.listingId === listingId && value.variationId === variationId)) throw new Error('Conflicto: esta publicación/variación ya identifica otra variante. Elegí una identidad distinta.');
    let mapping = market.mappings.find(value => value.variantId === variantId);
    if (mapping?.status === DemoMappingStatus.Unknown) throw new Error('Restablecé el vínculo desconocido.');
    if (!mapping) { mapping = { id: `mapping-${variantId}`, sku, variantId, listingId, variationId, status: DemoMappingStatus.Linked, local: 0, desired: 0, desiredAt: now, generation: 0 }; market.mappings.push(mapping); }
    else { mapping.listingId = listingId; mapping.variationId = variationId; mapping.status = DemoMappingStatus.Linked; mapping.confirmed = undefined; mapping.confirmedAt = undefined; mapping.observed = undefined; mapping.observedAt = undefined; mapping.generation++; }
    new DemoMarketplaceProjection().refresh(state, now);
  }
  unlink(state: DemoSnapshot, id: string): void { const market = ensureMarketplace(state); const mapping = market.mappings.find(value => value.id === id); if (!mapping || mapping.status === DemoMappingStatus.Unknown) throw new Error('Vínculo no disponible.'); mapping.status = DemoMappingStatus.Unlinked; for (const entry of market.queue.filter(value => value.mappingId === id && (value.status === DemoSyncStatus.Queued || value.status === DemoSyncStatus.Failed))) entry.status = DemoSyncStatus.Superseded; }
}
/** Only a successful simulator response advances observed and confirmed. */
export class DemoMarketplaceProcessor {
  process(state: DemoSnapshot, now: string, fail = false): void {
    const market = ensureMarketplace(state, now);
    if (!market.account.canProcess) throw new Error(`${market.account.label}. ${market.account.action}. La deuda de stock permanece en cola.`);
    market.accountAt = now;
    new DemoMarketplaceProjection().refresh(state, now);
    for (const entry of market.queue) {
      if (entry.status !== DemoSyncStatus.Queued && entry.status !== DemoSyncStatus.Failed) continue;
      const mapping = market.mappings.find(value => value.id === entry.mappingId);
      if (!mapping?.status.eligible || mapping.generation !== entry.generation || mapping.desired !== entry.desired) { entry.status = DemoSyncStatus.Superseded; continue; }
      entry.attempts++; entry.lastAttempt = now;
      entry.status = fail ? DemoSyncStatus.Failed : DemoSyncStatus.Confirmed; entry.error = fail ? 'Respuesta de muestra fallida. Reintentá al recuperar el canal.' : '';
      if (!fail) { mapping.observed = entry.desired; mapping.confirmed = entry.desired; mapping.observedAt = now; mapping.confirmedAt = now; }
    }
    new DemoMarketplaceProjection().refresh(state, now);
  }
}
export function ensureCompetitorDetails(value: DemoCompetitor, state: DemoSnapshot): DemoCompetitorDetails {
  if (!value.details) {
    value.sku ??= state.products[0].sku; value.threshold ??= 1;
    value.details = { source: 'Fixture local de precios · solo lectura', variantId: state.products.find(product => product.sku === value.sku)!.variants![0].id, observedAt: stamp, availability: DemoObservationStatus.Recent, observations: value.history.map((price, index) => ({ operation: `legacy-${index}`, price, at: stamp })), signals: [] };
  }
  return value.details;
}
export function competitorFreshness(value: DemoCompetitor, state: DemoSnapshot, now: string): DemoObservationStatus {
  const details = ensureCompetitorDetails(value, state);
  if (details.availability !== DemoObservationStatus.Recent) return details.availability;
  return Date.parse(now) - Date.parse(details.observedAt) > 86400000 ? DemoObservationStatus.Stale : DemoObservationStatus.Recent;
}
export class DemoCompetitorObservationStep {
  apply(state: DemoSnapshot, id: string, price: number, operation: string, now: string): void {
    const value = state.competitors.find(candidate => candidate.id === id);
    if (!value || !Number.isSafeInteger(price) || price < 100 || !operation.trim()) throw new Error('Indicá competidor, precio y operación de muestra válidos.');
    const details = ensureCompetitorDetails(value, state);
    if (details.availability === DemoObservationStatus.Unknown) throw new Error('Restablecé la observación desconocida.');
    const existing = details.observations.find(item => item.operation === operation);
    if (existing) { if (existing.price !== price) throw new Error('La operación ya tiene otro precio.'); return; }
    const percent = Math.abs(price - value.price) * 100 / value.price;
    details.observations.push({ operation, price, at: now }); details.observedAt = now; details.availability = DemoObservationStatus.Recent;
    value.price = price; value.history.push(price);
    if (value.enabled !== false && percent >= (value.threshold ?? 1)) { details.signals.push({ operation, at: now, percent, read: DemoMarketSignalRead.Unread }); value.unread = true; }
  }
}

/** The snapshot boundary owns validation/rehydration; legacy v1-v4 get explicit sample IDs. */
export function decodeMarketplace(state: DemoSnapshot): void {
  const market = ensureMarketplace(state);
  if (!date(market.accountAt) || !Array.isArray(market.mappings) || !Array.isArray(market.queue)) throw new Error('Canal de muestra guardado inválido.');
  market.account = DemoMLAccountStatus.fromWire(market.account?.wire);
  const ids = new Set<string>(); const variants = new Set<string>();
  for (const mapping of market.mappings) {
    if (!mapping.id || ids.has(mapping.id) || variants.has(mapping.variantId) || !state.products.find(value => value.sku === mapping.sku)?.variants?.some(value => value.id === mapping.variantId) || !/^SIM-[\w:-]{1,80}$/.test(mapping.listingId) || !/^SIM-[\w:-]{1,80}$/.test(mapping.variationId) || !quantity(mapping.local) || !quantity(mapping.desired) || !quantity(mapping.generation) || !date(mapping.desiredAt) || (mapping.observed !== undefined && (!quantity(mapping.observed) || !date(mapping.observedAt))) || (mapping.confirmed !== undefined && (!quantity(mapping.confirmed) || !date(mapping.confirmedAt)))) throw new Error('Mapping de muestra guardado inválido.');
    ids.add(mapping.id); variants.add(mapping.variantId); mapping.status = DemoMappingStatus.fromWire(mapping.status?.wire);
  }
  for (const mapping of market.mappings) if (mapping.status === DemoMappingStatus.Linked && market.mappings.some(value => value.id !== mapping.id && value.status !== DemoMappingStatus.Unlinked && value.listingId === mapping.listingId && value.variationId === mapping.variationId)) mapping.status = DemoMappingStatus.Conflict;
  const jobs = new Set<string>();
  for (const entry of market.queue) { if (!entry.id || jobs.has(entry.id) || !ids.has(entry.mappingId) || !quantity(entry.desired) || !quantity(entry.generation) || !quantity(entry.attempts) || !date(entry.created) || (entry.lastAttempt !== undefined && !date(entry.lastAttempt)) || typeof entry.error !== 'string') throw new Error('Cola de muestra guardada inválida.'); jobs.add(entry.id); entry.status = DemoSyncStatus.fromWire(entry.status?.wire); }
  for (const value of state.competitors) {
    const details = ensureCompetitorDetails(value, state);
    if (!state.products.find(product => product.sku === value.sku)?.variants?.some(variant => variant.id === details.variantId) || typeof details.source !== 'string' || !date(details.observedAt) || !Number.isInteger(value.threshold) || value.threshold! < 1 || value.threshold! > 100 || !Array.isArray(details.observations) || !Array.isArray(details.signals) || details.observations.some(item => !item.operation || !Number.isSafeInteger(item.price) || item.price < 100 || !date(item.at)) || new Set(details.observations.map(item => item.operation)).size !== details.observations.length || details.signals.some(item => !details.observations.some(observation => observation.operation === item.operation) || !date(item.at) || !Number.isFinite(item.percent) || item.percent < 0)) throw new Error('Observaciones de competencia guardadas inválidas.');
    details.availability = DemoObservationStatus.fromWire(details.availability?.wire);
    details.signals.forEach(signal => signal.read = DemoMarketSignalRead.fromWire(signal.read?.wire));
  }
  state.mlConnected = market.account === DemoMLAccountStatus.Authorized;
}
