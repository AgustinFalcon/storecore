import {TestBed} from '@angular/core/testing';
import {ActivatedRoute,Router,convertToParamMap,provideRouter} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import {DemoApplicationState} from '../demo-state';
import {DemoContext} from '../demo-model';
import {DemoSnapshotWriter,DemoWriterStatus} from '../demo-snapshot-writer';
import {UserRole} from '../../domain/user/user-role';
import {PaymentStatus,ShipmentStatus} from '../../domain/order/commerce-states';
import {DemoSnapshotPersistence} from '../demo-snapshot-persistence';
import {DemoAdminOrdersComponent,OrderDialog} from './admin-orders.component';
import {DemoBrowserEffects} from './demo-browser-effects';

describe('SC20 component selection and transaction fences',()=>{
 it('never retries an export or reads private orders after the export session is revoked',async()=>{const {fixture,component,state}=setup();fixture.detectChanges();await fixture.whenStable();const download=vi.spyOn(TestBed.inject(DemoBrowserEffects),'downloadCsv').mockImplementation(()=>{throw Error('blocked');});component.export();component.confirm();expect(component.failure()).toBeTruthy();state.logout();fixture.detectChanges();await fixture.whenStable();Object.defineProperty(state.commerce.snapshot,'orders',{configurable:true,get:()=>{throw Error('private order read');}});expect(()=>component.confirm()).not.toThrow();expect(download).toHaveBeenCalledTimes(1);});
 it('focuses a queue entry requested by the detail URL and preserves its filter',async()=>{const {fixture,component}=setup();params.next(convertToParamMap({q:'ORD-1013',focus:'ORD-1013'}));fixture.detectChanges();await fixture.whenStable();expect(component.rows().map(order=>order.id)).toEqual(['ORD-1013']);expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-cta="order-open-ORD-1013"]'));});
 it('restores focus to queue search when the successful transition removes the filtered row',async()=>{const {fixture,component,state}=setup();params.next(convertToParamMap({q:'ORD-1014',fulfillment:ShipmentStatus.Shipped.wire}));fixture.detectChanges();await fixture.whenStable();const query=component.query(),selected=[...component.selected()];const button=fixture.nativeElement.querySelector('[data-order-id="ORD-1014"] button') as HTMLButtonElement;button.focus();button.click();fixture.detectChanges();await fixture.whenStable();component.confirm();fixture.detectChanges();await fixture.whenStable();expect(component.rows()).toEqual([]);expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input[type="search"]'));expect(component.query()).toBe(query);expect([...component.selected()]).toEqual(selected);expect(state.data.orders.find(row=>row.id==='ORD-1014')?.shipment).toBe(ShipmentStatus.Delivered);});
 it('keeps export failure recovery specific to downloading, without order review or mutations',async()=>{const {fixture,component,state}=setup();params.next(convertToParamMap({payment:PaymentStatus.Pending.wire}));fixture.detectChanges();await fixture.whenStable();const trigger=fixture.nativeElement.querySelector('[data-cta="admin-orders-export"]') as HTMLButtonElement;trigger.focus();trigger.click();fixture.detectChanges();await fixture.whenStable();const before=JSON.stringify(state.data),selected=[...component.selected()],query=component.query(),read=vi.spyOn(state,'reloadOrderSnapshot'),run=vi.spyOn(state,'run'),download=vi.spyOn(TestBed.inject(DemoBrowserEffects),'downloadCsv').mockImplementationOnce(()=>{throw Error('Download blocked');}).mockImplementation(()=>{});component.confirm();fixture.detectChanges();await fixture.whenStable();expect(component.dialog()).toBe(OrderDialog.Export);expect(fixture.nativeElement.querySelector('dialog').textContent).not.toContain('Tu propuesta');expect(fixture.nativeElement.querySelector('[data-cta="admin-order-review-current"]')).toBeNull();expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('Reintentar descarga');component.reviewCurrent();expect(read).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();expect(JSON.stringify(state.data)).toBe(before);expect([...component.selected()]).toEqual(selected);expect(component.query()).toBe(query);component.confirm();fixture.detectChanges();await fixture.whenStable();expect(download).toHaveBeenLastCalledWith('id,payment,shipment,total,incident\nORD-1012,PENDING,PENDING,198800,NONE\nORD-1019,APPROVED,SHIPPED,198800,OPEN');expect(component.dialog()).toBeNull();expect(component.feedback()).toContain('Descarga CSV solicitada');expect(document.activeElement).toBe(trigger);});
 it('restores focus to the same order link when the completed command removes its trigger',async()=>{const {fixture,component}=setup();fixture.detectChanges();await fixture.whenStable();const button=fixture.nativeElement.querySelector('[data-order-id="ORD-1014"] button') as HTMLButtonElement;button.focus();button.click();fixture.detectChanges();await fixture.whenStable();component.confirm();fixture.detectChanges();await fixture.whenStable();expect(fixture.nativeElement.querySelector('[data-order-id="ORD-1014"] button')).toBeNull();expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-cta="order-open-ORD-1014"]'));});
 let params:BehaviorSubject<ReturnType<typeof convertToParamMap>>;
 beforeEach(()=>{
  Object.defineProperties(HTMLDialogElement.prototype,{showModal:{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}},close:{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}}});
  localStorage.clear();sessionStorage.clear();DemoSnapshotWriter.browser.status.set(DemoWriterStatus.Writable);vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});
  params=new BehaviorSubject(convertToParamMap({}));TestBed.configureTestingModule({providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{queryParamMap:params,snapshot:{queryParamMap:convertToParamMap({})}}}]});
 });
 afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();});
 function setup(role=UserRole.Admin){const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin,'cliente',role);const fixture=TestBed.createComponent(DemoAdminOrdersComponent);return{state,fixture,component:fixture.componentInstance};}
 it('closes dialog phases at their decoder boundary',()=>{for(const value of OrderDialog.all)expect(OrderDialog.fromWire(value.wire)).toBe(value);for(const raw of [null,undefined,'future',0,false,{}])expect(OrderDialog.fromWire(raw)).toBe(OrderDialog.Unknown);});
 it('renders all six axes and semantic mixed selection for both operational roles',async()=>{
  const {fixture,component,state}=setup(UserRole.Operator);fixture.detectChanges();await fixture.whenStable();
  expect(fixture.nativeElement.querySelectorAll('[data-order-id]')).toHaveLength(15);expect(fixture.nativeElement.querySelectorAll('[data-order-id="ORD-1012"] dt')).toHaveLength(6);
  const header=fixture.nativeElement.querySelector('[aria-label="Seleccionar resultados visibles"]') as HTMLInputElement;expect(header.indeterminate).toBe(true);expect(header.checked).toBe(false);expect(component.selectedCount()).toBe(2);
  state.context.set(DemoContext.Customer);fixture.detectChanges();await fixture.whenStable();expect(fixture.nativeElement.querySelectorAll('[data-order-id]')).toHaveLength(0);expect(component.selectedCount()).toBe(0);expect(component.selected().size).toBe(0);
 });
 it('preserves hidden selections, exports both, and toggles only visible results',async()=>{
  const {fixture,component}=setup();fixture.detectChanges();await fixture.whenStable();
  params.next(convertToParamMap({payment:PaymentStatus.Pending.wire}));fixture.detectChanges();await fixture.whenStable();expect(component.visibleSelected()).toBe(1);expect(component.hiddenSelected()).toBe(1);
  const download=vi.spyOn(TestBed.inject(DemoBrowserEffects),'downloadCsv').mockImplementation(()=>{});component.export();fixture.detectChanges();await fixture.whenStable();expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('Exportar 2 pedidos; 1 fuera del filtro.');component.confirm();
  expect(download).toHaveBeenCalledWith('id,payment,shipment,total,incident\nORD-1012,PENDING,PENDING,198800,NONE\nORD-1019,APPROVED,SHIPPED,198800,OPEN');
  component.toggleVisible();expect([...component.selected()]).toEqual(['ORD-1019']);const navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);component.clearFilters();expect(navigate).toHaveBeenCalled();expect([...component.selected()]).toEqual(['ORD-1019']);component.clearSelection();fixture.detectChanges();await fixture.whenStable();expect(component.selectedCount()).toBe(0);expect((fixture.nativeElement.querySelector('header button') as HTMLButtonElement).disabled).toBe(true);
 });
 it('blocks malformed URL transitions and leaves typing focus intact on query changes',async()=>{
  const {fixture,component,state}=setup();fixture.detectChanges();await fixture.whenStable();const search=fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;search.focus();params.next(convertToParamMap({payment:'future'}));fixture.detectChanges();await fixture.whenStable();expect(document.activeElement).toBe(search);expect(component.query().known).toBe(false);expect(component.action(state.data.orders.find(row=>row.id==='ORD-1013')!)).toBeNull();expect(component.rows()).toHaveLength(15);
 });
 it('preserves proposal, filter, selection and focus when persistence fails',async()=>{
  const {fixture,component,state}=setup();params.next(convertToParamMap({q:'ORD-1013'}));fixture.detectChanges();await fixture.whenStable();const trigger=fixture.nativeElement.querySelector('[data-order-id="ORD-1013"] button') as HTMLButtonElement;trigger.focus();trigger.click();fixture.detectChanges();await fixture.whenStable();
  component.proposal.set('MANUAL-123');const field=fixture.nativeElement.querySelector('dialog input') as HTMLInputElement;field.focus();const before=JSON.stringify(state.data),selection=[...component.selected()],query=component.query();vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw Error('Persistencia no disponible');});component.confirm();fixture.detectChanges();await fixture.whenStable();
  expect(JSON.stringify(state.data)).toBe(before);expect(component.dialog()).toBe(OrderDialog.Transition);expect(component.proposal()).toBe('MANUAL-123');expect([...component.selected()]).toEqual(selection);expect(component.query()).toBe(query);expect(document.activeElement).toBe(field);expect(component.failure()).toBeTruthy();component.close();expect(document.activeElement).toBe(trigger);
 });
 it('rechecks identity before run and authority again inside the transaction',()=>{
  const {component,state}=setup();component.open(state.data.orders.find(row=>row.id==='ORD-1013')!);component.proposal.set('MANUAL-123');const realRun=state.run.bind(state),run=vi.spyOn(state,'run'),before=JSON.stringify(state.data);state.logout();state.login(DemoContext.Admin);component.confirm();expect(run).not.toHaveBeenCalled();expect(JSON.stringify(state.data)).toBe(before);
  component.open(state.data.orders.find(row=>row.id==='ORD-1013')!);component.proposal.set('MANUAL-123');run.mockImplementation((action,message)=>realRun(()=>{state.role.set(UserRole.Unknown);action();},message));component.confirm();expect(JSON.stringify(state.data)).toBe(before);expect(component.failure()).toContain('Acceso denegado');
 });
 it('explicitly reviews fresh state without writes or losing the proposal and refuses to overwrite a newer tracking',()=>{
  const {component,state}=setup();component.open(state.data.orders.find(row=>row.id==='ORD-1013')!);component.proposal.set('MY-PROPOSAL');const selection=[...component.selected()],fresh=JSON.parse(JSON.stringify(state.data)),row=fresh.orders.find((order:{id:string})=>order.id==='ORD-1013');row.shipment=ShipmentStatus.Shipped;row.tracking='OTHER-TAB';fresh.revision++;const durable=JSON.stringify(fresh);localStorage.setItem(DemoSnapshotPersistence.key,durable);
  component.confirm();expect(component.failure()).toBeTruthy();const writes=vi.spyOn(Storage.prototype,'setItem');component.reviewCurrent();expect(writes).not.toHaveBeenCalled();expect(component.fresh()?.tracking).toBe('OTHER-TAB');expect(component.proposal()).toBe('MY-PROPOSAL');expect([...component.selected()]).toEqual(selection);component.confirm();expect(component.dialog()).toBe(OrderDialog.Transition);expect(component.failure()).toBeTruthy();expect(localStorage.getItem(DemoSnapshotPersistence.key)).toBe(durable);expect(state.data.orders.find(order=>order.id==='ORD-1013')?.tracking).toBe('OTHER-TAB');
  state.logout();const reads=vi.spyOn(Storage.prototype,'getItem');expect(state.reloadOrderSnapshot('cliente',state.sessionEpoch())).toBe(false);expect(reads).not.toHaveBeenCalled();
 });
 it('fails closed when durable data disappears during an operational refresh',()=>{
  const {state}=setup();
  expect(state.run(()=>state.commerce.touch(),'Datos guardados.')).toBe(true);
  const before=JSON.stringify(state.data);
  localStorage.removeItem(DemoSnapshotPersistence.key);
  expect(state.reloadOrderSnapshot(state.actorId(),state.sessionEpoch())).toBe(false);
  expect(JSON.stringify(state.data)).toBe(before);
  expect(state.error()).toContain('desaparecieron');
  expect(state.run(()=>state.commerce.touch(),'No debe guardarse.')).toBe(false);
  expect(localStorage.getItem(DemoSnapshotPersistence.key)).toBeNull();
 });
});
