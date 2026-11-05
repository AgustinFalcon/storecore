import { DemoApplicationState } from '../demo-state';
import { DemoContext, DemoScenario, decodeSnapshot } from '../demo-model';
import { DemoSnapshotPersistence } from '../demo-snapshot-persistence';
import { DemoSnapshotWriter } from '../demo-snapshot-writer';
import { UserRole } from '../../domain/user/user-role';
import { CustomerAccountCommand as Command, CustomerAccountResult as Result, CustomerAccountState as State } from './customer-account';

// State instances own app-lifetime storage listeners; dispose them between specimens.
let storageListeners:EventListenerOrEventListenerObject[]=[];
beforeEach(()=>{
 storageListeners=[];const add=window.addEventListener.bind(window);
 vi.spyOn(window,'addEventListener').mockImplementation((type,listener,options)=>{if(type==='storage')storageListeners.push(listener);add(type,listener,options);});
});
afterEach(()=>{for(const listener of storageListeners)window.removeEventListener('storage',listener);vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();});
describe('SC26 executable session integration', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(DemoSnapshotWriter.browser, 'assertWritable').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });
  const admin = (): DemoApplicationState => { const state = new DemoApplicationState(); state.login(DemoContext.Admin); return state; };
  it('persists one restriction write, repeat writes nothing and cancellation writes nothing', () => { const state = admin(); const write = vi.spyOn(Storage.prototype, 'setItem'); expect(write).not.toHaveBeenCalled(); expect(state.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo')).toBe(Result.Saved); expect(write).toHaveBeenCalledTimes(1); state.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo'); expect(write).toHaveBeenCalledTimes(1); });
  it('rejects an operator command and customer command', () => { const state = admin(); state.login(DemoContext.Admin, 'cliente', UserRole.Operator); expect(state.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo')).toBe(Result.Denied); state.login(DemoContext.Customer); expect(state.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo')).toBe(Result.Denied); });
  it('blocks login while restricted and requires a new login after reactivation', () => { const state = admin(); state.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo'); expect(state.login(DemoContext.Customer, 'customer-2209')).toBe(false); state.changeCustomerAccount('customer-2209', Command.Reactivate, ''); expect(state.login(DemoContext.Customer, 'customer-2209')).toBe(true); expect(() => state.validateCustomerSession()).not.toThrow(); });
  it('revokes the affected session across storage events while keeping unrelated account access', () => {
    const customer = new DemoApplicationState(); customer.login(DemoContext.Customer, 'customer-2209'); const staff = admin(); staff.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo');
    window.dispatchEvent(new StorageEvent('storage', { key: DemoSnapshotPersistence.key })); expect(customer.context()).toBe(DemoContext.Unknown); expect(staff.context()).toBe(DemoContext.Admin);
    const other = new DemoApplicationState(); expect(other.login(DemoContext.Customer, 'cliente2')).toBe(true);
  });
  it('rejects stale sessionStorage after restrict/reactivate, including reload', () => {
    const customer = new DemoApplicationState(); customer.login(DemoContext.Customer, 'customer-2209'); const oldGeneration = sessionStorage.getItem('storecore.demo.generation')!;
    const staff = admin(); staff.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo'); staff.changeCustomerAccount('customer-2209', Command.Reactivate, '');
    sessionStorage.setItem('storecore.demo.context', 'customer'); sessionStorage.setItem('storecore.demo.actor', 'customer-2209'); sessionStorage.setItem('storecore.demo.generation', oldGeneration);
    const restored = new DemoApplicationState(); expect(restored.context()).toBe(DemoContext.Unknown); expect(restored.login(DemoContext.Customer, 'customer-2209')).toBe(true);
  });
  it('revalidates a pending checkout against durable access before action', () => { const customer = new DemoApplicationState(); customer.login(DemoContext.Customer, 'customer-2209'); customer.run(() => customer.commerce.add('customer-2209', 'LUM-042', 1), 'added'); const staff = admin(); staff.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo'); const orders = customer.data.orders.length; expect(customer.run(() => customer.commerce.checkout('customer-2209', 'pending', 'ADDR-2209', DemoScenario.Approved), 'order')).toBe(false); expect(customer.data.orders).toHaveLength(orders); expect(customer.actor.cart).toHaveLength(1); });
  it('fails precommit without changing memory, state generation or persisted snapshot', () => { const state = admin(); const before = JSON.stringify(state.data); vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); }); expect(state.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo')).toBe(Result.Failed); expect(JSON.stringify(state.data)).toBe(before); expect(state.error()).toBe('quota'); });
  it('requires refresh on conflict and cannot overwrite the newer state', () => { const first = admin(); const stale = admin(); first.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo'); expect(stale.changeCustomerAccount('customer-2209', Command.Reactivate, '')).toBe(Result.Conflict); expect(stale.error()).toContain('otra pestaña'); expect(decodeSnapshot(localStorage.getItem(DemoSnapshotPersistence.key)!).actors.find(value => value.id === 'customer-2209')?.access?.state).toBe(State.Restricted); });
  it('corrupt persistence never rehydrates authorization from the seed', () => { localStorage.setItem(DemoSnapshotPersistence.key, '{corrupt'); sessionStorage.setItem('storecore.demo.context', 'customer'); sessionStorage.setItem('storecore.demo.actor', 'cliente'); sessionStorage.setItem('storecore.demo.generation', '0'); const state = new DemoApplicationState(); expect(state.context()).toBe(DemoContext.Unknown); expect(state.login(DemoContext.Customer)).toBe(false); expect(state.login(DemoContext.Admin)).toBe(false); });
  it('actor change and logout advance the cancellation generation', () => { const state = new DemoApplicationState(); state.login(DemoContext.Customer); const epoch = state.sessionEpoch(); state.login(DemoContext.Customer, 'cliente2'); expect(state.sessionEpoch()).toBeGreaterThan(epoch); const next = state.sessionEpoch(); state.logout(); expect(state.sessionEpoch()).toBeGreaterThan(next); });
  it('explicit reset does not resurrect a previous session generation', () => { const customer = new DemoApplicationState(); customer.login(DemoContext.Customer, 'customer-2209'); const staff = admin(); staff.reset(); expect(() => customer.validateCustomerSession()).toThrow('revocada'); expect(customer.login(DemoContext.Customer, 'customer-2209')).toBe(true); });
  it('keeps the operator read-only when reset would rewrite account access', () => { const state = admin(); state.changeCustomerAccount('customer-2209', Command.Restrict, 'motivo'); state.login(DemoContext.Admin, 'cliente', UserRole.Operator); const before = JSON.stringify(state.data); expect(state.reset()).toBe(false); expect(JSON.stringify(state.data)).toBe(before); expect(state.error()).toContain('Operador'); });
  it('fails closed when the persisted snapshot is an empty string', () => { localStorage.setItem(DemoSnapshotPersistence.key, ''); sessionStorage.setItem('storecore.demo.context', DemoContext.Customer.wire); sessionStorage.setItem('storecore.demo.actor', 'customer-2209'); sessionStorage.setItem('storecore.demo.generation', '0'); const state = new DemoApplicationState(); expect(state.authorizationAvailable).toBe(false); expect(state.context()).toBe(DemoContext.Unknown); expect(state.login(DemoContext.Customer, 'customer-2209')).toBe(false); });
  it('does not authorize from memory after previously persisted authority disappears', () => { const state = admin(); state.run(() => state.commerce.touch(), 'saved'); localStorage.removeItem(DemoSnapshotPersistence.key); expect(state.login(DemoContext.Customer, 'customer-2209')).toBe(false); expect(state.error()).toContain('desaparecieron'); });
});

describe('SC26 durable account outcomes', () => {
 beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(DemoSnapshotWriter.browser, 'assertWritable').mockImplementation(() => {}); });
 afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });
 it('decodes the closed outcome set and rejects future wire values', () => { for(const value of [Result.Saved,Result.Failed,Result.Conflict,Result.Uncertain,Result.Denied])expect(Result.fromWire(value.wire)).toBe(value); expect(Result.fromWire('FUTURE')).toBe(Result.Unknown); });
 for(const command of [Command.Restrict,Command.Reactivate]) {
  it(command.label + ': unreadable readback and failed rollback is uncertain; reconcile never replays', () => {
   const customer=new DemoApplicationState(); customer.login(DemoContext.Customer,'customer-2209');
   const oldGeneration=customer.data.actors.find(a=>a.id==='customer-2209')!.access!.generation;
   const state=new DemoApplicationState(); state.login(DemoContext.Admin);
   if(command===Command.Reactivate)state.changeCustomerAccount('customer-2209',Command.Restrict,'previo');
   else state.run(()=>state.commerce.touch(),'snapshot');
   const before=JSON.stringify(state.data), originalSet=Storage.prototype.setItem, originalGet=Storage.prototype.getItem;
   let writes=0, broken=false;
   const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){if(this===localStorage&&key===DemoSnapshotPersistence.key){writes++;if(writes>1)throw Error('rollback');originalSet.call(this,key,value);broken=true;return;}originalSet.call(this,key,value);});
   const read=vi.spyOn(Storage.prototype,'getItem').mockImplementation(function(this:Storage,key){if(this===localStorage&&key===DemoSnapshotPersistence.key&&broken)throw Error('readback');return originalGet.call(this,key);});
   expect(state.changeCustomerAccount('customer-2209',command,'motivo')).toBe(Result.Uncertain);
   expect(state.customerAccountUncertain()).toBe(true);expect(state.message()).toBe('');expect(JSON.stringify(state.data)).toBe(before);
   expect(state.changeCustomerAccount('customer-2209',command,'motivo')).toBe(Result.Uncertain);expect(writes).toBe(2);
   expect(state.reconcileCustomerAccount()).toBe(false);expect(writes).toBe(2);
   read.mockRestore();write.mockRestore();const noReplay=vi.spyOn(Storage.prototype,'setItem');
   expect(state.reconcileCustomerAccount()).toBe(true);expect(noReplay).not.toHaveBeenCalled();expect(state.customerAccountUncertain()).toBe(false);
   const account=state.data.actors.find(a=>a.id==='customer-2209')!.access!;
   expect(account.state).toBe(command.target);expect(account.generation).toBeGreaterThan(oldGeneration);
   expect(()=>customer.validateCustomerSession()).toThrow();
   const other=new DemoApplicationState();expect(other.login(DemoContext.Customer,'cliente2')).toBe(true);
  });
 }
 it('revalidates session and writer immediately before storage mutation',()=>{
  const state=new DemoApplicationState();state.login(DemoContext.Admin);let checks=0;
  vi.mocked(DemoSnapshotWriter.browser.assertWritable).mockImplementation(()=>{if(++checks===2)state.sessionEpoch.update(v=>v+1);});
  const write=vi.spyOn(Storage.prototype,'setItem');expect(state.changeCustomerAccount('customer-2209',Command.Restrict,'motivo')).toBe(Result.Denied);expect(write).not.toHaveBeenCalled();
 });
});

