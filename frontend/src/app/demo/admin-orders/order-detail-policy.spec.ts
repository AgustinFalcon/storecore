import {TestBed} from '@angular/core/testing';
import {ActivatedRoute,convertToParamMap,provideRouter} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import {DemoPageComponent} from '../demo.component';
import {DemoApplicationState} from '../demo-state';
import {DemoContext} from '../demo-model';
import {DemoScreen} from '../demo-screen';
import {DemoSnapshotWriter,DemoWriterStatus} from '../demo-snapshot-writer';
import {DemoOrderOperations} from './order-types';

describe('SC20 canonical detail cannot invoke legacy handlers',()=>{
 afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();});
 it('guards handlers before transactions and preserves the legacy scenario capability',()=>{
  localStorage.clear();sessionStorage.clear();DemoSnapshotWriter.browser.status.set(DemoWriterStatus.Writable);vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});
  const params=new BehaviorSubject(convertToParamMap({id:'ORD-1013'})),query=new BehaviorSubject(convertToParamMap({})),route={snapshot:{data:{screen:DemoScreen.AdminOrder.path},paramMap:params.value,queryParamMap:query.value},paramMap:params,queryParamMap:query};
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:ActivatedRoute,useValue:route}]}).overrideComponent(DemoPageComponent,{set:{template:''}});
  const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const fixture=TestBed.createComponent(DemoPageComponent),component=fixture.componentInstance,run=vi.spyOn(state,'run');
  for(const id of ['ORD-1013','ORD-1019','ORD-1017','ORD-1022','ORD-1015']){route.snapshot.paramMap=convertToParamMap({id});const before=JSON.stringify(state.data);expect(component.orderOperations).toBe(DemoOrderOperations.Queue);expect(component.canMutateLegacyOrder).toBe(false);for(const mutate of [()=>component.advance(),()=>component.receiveReturn(),()=>component.resolveIncident(),()=>component.saveIncident(),()=>component.resolvePayment(),()=>component.cancelPayment()])mutate();expect(run).not.toHaveBeenCalled();expect(JSON.stringify(state.data)).toBe(before);}
  route.snapshot.paramMap=convertToParamMap({id:'DEMO-100'});expect(component.orderOperations).toBe(DemoOrderOperations.Legacy);expect(component.canMutateLegacyOrder).toBe(true);state.logout();expect(component.orderOperations).toBe(DemoOrderOperations.Unknown);expect(component.canMutateLegacyOrder).toBe(false);
 });
});
