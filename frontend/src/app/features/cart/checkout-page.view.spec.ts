import { DeliveryMode, DeliveryQuote } from '../../domain/cart/delivery';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import {CheckoutPageViewComponent} from './checkout-page.view';
import {CartFailureKind, type CartState} from './cart.store';
import {mapCart} from '../../data/mappers/http-mappers';
import {CartCurrency} from '../../domain/cart/cart-currency';
import { CheckoutAttemptState } from '../../domain/cart/checkout-attempt-state';
import { AddressReadState } from '../../domain/customer/address-read-state';
const channels = { deliveryQuote:DeliveryQuote.fromWire({mode:'LOCAL_DELIVERY',label:'Entrega local',cost:0,currency:'ARS',minDays:1,maxDays:2,requiresAddress:true,configurationVersion:2,destination:null,instructions:null}), attemptCommand:{cartRevision:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',addressRevision:'2026-11-14T00:00:00Z',idempotencyKey:'attempt',currency:CartCurrency.Ars,addressId:'address-1',deliveryMode:DeliveryMode.LocalDelivery,deliveryConfigurationVersion:2},attemptAddress:null, addressReadState: AddressReadState.Ready, addressErrorMessage: '', checkoutAttemptState: CheckoutAttemptState.Idle, checkoutErrorMessage: '' };
describe('Real checkout commercial summary',()=>{
 it('derives merchandise amount from mapped decimal currency units without scaling',()=>{
  const cart=mapCart({revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', currency:'ARS',lines:[
   {sku:'A',name:'A',effectiveUnitPrice:12500.25,originalUnitPrice:12500.25,discountAmount:0,quantity:2},
   {sku:'B',name:'B',effectiveUnitPrice:3000,originalUnitPrice:3000,discountAmount:0,quantity:3},
  ]});
  const state:CartState={...channels,loading:false,errorMessage:'',cart,addresses:[],addressId:'',idempotencyKey:'test',receipt:null,failureKind:CartFailureKind.None};
  const view=new CheckoutPageViewComponent();view.state=state;expect(view.merchandiseTotal).toBe(34000.5);expect(view.amount(view.merchandiseTotal)).toContain('34.000,50');
 });

 it.each([
  [CartFailureKind.None, CheckoutAttemptState.Retryable, 'Reintentar el mismo pago', 'Corregir carrito'],
  [CartFailureKind.None, CheckoutAttemptState.ProductUnavailable, 'Corregir carrito', 'Reintentar el mismo pago'],
  [CartFailureKind.CurrencyUnavailable, CheckoutAttemptState.Idle, 'Actualizar carrito y moneda', 'Reintentar el mismo pago'],
 ] as const)('renders one recovery CTA owned by %s', (failureKind, checkoutAttemptState, expected, absent) => {
  TestBed.configureTestingModule({ imports: [CheckoutPageViewComponent], providers: [provideRouter([])] });
  const fixture=TestBed.createComponent(CheckoutPageViewComponent);
  const state:CartState={
   ...channels, checkoutAttemptState,
   loading:false,errorMessage:'Necesitás corregir esta compra.',
   cart:{revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', deliveryOptions:[channels.deliveryQuote],currency:failureKind === CartFailureKind.CurrencyUnavailable ? CartCurrency.Unknown : CartCurrency.Ars,lines:[{sku:'A',name:'A',effectiveUnitPrice:100,originalUnitPrice:100,discountAmount:0,quantity:1,offerRef:null,campaignRef:null}]},
   addresses:[{revision: '2026-11-14T00:00:00Z', id:'address-1',street:'Calle',number:'1',city:'Ciudad',province:'Provincia',postalCode:'1000',isDefault:true}],
   addressId:'address-1',idempotencyKey:'attempt',receipt:null,failureKind,
  };
  fixture.componentRef.setInput('state',state);
  fixture.componentRef.setInput('access',CustomerCartAccess.Ready);
  fixture.detectChanges();

  const text=(fixture.nativeElement as HTMLElement).textContent ?? '';
  expect(text).toContain(expected);
  expect(text).not.toContain(absent);
  expect(text).not.toContain('Pagar');
  expect(text).not.toMatch(/\bReintentar\b(?! el mismo pago)/);
  expect(fixture.nativeElement.querySelectorAll('form button:not([disabled]), form a.sc-btn')).toHaveLength(1);
 });

 it('keeps the retry summary on the captured merchandise and address when refreshed facts change', () => {
  TestBed.configureTestingModule({ imports: [CheckoutPageViewComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CheckoutPageViewComponent);
  const originalLine = { sku: 'A', name: 'Producto confirmado', effectiveUnitPrice: 100, originalUnitPrice: 100, discountAmount: 0, quantity: 1, offerRef: null, campaignRef: null };
  const originalAddress = { revision: '2026-11-14T00:00:00Z', id: 'address-1', street: 'Calle confirmada', number: '1', city: 'Ciudad', province: 'Provincia', postalCode: '1000', isDefault: true };
  const state: CartState = {
   ...channels, attemptLines: [originalLine], attemptAddress: originalAddress,
   checkoutAttemptState: CheckoutAttemptState.Retryable, loading: false, errorMessage: '',
   cart: { revision: 'b'.repeat(64), currency: CartCurrency.Ars, deliveryOptions: [channels.deliveryQuote], lines: [{ ...originalLine, name: 'Producto actualizado', effectiveUnitPrice: 900, originalUnitPrice: 900 }] },
   addresses: [{ ...originalAddress, street: 'Calle actualizada' }], addressId: originalAddress.id,
   idempotencyKey: 'attempt', receipt: null, failureKind: CartFailureKind.None,
  };
  fixture.componentRef.setInput('state', state); fixture.componentRef.setInput('access', CustomerCartAccess.Ready); fixture.detectChanges();
  const summary = fixture.nativeElement.querySelector('aside') as HTMLElement;
  expect(summary.textContent).toContain('Producto confirmado');
  expect(summary.textContent).toContain('Calle confirmada');
  expect(summary.textContent).not.toContain('Producto actualizado');
  expect(summary.textContent).not.toContain('Calle actualizada');
  expect(fixture.componentInstance.merchandiseTotal).toBe(100);
  expect(fixture.componentInstance.finalTotal).toBe(100);
 });

 it('never exposes an editable currency or formats an unknown wire as ARS', () => {
  TestBed.configureTestingModule({ imports: [CheckoutPageViewComponent], providers: [provideRouter([])] });
  const fixture=TestBed.createComponent(CheckoutPageViewComponent);
  fixture.componentRef.setInput('state',{
   ...channels,
   loading:false,errorMessage:'Moneda no disponible',cart:{revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', deliveryOptions:[channels.deliveryQuote],currency:CartCurrency.Unknown,lines:[]},addresses:[],addressId:'',idempotencyKey:'attempt',receipt:null,failureKind:CartFailureKind.CurrencyUnavailable,
  } satisfies CartState);
  fixture.componentRef.setInput('access',CustomerCartAccess.Ready);
  fixture.detectChanges();
  expect((fixture.nativeElement as HTMLElement).textContent).toContain('Moneda no disponible');
  expect(fixture.nativeElement.querySelector('input[name="currency"]')).toBeNull();
  expect(fixture.componentInstance.amount(100)).toBe('Importe no disponible');
  expect(fixture.componentInstance.canPay).toBe(false);
 });

 it('offers a keyboard accessible address CTA only for a confirmed empty list', () => {
  TestBed.configureTestingModule({ imports: [CheckoutPageViewComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CheckoutPageViewComponent);
  const state: CartState = { ...channels, addressReadState: AddressReadState.Empty, loading: false, errorMessage: '', cart: {revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', deliveryOptions:[channels.deliveryQuote],currency: CartCurrency.Ars, lines: []}, addresses: [], addressId: '', idempotencyKey: 'key', receipt: null, failureKind: CartFailureKind.None };
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
  fixture.detectChanges();
  const link = fixture.nativeElement.querySelector('a[href="/customer/addresses?returnTo=checkout"]') as HTMLAnchorElement;
  expect(link.textContent).toContain('Agregar dirección');
  link.focus();
  expect(document.activeElement).toBe(link);
  expect(fixture.nativeElement.querySelector('[role="status"]')).toBeTruthy();
  expect(fixture.componentInstance.canPay).toBe(false);
  fixture.componentRef.setInput('state', { ...state, addressReadState: AddressReadState.Loading });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('a[href="/customer/addresses?returnTo=checkout"]')).toBeNull();
 });

 it('disables address selection during a pending payment with confirmed addresses', () => {
  TestBed.configureTestingModule({ imports: [CheckoutPageViewComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CheckoutPageViewComponent);
  fixture.componentRef.setInput('state', { ...channels, checkoutAttemptState: CheckoutAttemptState.Pending, loading: false, errorMessage: '', cart: {revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', deliveryOptions:[channels.deliveryQuote],currency: CartCurrency.Ars, lines: []}, addresses: [{revision: '2026-11-14T00:00:00Z', id:'a',street:'S',number:'1',city:'C',province:'P',postalCode:'1',isDefault:true}], addressId: 'a', idempotencyKey: 'key', receipt: null, failureKind: CartFailureKind.None } satisfies CartState);
  fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
  fixture.detectChanges();
  expect((fixture.nativeElement.querySelector('select[name="addressId"]') as HTMLSelectElement).disabled).toBe(true);
 });

 it('keeps address error and payment retry visible while GET cart loads and emits separate actions', () => {
  TestBed.configureTestingModule({ imports: [CheckoutPageViewComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CheckoutPageViewComponent);
  const state: CartState = { ...channels, addressReadState: AddressReadState.Error, addressErrorMessage: 'Error de direcciones', checkoutAttemptState: CheckoutAttemptState.Retryable, checkoutErrorMessage: 'Respuesta de pago perdida', loading: true, errorMessage: '', cart: {revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', deliveryOptions:[channels.deliveryQuote],currency: CartCurrency.Ars, lines: []}, addresses: [{revision: '2026-11-14T00:00:00Z', id:'a',street:'S',number:'1',city:'C',province:'P',postalCode:'1',isDefault:true}], addressId: 'a', idempotencyKey: 'key', receipt: null, failureKind: CartFailureKind.None };
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
  const reads = vi.fn(); const payments = vi.fn(); const pay = vi.fn();
  fixture.componentInstance.readRetry.subscribe(reads);
  fixture.componentInstance.paymentRetry.subscribe(payments);
  fixture.componentInstance.pay.subscribe(pay);
  fixture.detectChanges();
  const text = (fixture.nativeElement as HTMLElement).textContent;
  expect(text).toContain('Error de direcciones');
  expect(text).toContain('Respuesta de pago perdida');
  expect(text).toContain('Reintentar el mismo pago');
  (fixture.nativeElement.querySelector('form sc-feature-status button') as HTMLButtonElement).click();
  expect(reads).toHaveBeenCalledOnce();
  expect(payments).not.toHaveBeenCalled();
  fixture.componentRef.setInput('state', {...state, addressReadState: AddressReadState.Ready, addressErrorMessage: ''});
  fixture.detectChanges();
  const retry = fixture.nativeElement.querySelector('form button') as HTMLButtonElement;
  expect(retry.disabled).toBe(false);
  retry.click();
  expect(payments).toHaveBeenCalledOnce();
  expect(pay).not.toHaveBeenCalled();
 });
});
