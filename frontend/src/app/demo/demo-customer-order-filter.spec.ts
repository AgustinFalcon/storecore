import { DemoCustomerOrderFilter as Filter } from './demo-customer-order-filter';
import { demoSeed } from './demo-model';
describe('exact validated customer order filter',()=>{
  it('matches cliente exactly and never includes cliente2',()=>{
    const data=demoSeed(),filter=Filter.fromWire('cliente',data.actors);
    expect(filter.customerId).toBe('cliente');expect(filter.matches({actor:'cliente'})).toBe(true);expect(filter.matches({actor:'cliente2'})).toBe(false);
    expect(data.orders.filter(filter.matches).map(order=>order.actor)).toEqual(['cliente','cliente']);
  });
  it('fails closed on unknown, administrative, empty, malformed or non-text identity',()=>{
    const actors=demoSeed().actors;
    for(const raw of ['admin','unknown','',' cliente','cliente ','../cliente',12,{}])expect(Filter.fromWire(raw,actors)).toBe(Filter.Unknown);
    expect(Filter.Unknown.matches({actor:'cliente'})).toBe(false);
  });
  it('uses All only when selection is absent and cannot confuse display text with identity',()=>{
    const actors=demoSeed().actors;
    expect(Filter.fromWire(null,actors)).toBe(Filter.All);expect(Filter.fromWire(undefined,actors)).toBe(Filter.All);
    expect(Filter.fromWire('Alex',actors)).toBe(Filter.Unknown);
    expect(Filter.All.matches({actor:'cliente2'})).toBe(true);
  });
});
