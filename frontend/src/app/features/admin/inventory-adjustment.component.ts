import { afterEveryRender, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryBalance, InventoryBalanceProjection, ReviewInventoryAdjustmentStep } from '../../domain/user/inventory-adjustment';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';
import { InventoryRow } from '../../domain/user/user.entity';
@Component({
  selector: 'sc-inventory-adjustment', imports: [AsyncPipe, FormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.vm$ | async; as state) {
      @if (state.pending && !state.visible) {
        <aside class="pending" role="status"><p>Hay un ajuste pendiente de comprobar {{ state.pendingSku }}.</p><button type="button" (click)="store.reopen()">Abrir recuperación del ajuste</button></aside>
      }
      <dialog #dialog aria-labelledby="adjustment-title" aria-describedby="adjustment-description" (cancel)="close($event)" (keydown)="trap($event)">
        <div class="adjustment">
          <header><div><p>Inventario WEB</p><h2 id="adjustment-title" tabindex="-1">{{ state.phase.label }}</h2></div><button type="button" (click)="store.close()" aria-label="Cerrar ajuste">Cerrar</button></header>
          <p id="adjustment-description">Disponible ya descuenta reservas. Este ajuste modifica disponible; no libera reservas ni cambia seguridad.</p>
          @if (state.row) { <p class="identity"><strong>{{ state.row.sku }}</strong><br>{{ state.row.productName }} · {{ state.row.variantLabel }}</p> }
          @if (state.message) { <p id="adjustment-error" [attr.role]="state.phase.applied ? 'status' : 'alert'">{{ state.message }}</p> }
          @if (state.balance; as balance) {
            <dl class="balances"><div><dt>Disponible revisado</dt><dd>{{ balance.available }}</dd></div><div><dt>Reservado</dt><dd>{{ balance.reserved }}</dd></div><div><dt>Seguridad</dt><dd>{{ balance.safety }}</dd></div><div><dt>Existencias revisadas</dt><dd>{{ onHand(balance) }}</dd></div><div><dt>Vendible revisado</dt><dd>{{ saleable(balance) }}</dd></div></dl>
          }
          @if (state.phase.canEdit) {
            <form (ngSubmit)="store.review()" novalidate>
              <label for="adjustment-delta">Variación de disponible</label>
              <input id="adjustment-delta" name="delta" type="text" inputmode="text" autocomplete="off" [ngModel]="state.delta" (ngModelChange)="store.change($event, state.reason)" [attr.aria-invalid]="state.invalidDelta" [attr.aria-describedby]="state.invalidDelta ? 'delta-help adjustment-error' : 'delta-help'">
              <p id="delta-help">Ingresá unidades enteras: +5 agrega cinco; −2 quita dos. No uses decimales.</p>
              <label for="adjustment-reason">Motivo del ajuste</label>
              <textarea id="adjustment-reason" name="reason" rows="3" [ngModel]="state.reason" (ngModelChange)="store.change(state.delta, $event)" [attr.aria-invalid]="state.invalidReason" [attr.aria-describedby]="state.invalidReason ? 'reason-help adjustment-error' : 'reason-help'"></textarea>
              <p id="reason-help">Obligatorio, de 1 a 500 caracteres. {{ state.reason.trim().length }}/500</p>
              @if (proposed(state.balance, state.delta); as after) { <p class="preview">Disponible resultante: <strong>{{ after.available }}</strong> · Existencias: {{ onHand(after) }} · Vendible: {{ saleable(after) }}</p> }
              <button type="submit">Revisar ajuste</button>
            </form>
          } @else if (state.phase.reviewing) {
            <p>Variación: <strong>{{ state.delta }}</strong></p><p>Motivo: {{ state.reason }}</p>
            @if (proposed(state.balance, state.delta); as after) { <dl class="balances"><div><dt>Disponible resultante</dt><dd>{{ after.available }}</dd></div><div><dt>Existencias resultantes</dt><dd>{{ onHand(after) }}</dd></div><div><dt>Vendible resultante</dt><dd>{{ saleable(after) }}</dd></div></dl> }
            <div class="actions"><button type="button" (click)="store.back()">Volver a editar</button><button type="button" (click)="store.confirm()">Confirmar ajuste</button></div>
          }
          @if (state.receipt; as receipt) {
            <p>Comando: {{ receipt.commandId }}<br>Registrado: {{ receipt.recordedAt }}</p>
            @if (receipt.after; as balance) { <h3>Saldos al aplicar</h3><dl class="balances"><div><dt>Disponible</dt><dd>{{ balance.available }}</dd></div><div><dt>Reservado</dt><dd>{{ balance.reserved }}</dd></div><div><dt>Seguridad</dt><dd>{{ balance.safety }}</dd></div><div><dt>Existencias</dt><dd>{{ onHand(balance) }}</dd></div><div><dt>Vendible</dt><dd>{{ saleable(balance) }}</dd></div></dl> }
            @if (state.phase.conflict) {
              @if (receipt.before; as current) { <h3>Saldo observado al rechazar</h3><dl class="balances"><div><dt>Disponible</dt><dd>{{ current.available }}</dd></div><div><dt>Reservado</dt><dd>{{ current.reserved }}</dd></div><div><dt>Seguridad</dt><dd>{{ current.safety }}</dd></div></dl> }
              <p>La variación y el motivo se conservan. Actualizá inventario antes de revisar otra vez.</p>
              <div class="actions"><button type="button" (click)="refresh.emit()">Actualizar saldo actual</button><button type="button" [disabled]="!fresh || !currentRow" (click)="store.reviewConflict(currentRow, fresh)">Revisar con saldo actual</button></div>
            }
          }
          @if (state.phase.busy) { <p role="status">{{ state.phase.label }} Cerrar el panel conserva el intento; no cancela el envío.</p> }
          @if (state.pending && !state.phase.busy) { <div class="actions"><button type="button" (click)="store.recover()">Comprobar resultado</button>@if (state.phase.canRecover && state.canWrite) { <button type="button" (click)="store.replay()">Reenviar el mismo intento</button> }</div> }
        </div>
      </dialog>
    }
  `,
  styles: `:host{display:block;min-width:0}dialog{width:min(40rem,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);box-sizing:border-box;border:1px solid var(--sc-color-line);border-radius:1rem;padding:0;color:var(--sc-color-ink);background:var(--sc-color-surface)}dialog::backdrop{background:rgb(0 0 0/.45)}.adjustment{padding:1.5rem;overflow-wrap:anywhere}header{display:flex;align-items:start;justify-content:space-between;gap:1rem}h2{margin:.3rem 0 1rem}button,input,textarea{font:inherit;box-sizing:border-box}button{min-height:44px;padding:.65rem 1rem;border:1px solid var(--sc-color-line-strong);border-radius:.5rem;color:var(--sc-color-theme);background:var(--sc-color-surface);cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--sc-color-focus);outline-offset:3px}form{display:grid;gap:.6rem}input,textarea{width:100%;min-width:0;min-height:44px;padding:.7rem;border:1px solid var(--sc-color-line-strong);background:var(--sc-color-surface);color:inherit;border-radius:.4rem}textarea{resize:vertical}label{font-weight:600}.balances{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem}.balances div{padding:.7rem;background:var(--sc-color-muted);border-radius:.5rem}.balances dd{margin:.5rem 0 0;font-weight:700}.actions{display:flex;flex-wrap:wrap;gap:.75rem}.pending{padding:1rem;border:1px solid var(--sc-color-info);border-radius:.5rem;margin-block:1rem}#adjustment-error{padding:1rem;background:var(--sc-color-info-soft)}@media(max-width:480px){.adjustment{padding:1rem}.balances{grid-template-columns:1fr}header{flex-wrap:wrap}.actions button{width:100%}}`,
})
export class InventoryAdjustmentComponent {
  @Input() rows: readonly InventoryRow[] = [];
  @Input() fresh = false;
  @Output() readonly refresh = new EventEmitter<void>();
  get currentRow(): InventoryRow | undefined { return this.rows.find(row => row.variantId === this.store.snapshot.row?.variantId); }
  @ViewChild('dialog') private dialog?: ElementRef<HTMLDialogElement>;
  private opener: HTMLElement | null = null;
  private focusKey = '';
  constructor(readonly store: InventoryAdjustmentStore) {
    afterEveryRender(() => {
      const dialog = this.dialog?.nativeElement; if (!dialog) return;
      const state = this.store.snapshot;
      if (state.visible && !dialog.open) { this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.showModal(); this.focusKey = ''; }
      if (!state.visible && dialog.open) { dialog.close(); const destination = this.opener?.isConnected ? this.opener : document.getElementById('inv-title'); destination?.focus(); }
      const key = `${state.phase.wire}:${state.message}`;
      if (state.visible && key !== this.focusKey) { this.focusKey = key; (dialog.querySelector<HTMLElement>('[aria-invalid="true"]') ?? dialog.querySelector<HTMLElement>('#adjustment-title'))?.focus(); }
    });
  }
  close(event: Event): void { event.preventDefault(); this.store.close(); }
  trap(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const elements = Array.from(this.dialog?.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
    const index = elements.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); elements.at(-1)?.focus(); }
    else if (!event.shiftKey && index === elements.length - 1) { event.preventDefault(); elements[0]?.focus(); }
  }
  proposed(balance: InventoryBalance | null, raw: string): InventoryBalance | null { return balance ? new ReviewInventoryAdjustmentStep().proposed(balance, raw) : null; }
  saleable(balance: InventoryBalance): number { return InventoryBalanceProjection.saleable(balance); }
  onHand(balance: InventoryBalance): number { return InventoryBalanceProjection.onHand(balance); }
}
