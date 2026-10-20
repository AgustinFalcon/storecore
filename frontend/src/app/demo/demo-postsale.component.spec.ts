import { TestBed } from '@angular/core/testing';
import { DemoPostSaleComponent } from './demo-postsale.component';
import { DemoApplicationState } from './demo-state';
import { DemoContext, demoSeed } from './demo-model';
import { DemoReturnReason, DemoReturnStatus } from './postsale/postsale-types';
import { ShipmentStatus } from '../domain/order/shipment-status';

describe('post-sale presentation', () => {
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
