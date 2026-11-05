import {TestBed} from '@angular/core/testing';
import {ActivatedRoute,convertToParamMap,provideRouter} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import {DemoOrderDetailHostComponent} from './order-detail-host.component';
import {DemoApplicationState} from '../demo-state';
import {DemoContext} from '../demo-model';
import {DemoOrderOperations} from './order-types';
import {UserRole} from '../../domain/user/user-role';
describe('SC21 capability host',()=>{
 afterEach(()=>{TestBed.resetTestingModule();localStorage.clear();sessionStorage.clear();});
 it('selects Queue and arbitrary Legacy IDs by the closed capability, and denies before private reads',()=>{localStorage.clear();sessionStorage.clear();const params=new BehaviorSubject(convertToParamMap({id:'ORD-1015'}));TestBed.configureTestingModule({providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{paramMap:params}}]}).overrideComponent(DemoOrderDetailHostComponent,{set:{template:''}});const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin,'cliente',UserRole.Operator);const host=TestBed.createComponent(DemoOrderDetailHostComponent).componentInstance;expect(host.operations()).toBe(DemoOrderOperations.Queue);params.next(convertToParamMap({id:'DEMO-100'}));expect(host.operations()).toBe(DemoOrderOperations.Legacy);params.next(convertToParamMap({id:'generated-order-123'}));expect(host.operations()).toBe(DemoOrderOperations.Unknown);state.logout();Object.defineProperty(state.commerce.snapshot,'orders',{get:()=>{throw Error('private');}});expect(host.operations()).toBe(DemoOrderOperations.Unknown);});
});
