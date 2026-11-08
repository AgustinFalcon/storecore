import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { concatMap, filter, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { AdminCustomer, CustomerPage, CustomerQuery, CustomerStateTransition } from '../../domain/customer-admin/customer-admin';
import { GetCustomerUseCase } from '../../domain/customer-admin/use-cases/get-customer.usecase';
import { ListCustomersUseCase } from '../../domain/customer-admin/use-cases/list-customers.usecase';
import { TransitionCustomerUseCase } from '../../domain/customer-admin/use-cases/transition-customer.usecase';

export interface UserCustomersState {
  readonly loading: boolean; readonly detailLoading: boolean; readonly mutating: boolean;
  readonly page: CustomerPage; readonly selected: AdminCustomer | null;
  readonly query: CustomerQuery; readonly detailGeneration: number;
  readonly errorMessage: string; readonly detailError: string; readonly feedback: string;
}
const EMPTY_PAGE: CustomerPage = { items: [], page: 0, pageSize: 25, total: 0 };
const EMPTY_QUERY: CustomerQuery = { query: '', state: null, page: 0 };
const INITIAL: UserCustomersState = { loading: false, detailLoading: false, mutating: false, page: EMPTY_PAGE, selected: null, query: EMPTY_QUERY, detailGeneration: 0, errorMessage: '', detailError: '', feedback: '' };

@Injectable()
export class UserCustomersStore extends ComponentStore<UserCustomersState> {
  readonly viewState$ = this.select((state) => state);
  constructor(private readonly listCustomers: ListCustomersUseCase, private readonly getCustomer: GetCustomerUseCase, private readonly transitionCustomer: TransitionCustomerUseCase) { super(INITIAL); }
  readonly load = this.effect<CustomerQuery>((query$) => query$.pipe(
    tap((query) => this.patchState({ loading: true, query, errorMessage: '', feedback: '' })),
    switchMap((query) => this.listCustomers.execute(query).pipe(tapResponse({ next: (page) => this.patchState({ page, loading: false }), error: (error: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(error) }) }))),
  ));
  private readonly loadDetail = this.effect<{ id: number; generation: number }>((request$) => request$.pipe(
    switchMap(({ id, generation }) => this.getCustomer.execute(id).pipe(tapResponse({
      next: (selected) => { if (this.get((state) => state.detailGeneration === generation)) this.patchState({ selected, detailLoading: false }); },
      error: (error: unknown) => { if (this.get((state) => state.detailGeneration === generation)) this.patchState({ detailLoading: false, detailError: getApiErrorMessage(error) }); },
    }))),
  ));
  openCustomer(id: number): void {
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const generation = this.get((state) => state.detailGeneration + 1);
    this.patchState({ detailGeneration: generation, detailLoading: true, selected: null, detailError: '', feedback: '' });
    this.loadDetail({ id, generation });
  }
  close(): void { this.patchState((state) => ({ detailGeneration: state.detailGeneration + 1, detailLoading: false, selected: null, detailError: '', feedback: '' })); }
  private readonly refresh = this.effect<CustomerQuery>((query$) => query$.pipe(
    switchMap((query) => this.listCustomers.execute(query).pipe(tapResponse({
      next: (page) => {
        if (this.get((state) => state.query !== query)) return;
        const lastPage = Math.max(0, Math.ceil(page.total / page.pageSize) - 1);
        if (query.page > lastPage) {
          const corrected = { ...query, page: lastPage };
          this.patchState({ query: corrected });
          this.refresh(corrected);
          return;
        }
        this.patchState({ page, loading: false });
      },
      error: (error: unknown) => this.patchState((state) => state.query === query ? { loading: false, errorMessage: getApiErrorMessage(error) } : {}),
    }))),
  ));
  private readonly runTransition = this.effect<{ customer: AdminCustomer; transition: CustomerStateTransition; generation: number }>((request$) => request$.pipe(
    filter(({ customer, transition }) => transition === CustomerStateTransition.for(customer.state) && transition !== CustomerStateTransition.Unknown),
    tap(() => this.patchState({ mutating: true, errorMessage: '', detailError: '', feedback: '' })),
    concatMap(({ customer, transition, generation }) => this.transitionCustomer.execute(customer, transition).pipe(tapResponse({
      next: (updated) => {
        const query = this.get((state) => state.query);
        this.patchState((state) => {
          const remains = query.state === null || query.state === updated.state;
          const items = remains ? state.page.items.map((item) => item.id === updated.id ? updated : item) : state.page.items.filter((item) => item.id !== updated.id);
          const ownsDetail = state.detailGeneration === generation && state.selected?.id === updated.id;
          return {
            mutating: false,
            loading: true,
            selected: ownsDetail ? updated : state.selected,
            page: { ...state.page, items, total: remains ? state.page.total : Math.max(0, state.page.total - 1) },
            feedback: ownsDetail ? (transition === CustomerStateTransition.Suspend ? 'Cuenta suspendida y sesiones activas revocadas.' : 'Cuenta reactivada. Las sesiones anteriores permanecen revocadas.') : state.feedback,
          };
        });
        this.refresh(query);
      },
      error: (error: unknown) => this.patchState((state) => ({ mutating: false, detailError: state.detailGeneration === generation && state.selected?.id === customer.id ? getApiErrorMessage(error) : state.detailError })),
    }))),
  ));
  change(customer: AdminCustomer, transition: CustomerStateTransition): void {
    this.runTransition({ customer, transition, generation: this.get((state) => state.detailGeneration) });
  }
}
