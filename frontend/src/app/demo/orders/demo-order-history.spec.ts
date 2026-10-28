import { DemoCommerce, DemoContext, DemoScenario, demoSeed } from '../demo-model';
import { PaymentStatus } from '../../domain/order/commerce-states';
import { DemoOrderDate, OrderDatePrecision } from './demo-order-date';
import { DemoOrderHistory, OrderHistoryCriteria, OrderHistoryQueryStatus, OrderPaymentFilter } from './demo-order-history';

describe('SC13 recorded dates and owned history', () => {
  it('decodes strict dates without rollover, local-zone day changes or fabricated timestamps', () => {
    for (const raw of [undefined,null,'','2026-02-30','2025-02-29','2026-10-28T12:00:00','2026-10-28T24:00:00Z','2026-10-28T12:00:00+24:00','garbage']) expect(DemoOrderDate.fromWire(raw).precision).toBe(OrderDatePrecision.Unknown);
    const day = DemoOrderDate.fromWire('2024-02-29'); expect(day.precision).toBe(OrderDatePrecision.Day); expect(day.label).toBe('29/02/2024');
    const instant = DemoOrderDate.fromWire('2026-10-28T12:00:00Z'); expect(instant.precision).toBe(OrderDatePrecision.Instant); expect(instant.time).toBe(DemoOrderDate.fromWire('2026-10-28T09:00:00-03:00').time); expect(instant.label).toContain('9:00'); expect(instant.label).toContain('Buenos Aires');
  });
  it('closes all payment filters and exposes malformed query separately from explicit Unknown', () => {
    for (const value of OrderPaymentFilter.all) expect(OrderPaymentFilter.fromWire(value.wire)).toBe(value);
    expect(OrderPaymentFilter.fromWire('invented')).toBe(OrderPaymentFilter.Unknown);
    expect(OrderHistoryCriteria.fromWire({payment:'invented'}).status).toBe(OrderHistoryQueryStatus.Unknown);
    expect(OrderHistoryCriteria.fromWire({payment:OrderPaymentFilter.Unknown.wire}).status).toBe(OrderHistoryQueryStatus.Valid);
    for (const page of ['0','-1','2.2','Infinity','9999999']) expect(OrderHistoryCriteria.fromWire({page}).status).toBe(OrderHistoryQueryStatus.Unknown);
    expect(OrderHistoryCriteria.fromWire({q:' Drill ',page:'2',payment:OrderPaymentFilter.Pending.wire}).query).toEqual({q:'Drill',page:'2',payment:OrderPaymentFilter.Pending.wire});
  });
  it('orders civil Buenos Aires days without pretending date-only records have a midnight timestamp',()=>{
    const day=DemoOrderDate.fromWire('2026-10-01'), previous=DemoOrderDate.fromWire('2026-09-30T22:00:00-03:00'), same=DemoOrderDate.fromWire('2026-10-01T23:00:00-03:00');
    expect(day.time).toBeNull();expect(day.compareNewest(previous)).toBeLessThan(0);expect(previous.compareNewest(day)).toBeGreaterThan(0);expect(day.compareNewest(same)).toBeLessThan(0);
    expect(day.compareNewest(DemoOrderDate.fromWire('invalid'))).toBeLessThan(0);expect(day.label).toBe('01/10/2026');
  });
  it('filters actor first, sorts dates not IDs, ties stably, unknown last and never mutates', () => {
    const seed = demoSeed(), original = seed.orders[0];
    const orders = [
      {...original,id:'Z-old',createdDate:'2026-01-01'}, {...original,id:'A-new',createdDate:'2026-10-28T12:00:00Z'},
      {...original,id:'B-tie',createdDate:'2026-10-28T09:00:00-03:00'}, {...original,id:'C-invalid',createdDate:'2026-02-30'},
      {...original,id:'D-missing',createdDate:undefined}, {...original,id:'foreign-secret',actor:'cliente2',createdDate:'2027-01-01'},
    ];
    const before = JSON.stringify(orders), history = new DemoOrderHistory();
    const result = history.execute(orders,DemoContext.Customer,'cliente',OrderHistoryCriteria.fromWire({}));
    expect(result.rows.map(row=>row.order.id)).toEqual(['A-new','B-tie','Z-old','C-invalid','D-missing']); expect(result.total).toBe(5);
    expect(history.execute(orders,DemoContext.Customer,'cliente',OrderHistoryCriteria.fromWire({q:'foreign-secret'})).found).toBe(0);
    expect(history.execute(orders,DemoContext.Admin,'cliente',OrderHistoryCriteria.fromWire({})).total).toBe(0);
    expect(JSON.stringify(orders)).toBe(before);
  });
  it('searches only historical ID/SKU/name across every line, supports all states and clamps pages', () => {
    const order = demoSeed().orders[0]; order.lines.push({sku:'OLD-SKU',name:'Nombre histórico único',quantity:2,unit:101});
    const history = new DemoOrderHistory();
    for (const q of [order.id.toLowerCase(),'old-sku','histórico']) expect(history.execute([order],DemoContext.Customer,order.actor,OrderHistoryCriteria.fromWire({q})).found).toBe(1);
    for (const filter of OrderPaymentFilter.all.filter(value=>value !== OrderPaymentFilter.All)) { order.payment = PaymentStatus.fromWire(filter.wire); expect(history.execute([order],DemoContext.Customer,order.actor,OrderHistoryCriteria.fromWire({payment:filter.wire})).found).toBe(1); }
    const many = Array.from({length:12},(_,index)=>({...order,id:String(index)}));
    const result = history.execute(many,DemoContext.Customer,order.actor,OrderHistoryCriteria.fromWire({page:'99'})); expect(result.page).toBe(3); expect(result.rows).toHaveLength(2);
  });
  it('captures creation clock once; idempotency does not change it; legacy reads remain untouched', () => {
    const legacy=demoSeed();delete legacy.orders[0].createdDate;
    let calls = 0; const commerce = new DemoCommerce(legacy,()=>{ calls++; return '2026-10-28T12:34:56Z'; },()=> 'SC13');
    commerce.snapshot.campaigns=[]; commerce.add('cliente','DEMO-001',1); calls=0; const order = commerce.checkout('cliente','SC13','address-cliente',DemoScenario.Pending);
    expect(calls).toBe(1); expect(order.createdDate).toBe('2026-10-28T12:34:56Z'); expect(order.history[0]).toContain(order.createdDate);
    expect(commerce.checkout('cliente','SC13','address-cliente',DemoScenario.Pending)).toBe(order); expect(calls).toBe(1);
    expect(commerce.snapshot.orders.find(value=>value.id==='DEMO-100')?.createdDate).toBeUndefined();
  });
});
