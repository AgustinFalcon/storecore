import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import {CheckoutPageViewComponent} from './checkout-page.view';
import {CartFailureKind, type CartState} from './cart.store';
import {mapCart} from '../../data/mappers/http-mappers';
describe('Real checkout commercial summary',()=>{
 it('derives merchandise amount from mapped decimal currency units without scaling',()=>{
  const cart=mapCart({currency:'ARS',lines:[
   {sku:'A',name:'A',effectiveUnitPrice:12500.25,originalUnitPrice:12500.25,discountAmount:0,quantity:2},
   {sku:'B',name:'B',effectiveUnitPrice:3000,originalUnitPrice:3000,discountAmount:0,quantity:3},
  ]});
  const state:CartState={loading:false,errorMessage:'',cart,addresses:[],addressId:'',currency:'ARS',idempotencyKey:'test',receipt:null,failureKind:CartFailureKind.None};
  const view=new CheckoutPageViewComponent();view.state=state;expect(view.merchandiseTotal).toBe(34000.5);expect(view.amount(view.merchandiseTotal)).toContain('34.000,50');
 });

 it.each([
  [CartFailureKind.CheckoutRetryable, 'Reintentar el mismo pago', 'Corregir carrito'],
  [CartFailureKind.CheckoutProductUnavailable, 'Corregir carrito', 'Reintentar el mismo pago'],
 ] as const)('renders one recovery CTA owned by %s', (failureKind, expected, absent) => {
  TestBed.configureTestingModule({ imports: [CheckoutPageViewComponent], providers: [provideRouter([])] });
  const fixture=TestBed.createComponent(CheckoutPageViewComponent);
  const state:CartState={
   loading:false,errorMessage:'Necesitás corregir esta compra.',
   cart:{currency:'ARS',lines:[{sku:'A',name:'A',effectiveUnitPrice:100,originalUnitPrice:100,discountAmount:0,quantity:1,offerRef:null,campaignRef:null}]},
   addresses:[{id:'address-1',street:'Calle',number:'1',city:'Ciudad',province:'Provincia',postalCode:'1000',isDefault:true}],
   addressId:'address-1',currency:'ARS',idempotencyKey:'attempt',receipt:null,failureKind,
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
});
