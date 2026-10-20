import { TestBed } from '@angular/core/testing';
import { DemoPostSaleComponent } from './demo-postsale.component';
import { DemoApplicationState } from './demo-state';
import { DemoContext, demoSeed } from './demo-model';
import { DemoReturnReason, DemoReturnStatus } from './postsale/postsale-types';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoCustomerOrderFilter } from './demo-customer-order-filter';

describe('post-sale presentation', () => {
  it('applies exact customer selection to administrative return queues and alerts', () => {
    const data=demoSeed();
    const own={id:'own',orderId:'DEMO-100',actorId:'cliente',status:DemoReturnStatus.Requested};
    const other={...own,id:'other',actorId:'cliente2'};
    const alerts=[{id:'one',actorId:'cliente'},{id:'two',actorId:'cliente2'}];
    TestBed.configureTestingModule({providers:[{provide:DemoApplicationState,useValue:{data:{...data,returns:[own,other],postSaleAlerts:alerts},context:()=>DemoContext.Admin,actorId:()=> 'admin'}}]});
    const component=TestBed.runInInjectionContext(()=>new DemoPostSaleComponent());
    component.customerFilter=DemoCustomerOrderFilter.fromWire('cliente',data.actors);
    expect(component.requests).toEqual([own]);
    expect(component.alerts).toEqual([alerts[0]]);
  });
  it('resolves each return presentation from its frozen order line, never the current catalog', () => {
    const data=demoSeed(), order=data.orders[0], first=order.lines[0];
    const second={...first,variantId:data.products[0].variants[1].id,variantLabel:'Estuche histórico',attributes:[{name:'Color',value:'Azul histórico'}],unit:first.unit+250000};
    order.lines.push(second);
    data.products[0].variants[1].label='Etiqueta actual distinta';
    data.products[0].variants[1].attributes=[{name:'Color',value:'Rojo actual'}];
    data.products[0].variants[1].price=9999900;
    TestBed.configureTestingModule({providers:[{provide:DemoApplicationState,useValue:{data}}]});
    const component=TestBed.runInInjectionContext(()=>new DemoPostSaleComponent());
    const request={orderId:order.id} as import('./postsale/postsale-types').DemoReturnRequest;
    expect(component.purchasedLine(request,first)).toBe(first);
    expect(component.purchasedLine(request,second)).toBe(second);
    expect(component.purchasedLine(request,second)?.variantLabel).toBe('Estuche histórico');
    expect(component.purchasedLine(request,second)?.attributes).toEqual([{name:'Color',value:'Azul histórico'}]);
    expect(component.purchasedLine(request,second)?.unit).toBe(first.unit+250000);
    expect(component.purchasedLine(request,{sku:first.sku,variantId:'missing'})).toBeUndefined();
  });
  it('submits compound product and variant identities to the post-sale command', () => {
    const data = demoSeed(), order = data.orders[0]; order.shipment = ShipmentStatus.Delivered;
    order.lines.push({ ...order.lines[0], sku: 'OTHER', name: 'Otro producto' });
    const request = vi.fn();
    TestBed.configureTestingModule({providers:[{provide:DemoApplicationState,useValue:{data,context:()=>DemoContext.Customer,actorId:()=>order.actor,error:{set:vi.fn()},commerce:{postSale:{request}},run:(operation:()=>void)=>{operation();return true;}}}]});
    const component = TestBed.runInInjectionContext(()=>new DemoPostSaleComponent()); component.order=order;
    component.quantities[component.key(order.lines[0])]=1;
    component.selectReason(component.key(order.lines[0]), DemoReturnReason.Damaged.wire);
    component.quantities[component.key(order.lines[1])]=1;
    component.selectReason(component.key(order.lines[1]), DemoReturnReason.WrongProduct.wire);
    component.submit();
    const selections=request.mock.calls[0][3];
    expect(selections).toHaveLength(2);
    expect(selections[0].sku).not.toBe(selections[1].sku);
    expect(selections[0].reason).toBe(DemoReturnReason.Damaged);
    expect(selections[1].reason).toBe(DemoReturnReason.WrongProduct);
    expect(component.quantities).toEqual({});
  });
  it('reads customer queues from top-level returns and hides another customer', () => {
    const data=demoSeed();
    const own={id:'own',orderId:data.orders[0].id,actorId:'cliente',status:DemoReturnStatus.Requested};
    const other={...own,id:'other',actorId:'cliente2'};
    TestBed.configureTestingModule({providers:[{provide:DemoApplicationState,useValue:{data:{...data,returns:[own,other]},context:()=>DemoContext.Customer,actorId:()=> 'cliente'}}]});
    const component=TestBed.runInInjectionContext(()=>new DemoPostSaleComponent());
    expect(component.requests).toEqual([own]);
    component.selectFilter('future');
    expect(component.requests).toHaveLength(0);
  });
});
