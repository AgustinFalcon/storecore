import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DemoApplicationState } from './demo-state';
import { DemoContext } from './demo-model';
import { DemoAlert, DemoAlertCategory, DemoAlertFilter, DemoAlertRead, DemoInboxPolicy } from './demo-inbox';

@Component({ selector: 'sc-demo-inbox', imports: [FormsModule], template: `
<section class="inbox" aria-label="Centro de notificaciones"><h2>Notificaciones <span>{{ unread }} sin leer</span></h2>
<p>Historial guardado para {{ admin ? 'la administración' : 'tu cuenta' }} en esta demostración.</p>
<div class="tools"><label>Mostrar notificaciones<select data-cta="inbox-filter" [ngModel]="filter.wire" (ngModelChange)="select($event)">@for (entry of Filter.all; track entry.wire) { <option [value]="entry.wire">{{ entry.label }}</option> }</select></label><button data-cta="inbox-read-all" [disabled]="!unread" (click)="markAll()">Marcar todas como leídas</button></div>
<details><summary data-cta="inbox-preferences">Preferencias de notificaciones</summary><p>Al pausar una categoría, se conserva el historial y dejan de entrar nuevos avisos.</p>@for (category of categories; track category.wire) { <label class="check"><input type="checkbox" [attr.data-cta]="'inbox-preference-' + category.wire" [ngModel]="enabled(category)" (ngModelChange)="preference(category,$event)"/>{{ category.label }}</label> }</details>
<div class="alert-list">@for (alert of rows; track alert.id) { <article><div><strong>{{ alert.text }}</strong><small>{{ alert.category.label }} · {{ alert.created }} · {{ alert.read.label }} · {{ alert.resolution.label }}</small></div><div class="actions"><button [attr.data-cta]="'inbox-open-' + alert.id" (click)="open(alert)">Ver contexto</button><button [attr.data-cta]="'inbox-read-' + alert.id" [disabled]="alert.read === Read.Unknown" (click)="mark(alert)">{{ alert.read === Read.Unread ? 'Marcar leída' : 'Marcar sin leer' }}</button></div></article> } @empty { <p>No hay notificaciones en este filtro.</p> }</div></section>
`, styles: [`:host{display:block}.inbox{padding:1.25rem;border:1px solid #ccd8df;border-radius:16px;margin:1rem 0;background:#fff;overflow-wrap:anywhere}h2 span{font-size:.85rem;background:#e3f0f3;padding:.4rem;border-radius:8px}.tools,.actions{display:flex;flex-wrap:wrap;align-items:center;gap:.7rem}label{display:block}select,button,summary{min-height:44px;padding:.7rem;font:inherit}button{background:#164759;color:white;border:0;border-radius:8px;cursor:pointer}button:disabled{opacity:.6;cursor:default}select{display:block;border:1px solid #657f8c;border-radius:8px}.check{display:flex;align-items:center;gap:.7rem;min-height:44px}input{width:20px;height:20px}summary{cursor:pointer;font-weight:600}details{margin:1rem 0}.alert-list{max-height:420px;overflow:auto}article{padding:1rem 0;border-top:1px solid #d7e0e5}small{display:block;color:#465c68;margin:.6rem 0}:focus-visible{outline:3px solid #a85204;outline-offset:3px}@media(max-width:600px){.inbox{padding:1rem}.tools,button,select{width:100%;box-sizing:border-box}h2 span{display:inline-block;margin-top:.5rem}}`] })
export class DemoInboxComponent {
  readonly state = inject(DemoApplicationState); readonly router = inject(Router); readonly policy = new DemoInboxPolicy();
  readonly Read = DemoAlertRead; readonly Filter = DemoAlertFilter;
  filter = DemoAlertFilter.Unread;
  get admin(): boolean { return this.state.context() === DemoContext.Admin; }
  get audience(): string { return this.policy.audience(this.admin, this.state.actorId()); }
  get all(): DemoAlert[] { return this.state.context() === DemoContext.Unknown ? [] : this.policy.visible(this.state.data, this.audience); }
  get rows(): DemoAlert[] { return this.all.filter(value => this.filter.matches(value.read)); }
  get unread(): number { return this.all.filter(value => value.read === DemoAlertRead.Unread).length; }
  get categories(): DemoAlertCategory[] { return this.admin ? DemoAlertCategory.all : [DemoAlertCategory.Orders, DemoAlertCategory.PostSale]; }
  select(raw: unknown): void { this.filter = DemoAlertFilter.fromWire(raw); }
  enabled(category: DemoAlertCategory): boolean { return this.policy.enabled(this.state.data, this.audience, category); }
  preference(category: DemoAlertCategory, enabled: boolean): void { this.state.run(() => { this.policy.preference(this.state.commerce.snapshot, this.audience, category, enabled); this.state.commerce.touch(); }, 'Preferencias guardadas.'); }
  mark(alert: DemoAlert): void { this.state.run(() => { this.policy.mark(this.state.commerce.snapshot, this.audience, alert.id, alert.read === DemoAlertRead.Unread ? DemoAlertRead.Read : DemoAlertRead.Unread); this.state.commerce.touch(); }, 'Estado de lectura guardado.'); }
  markAll(): void { this.state.run(() => { for (const alert of this.all) this.policy.mark(this.state.commerce.snapshot, this.audience, alert.id, DemoAlertRead.Read); this.state.commerce.touch(); }, 'Notificaciones marcadas como leídas.'); }
  open(alert: DemoAlert): void {
    if (!this.all.some(value => value.id === alert.id)) return;
    if (alert.read === DemoAlertRead.Unread) this.mark(alert);
    if (alert.orderId) { if (!this.state.data.orders.some(order => order.id === alert.orderId && (this.admin || order.actor === this.state.actorId()))) return; void this.router.navigate([this.admin ? '/demo/user/orders' : '/demo/customer/orders', alert.orderId]); }
    else if (this.admin && alert.category === DemoAlertCategory.Stock) void this.router.navigate(['/demo/user/inventory'], { queryParams: { q: alert.sku } });
    else if (this.admin && alert.category === DemoAlertCategory.Marketplace) void this.router.navigate(['/demo/user/mercadolibre']);
  }
}
