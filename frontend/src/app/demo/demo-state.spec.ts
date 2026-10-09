import { DemoApplicationState } from './demo-state';
import { DemoContext } from './demo-model';
describe('isolated commercial demo state', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it('rolls back a failed command instead of exposing partial changes', () => { const state = new DemoApplicationState(); const before = state.data.products[0].onHand; expect(state.run(() => { state.data.products[0].onHand--; throw new Error('failure'); }, 'saved')).toBe(false); expect(state.data.products[0].onHand).toBe(before); expect(state.message()).toBe(''); expect(state.error()).toBe('failure'); });
  it('rejects a stale snapshot rather than overwriting another tab', () => { const first = new DemoApplicationState(); const second = new DemoApplicationState(); expect(first.run(() => first.commerce.adjust('DEMO-001', 1, 'Ingreso'), 'saved')).toBe(true); expect(second.run(() => second.commerce.adjust('DEMO-001', 2, 'Ingreso'), 'saved')).toBe(false); expect(second.error()).toContain('otra pestaña'); });
  it('isolates customers and resets only demo keys', () => { localStorage.setItem('production-key', 'untouched'); const state = new DemoApplicationState(); state.login(DemoContext.Customer); state.run(() => state.commerce.add('cliente','DEMO-001',1), 'saved'); state.login(DemoContext.Customer,'cliente2'); expect(state.actor.cart).toHaveLength(0); state.reset(); expect(state.context()).toBe(DemoContext.Unknown); expect(state.actor.cart).toHaveLength(0); expect(localStorage.getItem('production-key')).toBe('untouched'); });
});
