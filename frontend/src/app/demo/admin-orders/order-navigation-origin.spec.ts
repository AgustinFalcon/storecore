import {OrderNavigationOrigin as Origin} from './order-navigation-origin';
describe('closed order navigation origin',()=>{
 const orders={path:'/demo/user/orders',params:{focus:'ORD-1015'}};
 it('returns Customers only for the closed origin and ignores arbitrary destinations',()=>{expect(Origin.fromWire('CUSTOMERS').destination('customer-2209',orders)).toEqual({path:'/demo/user/customers',params:{focus:'customer-2209'}});for(const wire of ['ORDERS','https://evil.invalid','CUSTOMER',null])expect(Origin.fromWire(wire).destination('customer-2209',orders)).toBe(orders);});
});
