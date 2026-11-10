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
});
