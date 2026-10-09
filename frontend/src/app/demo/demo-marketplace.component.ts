import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoApplicationState } from './demo-state';
import { DemoMLTab, DemoSyncStatus, type DemoCompetitor } from './demo-process-types';
import { DemoMLAccountStatus, DemoMappingStatus, DemoObservationStatus, competitorFreshness, ensureMarketplace, ensureCompetitorDetails, type DemoVariantMapping } from './demo-marketplace';

@Component({ selector: 'sc-demo-marketplace', imports: [FormsModule], templateUrl: './demo-marketplace.html', styleUrl: './demo.scss' })
export class DemoMarketplaceComponent {
  @Input() tab = DemoMLTab.Account;
  readonly state = inject(DemoApplicationState);
  readonly Tab = DemoMLTab;
  readonly Account = DemoMLAccountStatus;
  readonly Mapping = DemoMappingStatus;
  readonly Observation = DemoObservationStatus;
  readonly Sync = DemoSyncStatus;
  sku = 'DEMO-001'; variantId = 'DEMO-001:standard'; listingId = 'SIM-DEMO-001'; variationId = 'SIM-DEMO-001:standard';
  selectedHistory = '';
  mappingError = '';
  get market() { return ensureMarketplace(this.state.data); }
  get variants() { return this.state.commerce.variants(this.sku); }
  get debt() { return this.market.queue.filter(value => value.status === DemoSyncStatus.Queued || value.status === DemoSyncStatus.Failed).length; }
  money(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value / 100); }
  changeProduct(): void { this.variantId = this.variants[0].id; this.listingId = `SIM-${this.sku}`; this.variationId = `SIM-${this.variantId}`; }
  account(status: DemoMLAccountStatus): void { this.state.run(() => this.state.commerce.setMLAccount(status), 'Estado del canal de muestra actualizado.'); }
  save(): void { this.mappingError = ''; if (!this.state.run(() => this.state.commerce.mapML(this.sku, this.variantId, this.listingId.trim(), this.variationId.trim()), 'Mapping explícito guardado.')) { this.mappingError = this.state.error(); document.getElementById('mapping-listing')?.focus(); } }
  unlink(mapping: DemoVariantMapping): void { this.state.run(() => this.state.commerce.unlinkML(mapping.id), 'Variante desvinculada; se conserva el historial.'); }
  edit(mapping: DemoVariantMapping): void { this.sku = mapping.sku; this.variantId = mapping.variantId; this.listingId = mapping.listingId; this.variationId = mapping.variationId; document.getElementById('mapping-listing')?.focus(); }
  process(fail = false): void { this.state.run(() => this.state.commerce.processStock(fail), fail ? 'Fallo simulado registrado; se conserva la deuda.' : 'Cola procesada con respuestas de muestra.'); }
  newSale(mapping: DemoVariantMapping): void { this.state.run(() => this.state.commerce.mlSale(mapping.sku, `variant-sale-${mapping.id}-${crypto.randomUUID()}`, mapping.variantId), 'Nueva venta de muestra registrada.'); }
  sale(mapping: DemoVariantMapping): void { const operation = this.state.data.movements.filter(value => value.id.startsWith(`variant-sale-${mapping.id}-`)).at(-1)?.id ?? `variant-sale-${mapping.id}-initial`; this.state.run(() => this.state.commerce.mlSale(mapping.sku, operation, mapping.variantId), 'Evento de venta de muestra aplicado una sola vez.'); }
  details(value: DemoCompetitor) { return ensureCompetitorDetails(value, this.state.data); }
  freshness(value: DemoCompetitor) { return competitorFreshness(value, this.state.data, new Date().toISOString()); }
  observation(value: DemoCompetitor, status: DemoObservationStatus): void { this.state.run(() => { this.details(value).availability = status; this.state.commerce.touch(); }, 'Disponibilidad de la fuente de muestra actualizada.'); }
  refresh(value: DemoCompetitor): void { this.state.run(() => this.state.commerce.competitorPrice(value.id, value.price, `refresh-${crypto.randomUUID()}`), 'Observación de muestra renovada sin cambiar precios propios.'); }
  replay(value: DemoCompetitor): void { const last = this.details(value).observations.at(-1)!; this.state.run(() => this.state.commerce.competitorPrice(value.id, last.price, last.operation), 'Evento repetido: no genera otra alerta.'); }
  difference(value: DemoCompetitor): string { const details = this.details(value); const own = this.state.commerce.variantPrice(value.sku!, details.variantId); return `${((value.price - own) * 100 / own).toFixed(1)}% frente al precio propio`; }
}
