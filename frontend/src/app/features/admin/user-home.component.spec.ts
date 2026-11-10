import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { UserAction } from './user-action';
import { UserHomeComponent } from './user-home.component';
import { ReadOverviewUseCase } from '../../domain/overview/use-cases/read-overview.usecase';
import { OverviewFactState, OverviewPeriod, OverviewUnavailableReason, PendingPaymentReason } from '../../domain/overview/overview';
import { ShipmentStatus } from '../../domain/order/commerce-states';
import { of } from 'rxjs';

const overview = {
  period: OverviewPeriod.Today, timezone: 'America/Argentina/Buenos_Aires', fromInclusive: '2026-11-08T03:00:00Z', toExclusive: '2026-11-08T18:00:00Z',
  accreditedRevenue: { state: OverviewFactState.Known, value: 0, reason: null }, orderCount: { state: OverviewFactState.Known, value: 2, reason: null },
  activeCustomerCount: { state: OverviewFactState.Unavailable, value: null, reason: OverviewUnavailableReason.InventoryFactsIncomplete }, inventoryAtRiskCount: { state: OverviewFactState.Known, value: 1, reason: null },
  pendingPayments: { state: OverviewFactState.Known, items: [], totalCount: 0, truncated: false, reason: null }, fulfillment: { state: OverviewFactState.Known, items: [], totalCount: 0, truncated: false, reason: null }, lowStock: { state: OverviewFactState.Known, items: [], totalCount: 0, truncated: false, reason: null },
};

describe('UserHomeComponent', () => {
  it('refreshes links when current roles change and removes all actions on session loss', () => {
    TestBed.configureTestingModule({ imports: [UserHomeComponent], providers: [provideRouter([]), { provide: ReadOverviewUseCase, useValue: { execute: vi.fn(() => of(overview)) } }] });
    const session = TestBed.inject(UserSession);
    session.commit({ id: 'user-1', roles: [UserRole.Admin] }, 'csrf');
    const fixture = TestBed.createComponent(UserHomeComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.actions()).toContain(UserAction.Promos);
    expect(fixture.componentInstance.actions()).toContain(UserAction.Content);
    expect(fixture.componentInstance.actions()).toContain(UserAction.MercadoLibre);
    session.commit({ id: 'user-1', roles: [UserRole.Operator] }, 'csrf');
    fixture.detectChanges();
    expect(fixture.componentInstance.actions()).not.toContain(UserAction.Promos);
    expect(fixture.nativeElement.textContent).not.toContain(UserAction.Promos.label);
    expect(fixture.nativeElement.querySelector('a[href="/user/content"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/user/mercadolibre"]')).toBeNull();
    session.commit({ id: 'user-2', roles: [UserRole.Operator] }, 'csrf-new');
    fixture.detectChanges();
    expect(fixture.componentInstance.actions()).not.toContain(UserAction.Content);
    expect(fixture.componentInstance.actions()).not.toContain(UserAction.MercadoLibre);
    session.clear(); fixture.detectChanges();
    expect(fixture.componentInstance.actions()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('No hay acciones disponibles');
  });

  it('renders a known zero separately from an unavailable fact', () => {
    TestBed.configureTestingModule({ imports: [UserHomeComponent], providers: [provideRouter([]), { provide: ReadOverviewUseCase, useValue: { execute: vi.fn(() => of(overview)) } }] });
    const fixture = TestBed.createComponent(UserHomeComponent); fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toMatch(/\$\s*0/); expect(text).toContain('Clientes activos'); expect(text).toContain('datos de inventario');
  });

  it('formats period and queue instants in the installation timezone, not the browser timezone', () => {
    TestBed.configureTestingModule({ imports: [UserHomeComponent], providers: [provideRouter([]), { provide: ReadOverviewUseCase, useValue: { execute: vi.fn(() => of(overview)) } }] });
    const component = TestBed.createComponent(UserHomeComponent).componentInstance;
    const buenosAires = component.instant('2026-11-08T03:30:00Z', 'America/Argentina/Buenos_Aires');
    const utc = component.instant('2026-11-08T03:30:00Z', 'UTC');
    expect(buenosAires).toContain('12:30'); expect(utc).toContain('3:30'); expect(buenosAires).not.toBe(utc);
  });

  it('labels a bounded queue as a partial projection', () => {
    const bounded = { ...overview, pendingPayments: { state: OverviewFactState.Known, totalCount: 2, truncated: true, reason: null,
      items: [{ orderId: 1, orderNumber: 'SC-1', total: 100, createdAt: '2026-11-08T12:00:00Z', reason: PendingPaymentReason.Pending }] } };
    TestBed.configureTestingModule({ imports: [UserHomeComponent], providers: [provideRouter([]), { provide: ReadOverviewUseCase, useValue: { execute: vi.fn(() => of(bounded)) } }] });
    const fixture = TestBed.createComponent(UserHomeComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Mostrando 1 de 2 pagos');
  });
  it('links each payment and fulfillment queue row to its own exact order', () => {
    const queues = { ...overview,
      pendingPayments: { ...overview.pendingPayments, items: [{ orderId: 17, orderNumber: 'SC-17', total: 100, createdAt: '2026-11-08T12:00:00Z', reason: PendingPaymentReason.Pending }], totalCount: 1 },
      fulfillment: { ...overview.fulfillment, items: [{ orderId: 29, orderNumber: 'SC-29', total: 200, paidAt: '2026-11-08T12:00:00Z', shipmentState: ShipmentStatus.NotCreated }], totalCount: 1 },
    };
    TestBed.configureTestingModule({ imports: [UserHomeComponent], providers: [provideRouter([]), { provide: ReadOverviewUseCase, useValue: { execute: vi.fn(() => of(queues)) } }] });
    const fixture = TestBed.createComponent(UserHomeComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/user/orders/17"]').textContent).toContain('SC-17');
    expect(fixture.nativeElement.querySelector('a[href="/user/orders/29"]').textContent).toContain('SC-29');
  });
});