describe('SC26 verified rollback',()=>{
 beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});});afterEach(()=>{vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();});
 for(const command of [Command.Restrict,Command.Reactivate])it(command.label+': only a verified rollback permits Failed',()=>{
  const state=new DemoApplicationState();state.login(DemoContext.Admin);state.run(()=>state.commerce.touch(),'initial');if(command===Command.Reactivate)state.changeCustomerAccount('customer-2209',Command.Restrict,'previo');
  const before=JSON.stringify(state.data),prior=localStorage.getItem(DemoSnapshotPersistence.key),originalSet=Storage.prototype.setItem,originalGet=Storage.prototype.getItem;let wrote=false,failed=false;
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){originalSet.call(this,key,value);if(this===localStorage&&key===DemoSnapshotPersistence.key)wrote=true;});
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(function(this:Storage,key){if(this===localStorage&&key===DemoSnapshotPersistence.key&&wrote&&!failed){failed=true;throw Error('readback');}return originalGet.call(this,key);});
  expect(state.changeCustomerAccount('customer-2209',command,'motivo')).toBe(Result.Failed);expect(state.customerAccountUncertain()).toBe(false);expect(JSON.stringify(state.data)).toBe(before);expect(localStorage.getItem(DemoSnapshotPersistence.key)).toBe(prior);
 });
});
