import {TestBed} from '@angular/core/testing';
import {ActivatedRoute,convertToParamMap,provideRouter} from '@angular/router';
import {DemoApplicationState} from '../demo-state';
import {DemoContext} from '../demo-model';
import {DemoSnapshotWriter,DemoWriterStatus} from '../demo-snapshot-writer';
import {CustomerAccountCommand as Command,CustomerAccountResult as Result} from './customer-account';
import {DemoCustomersComponent} from './demo-customers.component';
// State instances own app-lifetime storage listeners; dispose them between specimens.
let storageListeners:EventListenerOrEventListenerObject[]=[];
beforeEach(()=>{
 storageListeners=[];const add=window.addEventListener.bind(window);
 vi.spyOn(window,'addEventListener').mockImplementation((type,listener,options)=>{if(type==='storage')storageListeners.push(listener);add(type,listener,options);});
});
afterEach(()=>{for(const listener of storageListeners)window.removeEventListener('storage',listener);vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();});
describe('SC26 uncertain account presentation',()=>{
 beforeEach(()=>{localStorage.clear();sessionStorage.clear();DemoSnapshotWriter.browser.status.set(DemoWriterStatus.Writable);Object.defineProperties(HTMLDialogElement.prototype,{showModal:{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}},close:{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}}});TestBed.configureTestingModule({providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({})}}}]});});
 afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();});
 it('moves uncertain confirmation to read-only consultation and never calls the command on reconcile',async()=>{
  const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const fixture=TestBed.createComponent(DemoCustomersComponent);fixture.detectChanges();await fixture.whenStable();const c=fixture.componentInstance;c.open(state.data.actors.find(a=>a.id==='customer-2209')!);c.prepare(Command.Restrict);c.reason='motivo';
  const write=vi.spyOn(state,'changeCustomerAccount').mockImplementation(()=>{state.customerAccountUncertain.set(true);return Result.Uncertain;});c.confirm();fixture.detectChanges();await fixture.whenStable();
  expect(c.writable).toBe(false);expect(c.command()).toBe(Command.Unknown);expect(c.reason).toBe('motivo');expect(fixture.nativeElement.textContent).toContain(Result.Uncertain.label);expect(fixture.nativeElement.querySelector('#customer-summary').textContent).not.toContain(' · Activa');
  c.confirm();expect(write).toHaveBeenCalledTimes(1);const read=vi.spyOn(state,'reconcileCustomerAccount').mockImplementation(()=>{state.customerAccountUncertain.set(false);return true;});c.reconcile();expect(read).toHaveBeenCalledOnce();expect(write).toHaveBeenCalledTimes(1);fixture.detectChanges();await fixture.whenStable();
 });
});
