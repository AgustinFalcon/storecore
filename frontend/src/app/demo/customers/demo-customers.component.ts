import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoApplicationState } from '../demo-state';
import { DemoActor, DemoContext } from '../demo-model';
import { trapDemoDialogFocus } from '../demo-dialog-focus';
import { CustomerAccountCommand, CustomerAccountFilter, CustomerAccountQuery, CustomerAccountState, CustomerAdministrationAuthority } from './customer-account';

@Component({ selector: 'sc-demo-customers', imports: [FormsModule, RouterLink], templateUrl: './demo-customers.html', styleUrls: ['../demo.scss', './demo-customers.scss'] })
export class DemoCustomersComponent {
  readonly trapFocus = trapDemoDialogFocus;
  readonly state = inject(DemoApplicationState);
  readonly AccountState = CustomerAccountState;
  readonly Command = CustomerAccountCommand;
  readonly filters = CustomerAccountFilter.all;
  readonly filter = signal(CustomerAccountFilter.All);
  readonly search = signal('');
  readonly selectedId = signal('');
  readonly command = signal(CustomerAccountCommand.Unknown);
  readonly feedback = signal('');
  reason = '';
  private origin: HTMLElement | null = null;
  private detailOrigin: HTMLElement | null = null;
  private confirmationEpoch = -1;
  constructor() { effect(() => { this.state.sessionEpoch(); this.closeConfirmation(); this.closeDetail(); }); }
  get allowed(): boolean { return this.state.context() === DemoContext.Admin && CustomerAdministrationAuthority.canRead(this.state.role()); }
  get writable(): boolean { return this.allowed && CustomerAdministrationAuthority.canWrite(this.state.role()) && this.state.writerStatus().writable; }
  get customers(): DemoActor[] { return this.allowed ? this.state.data.actors.filter(value => new CustomerAccountQuery(this.search(), this.filter()).matches(value)) : []; }
  get selected(): DemoActor | undefined { return this.allowed ? this.state.data.actors.find(value => value.id === this.selectedId()) : undefined; }
  get orders() { return this.selected ? new CustomerAccountQuery('', CustomerAccountFilter.All).orders(this.selected.id, this.state.data.orders) : []; }
  changeFilter(raw: string): void { this.filter.set(CustomerAccountFilter.fromWire(raw)); }
  get hasFilters(): boolean { return !!this.search() || this.filter() !== CustomerAccountFilter.All; }
  clearFilters(): void { this.search.set(''); this.filter.set(CustomerAccountFilter.All); }
  reload(): void { window.location.reload(); }
  open(customer: DemoActor): void { if (!this.allowed) return; this.detailOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : null; this.feedback.set(''); this.state.error.set(''); this.selectedId.set(customer.id); const epoch = this.state.sessionEpoch(); setTimeout(() => { if (this.allowed && this.selectedId() === customer.id && epoch === this.state.sessionEpoch()) document.querySelector<HTMLDialogElement>('#customer-summary')?.showModal(); }); }
  closeDetail(): void { document.querySelector<HTMLDialogElement>('#customer-summary')?.close(); this.selectedId.set(''); this.detailOrigin?.focus(); }
  prepare(command: CustomerAccountCommand): void { if (!this.writable || !this.selected || this.selected.access?.state === CustomerAccountState.Unknown) return; this.feedback.set(''); this.state.error.set(''); this.command.set(command); this.reason = ''; this.confirmationEpoch = this.state.sessionEpoch(); this.origin = document.activeElement instanceof HTMLElement ? document.activeElement : null; setTimeout(() => { if (this.command() === command && this.confirmationEpoch === this.state.sessionEpoch()) document.querySelector<HTMLDialogElement>('#confirm-account-state')?.showModal(); }); }
  closeConfirmation(): void { document.querySelector<HTMLDialogElement>('#confirm-account-state')?.close(); this.command.set(CustomerAccountCommand.Unknown); this.origin?.focus(); }
  confirm(): void { if (!this.writable || !this.selected || this.confirmationEpoch !== this.state.sessionEpoch()) return; const name = `${this.selected.firstName} ${this.selected.lastName}`; if (this.state.changeCustomerAccount(this.selected.id, this.command(), this.reason)) { this.feedback.set(`${name}: cuenta ${this.selected.access?.state.label.toLowerCase()}. Cambio guardado en esta Demo.`); this.closeConfirmation(); setTimeout(() => document.getElementById('customer-summary-title')?.focus()); } }
  money(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value / 100); }
}
