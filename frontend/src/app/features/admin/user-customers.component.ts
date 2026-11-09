import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, OnInit, signal, viewChild } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserSession } from '../../core/auth/user-session';
import { AdminCustomer, CustomerAccountState, CustomerQuery, CustomerStateTransition } from '../../domain/customer-admin/customer-admin';
import { UserRole } from '../../domain/user/user-role';
import { UserCustomersStore } from './user-customers.store';

@Component({ selector: 'sc-user-customers', imports: [AsyncPipe, DatePipe, FormsModule], providers: [UserCustomersStore], changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './user-customers.component.html' })
export class UserCustomersComponent implements OnInit {
  readonly queryText = signal(''); readonly stateFilter = signal<CustomerAccountState | null>(null); readonly queryError = signal('');
  readonly states = CustomerAccountState.filterable; readonly unknownState = CustomerAccountState.Unknown;
  readonly Transition = CustomerStateTransition;
  readonly canWrite = computed(() => this.session.roles().includes(UserRole.Admin));
  private readonly injector = inject(Injector); private readonly detailDialog = viewChild<ElementRef<HTMLDialogElement>>('detailDialog');
  private readonly confirmationDialog = viewChild<ElementRef<HTMLDialogElement>>('confirmationDialog'); private detailTrigger: HTMLElement | null = null;
  readonly pendingTransition = signal<{ customer: AdminCustomer; transition: CustomerStateTransition } | null>(null);
  constructor(readonly store: UserCustomersStore, private readonly session: UserSession) {}
  ngOnInit(): void { this.search(0); }
  search(page = 0): void {
    const text = this.queryText().trim(); this.queryError.set('');
    if (text.length === 1 || text.length > 100) { this.queryError.set('Buscá con al menos 2 y hasta 100 caracteres.'); return; }
    const query: CustomerQuery = { query: text, state: this.stateFilter(), page }; this.store.load(query);
  }
  open(customer: AdminCustomer, event: Event): void {
    this.detailTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null; this.store.openCustomer(customer.id);
    afterNextRender(() => { const dialog = this.detailDialog()?.nativeElement; if (!dialog?.open) dialog?.showModal(); dialog?.querySelector<HTMLElement>('h2')?.focus(); }, { injector: this.injector });
  }
  closeDetail(): void { this.detailDialog()?.nativeElement.close(); this.store.close(); this.detailTrigger?.focus(); this.detailTrigger = null; }
  transitionFor(customer: AdminCustomer): CustomerStateTransition { return CustomerStateTransition.for(customer.state); }
  totalPages(total: number, pageSize: number): number { return Math.max(1, Math.ceil(total / pageSize)); }
  prepare(customer: AdminCustomer): void {
    const transition = this.transitionFor(customer); if (!this.canWrite() || transition === CustomerStateTransition.Unknown) return;
    this.pendingTransition.set({ customer, transition });
    afterNextRender(() => { const dialog = this.confirmationDialog()?.nativeElement; if (!dialog?.open) dialog?.showModal(); dialog?.querySelector<HTMLElement>('[data-confirm-customer]')?.focus(); }, { injector: this.injector });
  }
  cancelTransition(): void { this.confirmationDialog()?.nativeElement.close(); this.pendingTransition.set(null); this.detailDialog()?.nativeElement.querySelector<HTMLElement>('[data-customer-transition]')?.focus(); }
  confirmTransition(): void { const pending = this.pendingTransition(); if (!pending) return; this.confirmationDialog()?.nativeElement.close(); this.pendingTransition.set(null); this.store.change(pending.customer, pending.transition); }
}
