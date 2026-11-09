import { of, Subject } from 'rxjs';
import { AdminCustomer, CustomerAccountState, CustomerPage, CustomerQuery, CustomerStateTransition } from '../../domain/customer-admin/customer-admin';
import { GetCustomerUseCase } from '../../domain/customer-admin/use-cases/get-customer.usecase';
import { ListCustomersUseCase } from '../../domain/customer-admin/use-cases/list-customers.usecase';
import { TransitionCustomerUseCase } from '../../domain/customer-admin/use-cases/transition-customer.usecase';
import { UserCustomersState, UserCustomersStore } from './user-customers.store';

const active = (id: number): AdminCustomer => ({ id, firstName: `Cliente${id}`, lastName: 'Demo', email: `c${id}@example.invalid`, phone: null, state: CustomerAccountState.Active, createdAt: '2026-11-08T12:00:00Z', orderCount: 0, lastOrderAt: null });
const page = (items: readonly AdminCustomer[], queryPage = 0): CustomerPage => ({ items, page: queryPage, pageSize: 25, total: items.length });
const query: CustomerQuery = { query: '', state: null, page: 0 };

function setup(list: ReturnType<typeof vi.fn>, get: ReturnType<typeof vi.fn>, transition: ReturnType<typeof vi.fn>) {
  const store = new UserCustomersStore({ execute: list } as unknown as ListCustomersUseCase, { execute: get } as unknown as GetCustomerUseCase, { execute: transition } as unknown as TransitionCustomerUseCase);
  let state!: UserCustomersState; const subscription = store.viewState$.subscribe((value) => state = value);
  return { store, current: () => state, destroy: () => { subscription.unsubscribe(); store.ngOnDestroy(); } };
}

describe('UserCustomersStore concurrency', () => {
  it('does not let a late mutation replace a newer detail selection', () => {
    const a = active(1), b = active(2), response = new Subject<AdminCustomer>();
    const fixture = setup(vi.fn(() => of(page([a, b]))), vi.fn((id: number) => of(id === 1 ? a : b)), vi.fn(() => response.asObservable()));
    fixture.store.load(query); fixture.store.openCustomer(a.id); fixture.store.change(a, CustomerStateTransition.Suspend);
    fixture.store.close(); fixture.store.openCustomer(b.id);
    response.next({ ...a, state: CustomerAccountState.Suspended }); response.complete();
    expect(fixture.current().selected?.id).toBe(b.id); expect(fixture.current().detailError).toBe(''); expect(fixture.current().feedback).toBe('');
    fixture.destroy();
  });

  it.each([
    { filter: CustomerAccountState.Active, source: active(1), target: CustomerAccountState.Suspended, transition: CustomerStateTransition.Suspend },
    { filter: CustomerAccountState.Suspended, source: { ...active(1), state: CustomerAccountState.Suspended }, target: CustomerAccountState.Active, transition: CustomerStateTransition.Reactivate },
  ])('reloads filtered page after $transition.label and removes stale membership', ({ filter, source, target, transition }) => {
    const criteria: CustomerQuery = { query: '', state: filter, page: 0 };
    const list = vi.fn().mockReturnValueOnce(of(page([source]))).mockReturnValueOnce(of(page([])));
    const fixture = setup(list, vi.fn(() => of(source)), vi.fn(() => of({ ...source, state: target })));
    fixture.store.load(criteria); fixture.store.openCustomer(source.id); fixture.store.change(source, transition);
    expect(fixture.current().page.items).toEqual([]); expect(fixture.current().page.total).toBe(0); expect(list).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });

  it('clamps to the last valid page when a transition removes its final row', () => {
    const source = active(26), firstPage = Array.from({ length: 25 }, (_, index) => active(index + 1));
    const criteria: CustomerQuery = { query: '', state: CustomerAccountState.Active, page: 1 };
    const list = vi.fn()
      .mockReturnValueOnce(of({ items: [source], page: 1, pageSize: 25, total: 26 }))
      .mockReturnValueOnce(of({ items: [], page: 1, pageSize: 25, total: 25 }))
      .mockReturnValueOnce(of({ items: firstPage, page: 0, pageSize: 25, total: 25 }));
    const fixture = setup(list, vi.fn(() => of(source)), vi.fn(() => of({ ...source, state: CustomerAccountState.Suspended })));
    fixture.store.load(criteria); fixture.store.openCustomer(source.id); fixture.store.change(source, CustomerStateTransition.Suspend);
    expect(fixture.current().page.page).toBe(0); expect(fixture.current().page.items).toHaveLength(25); expect(fixture.current().query.page).toBe(0); expect(list).toHaveBeenCalledTimes(3);
    fixture.destroy();
  });
});
