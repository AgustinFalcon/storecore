import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DemoPageComponent } from '../demo.component';
import { DemoApplicationState } from '../demo-state';
import { DemoSnapshotWriter } from '../demo-snapshot-writer';
import { DemoContext, CheckoutStep, DemoProductVariant } from '../demo-model';
import { DemoScreen } from '../demo-screen';
import { DemoDeliveryMethod as Method } from '../demo-process-types';
import { DeliveryConfirmation as Confirmation } from './demo-delivery-quote';
import { DemoCheckoutIssue as Issue } from './demo-checkout-flow';
import { CatalogDetailsRead } from '../rich-catalog/catalog-details';
import { VariantSaleState } from '../catalog/catalog-types';

describe('SC11A checkout presentation lifetime', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.useFakeTimers(); vi.spyOn(DemoSnapshotWriter.browser, 'assertWritable').mockImplementation(() => {}); });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });
  function setup() {
    const params = convertToParamMap({});
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { data: { screen: DemoScreen.Checkout.path }, queryParamMap: params, paramMap: params }, queryParamMap: of(params), paramMap: of(params) } }] }).overrideComponent(DemoPageComponent, { set: { template: '' } });
    const state = TestBed.inject(DemoApplicationState); expect(state.login(DemoContext.Customer)).toBe(true); expect(state.run(() => state.commerce.add('cliente', 'DEMO-001', 1), 'added')).toBe(true);
    const fixture = TestBed.createComponent(DemoPageComponent); fixture.detectChanges();
    const component = fixture.componentInstance; component.addressId = state.actor.addresses[0].id; component.delivery = true; component.step.set(CheckoutStep.Review);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return { state, fixture, component, navigate };
  }
  it('requires explicit acceptance and invalidates method/address round trips', () => {
    const { component } = setup(); expect(component.deliveryConfirmation).toBe(Confirmation.Confirmed);
    component.selectDelivery(Method.Pickup.wire); component.selectDelivery(Method.Home.wire); expect(component.deliveryConfirmation).toBe(Confirmation.Pending);
    component.delivery = true; const address = component.addressId; component.selectCheckoutAddress('other'); component.selectCheckoutAddress(address); expect(component.deliveryConfirmation).toBe(Confirmation.Pending);
  });
  it('executes duplicate submission only once', () => {
    const { state, component, navigate } = setup(); const before = state.data.orders.length;
    component.checkout(); component.checkout(); vi.advanceTimersByTime(800);
    expect(state.data.orders).toHaveLength(before + 1); expect(navigate).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])('cancellation/destruction never commits: destroy=%s', destroy => {
    const { state, component, fixture, navigate } = setup(); const before = JSON.stringify(state.data);
    component.checkout(); if (destroy) fixture.destroy(); else component.cancelProcessing(); vi.advanceTimersByTime(800);
    expect(JSON.stringify(state.data)).toBe(before); expect(navigate).not.toHaveBeenCalled();
  });
  it('rejects session epoch changes even before the effect is rendered', () => {
    const { state, component, navigate } = setup(); const before = state.data.orders.length;
    component.checkout(); state.logout(); vi.advanceTimersByTime(800); expect(state.data.orders).toHaveLength(before); expect(navigate).not.toHaveBeenCalled();
  });
  it('invalidates accepted delivery immediately on a fresh same-actor session', () => {
    const { state, component } = setup(); expect(component.deliveryConfirmation).toBe(Confirmation.Confirmed);
    state.login(DemoContext.Customer); expect(component.deliveryConfirmation).toBe(Confirmation.Pending);
  });
  it('rechecks exact captured quote before deferred order creation', () => {
    const { state, component, navigate } = setup(); const before = state.data.orders.length;
    component.checkout(); state.commerce.snapshot.settings.deliveryDays++; component.delivery = true; vi.advanceTimersByTime(800);
    expect(component.checkoutIssue()).toBe(Issue.MissingDelivery); expect(state.data.orders).toHaveLength(before); expect(navigate).not.toHaveBeenCalled();
  });
  it('does not navigate after a rejected durable transaction', () => {
    const { state, component, navigate } = setup(); const before = JSON.stringify(state.data); vi.spyOn(state, 'run').mockReturnValue(false);
    component.checkout(); vi.advanceTimersByTime(800); expect(navigate).not.toHaveBeenCalled(); expect(JSON.stringify(state.data)).toBe(before);
  });
  it('blocks checkout presentation while a visible cart quantity is invalid',()=>{const{component}=setup();component.setQuantity('DEMO-001',0);expect(component.cartHasQuantityErrors).toBe(true);component.setQuantity('DEMO-001',1);expect(component.cartHasQuantityErrors).toBe(false);});
  it('removing an invalid line also removes its checkout blocker',()=>{const{component}=setup();component.setQuantity('DEMO-001',0);expect(component.cartHasQuantityErrors).toBe(true);component.remove('DEMO-001');expect(component.cartHasQuantityErrors).toBe(false);expect(component.cartLines).toEqual([]);});
  it('adds a favorite using its available active presentation instead of assuming Standard',()=>{const{state,component}=setup();expect(state.run(()=>state.commerce.remove('cliente','DEMO-001'),'removed')).toBe(true);const product=state.commerce.product('DEMO-001'),details=CatalogDetailsRead.detail(state.data,product.sku);expect(details).toBeDefined();details!.variants.find(value=>value.variant===DemoProductVariant.Standard)!.state=VariantSaleState.Disabled;details!.variants.find(value=>value.variant===DemoProductVariant.Case)!.state=VariantSaleState.Active;expect(component.favoriteVariant(product)).toBe(DemoProductVariant.Case);component.addFavorite(product);expect(state.actor.cart).toEqual([expect.objectContaining({sku:'DEMO-001',variant:DemoProductVariant.Case,quantity:1})]);});
});
