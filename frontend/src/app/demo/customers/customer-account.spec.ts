import { UserRole } from '../../domain/user/user-role';
import { CustomerAccountCommand as Command, CustomerAccountFilter as Filter, CustomerAccountQuery, CustomerAccountState as State, CustomerAdministrationAuthority as Authority, decodeCustomerAccess } from './customer-account';
import { decodeSnapshot, demoSeed, DemoCommerce, DemoScenario } from '../demo-model';

describe('SC26 closed account policy', () => {
  it('decodes only canonical states, filters and commands', () => {
    for (const state of State.all) expect(State.fromWire(state.wire)).toBe(state);
    expect(State.fromWire('active')).toBe(State.Unknown); expect(State.Unknown.permitsAccess).toBe(false);
    expect(Filter.fromWire('injected')).toBe(Filter.Unknown); expect(Command.fromWire('delete')).toBe(Command.Unknown);
    expect(decodeCustomerAccess(undefined, false).state).toBe(State.Unknown);
    expect(decodeCustomerAccess({ state: { wire: 'ACTIVE' }, generation: -1, reason: '' }, false).state).toBe(State.Unknown);
  });
  it.each([[UserRole.Admin, true, true], [UserRole.Operator, true, false], [UserRole.Unknown, false, false]])('enforces the internal role matrix %s', (role, read, write) => { expect(Authority.canRead(role)).toBe(read); expect(Authority.canWrite(role)).toBe(write); });
  it('requires a reason, preserves aggregates and deduplicates repeated commands', () => {
    const commerce = new DemoCommerce(); const actor = commerce.actor('customer-2209'); actor.cart.push({ sku: 'LUM-042', quantity: 1, variant: commerce.snapshot.orders.at(-1)!.lines[0].variant! });
    const preserved = JSON.stringify({ ...actor, access: undefined }); const orders = JSON.stringify(commerce.snapshot.orders);
    expect(() => commerce.changeCustomerAccount(UserRole.Admin, actor.id, Command.Restrict, ' ')).toThrow('motivo');
    commerce.changeCustomerAccount(UserRole.Admin, actor.id, Command.Restrict, 'Solicitud de muestra'); const revision = commerce.snapshot.revision;
    commerce.changeCustomerAccount(UserRole.Admin, actor.id, Command.Restrict, 'Solicitud de muestra');
    expect(commerce.snapshot.revision).toBe(revision); expect(actor.access?.generation).toBe(1); expect(JSON.stringify({ ...actor, access: undefined })).toBe(preserved); expect(JSON.stringify(commerce.snapshot.orders)).toBe(orders);
    expect(() => commerce.checkout(actor.id, 'blocked', 'ADDR-2209', DemoScenario.Approved)).toThrow('acceso');
    commerce.changeCustomerAccount(UserRole.Admin, actor.id, Command.Reactivate, ''); expect(actor.access?.generation).toBe(2);
    expect(() => commerce.assertCustomerAccess(actor.id, 0)).toThrow('acceso'); expect(() => commerce.assertCustomerAccess(actor.id, 2)).not.toThrow();
  });
  it('rejects operator and unknown mutation before changing state', () => { const commerce = new DemoCommerce(); const before = JSON.stringify(commerce.snapshot); for (const role of [UserRole.Operator, UserRole.Unknown]) expect(() => commerce.changeCustomerAccount(role, 'customer-2209', Command.Restrict, 'motivo')).toThrow(); expect(JSON.stringify(commerce.snapshot)).toBe(before); });
  it('joins by ID and searches normalized name/email/ID with a closed filter', () => {
    const data = demoSeed(); const query = new CustomerAccountQuery('rocio', Filter.Active); const rows = data.actors.filter(actor => query.matches(actor)); expect(rows.map(actor => actor.id)).toEqual(['customer-2209']);
    expect(query.orders('customer-2209', data.orders).map(order => order.id)).toEqual(['ORD-1015']); expect(query.orders('other', [{ actor: 'customer-2209', email: 'same' }])).toEqual([]);
    expect(new CustomerAccountQuery('', Filter.Restricted).matches(rows[0])).toBe(false);
  });
  it('keeps the correlated fixture honest', () => { const seed = demoSeed(); const actor = seed.actors.find(value => value.id === 'customer-2209')!; const order = seed.orders.find(value => value.id === 'ORD-1015')!; expect(actor.addresses[0].id).toBe('ADDR-2209'); expect(actor.addresses[0].primary).toBe(false); expect(order.actor).toBe(actor.id); expect(order.lines[0].quantity).toBe(2); expect(order.lines[0].unit).toBe(8450000); expect(order.total).toBe(16900000); expect(order.tracking).toBe('SC-1015'); expect(order.method).toBeUndefined(); });
  it('migrates v1 explicitly while preserving history and failing closed on v2 missing authority', () => {
    const legacy = demoSeed(); legacy.version = 1; Reflect.deleteProperty(legacy,'aftercare'); legacy.actors = legacy.actors.filter(value => value.id !== 'customer-2209'); legacy.products = legacy.products.filter(value => value.sku !== 'LUM-042'); legacy.orders = legacy.orders.filter(value => value.id !== 'ORD-1015'); legacy.actors.forEach(value => delete value.access);
    const restored = decodeSnapshot(JSON.stringify(legacy)); expect(restored.version).toBe(demoSeed().version); expect(restored.actors[0].access?.state).toBe(State.Active); expect(restored.orders.slice(0, legacy.orders.length).map(value => value.id)).toEqual(legacy.orders.map(value => value.id)); expect(restored.orders.at(-1)?.id).toBe('ORD-1015');
    delete restored.actors[0].access; expect(decodeSnapshot(JSON.stringify(restored)).actors[0].access?.state).toBe(State.Unknown);
  });
  it('rejects migration collisions instead of reassigning history', () => { const seed = demoSeed(); seed.version = 1; seed.products = seed.products.filter(value => value.sku !== 'LUM-042'); seed.orders = seed.orders.filter(value => value.id !== 'ORD-1015'); expect(() => decodeSnapshot(JSON.stringify(seed))).toThrow('Colisión'); });
});
