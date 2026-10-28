import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { DemoOrderHistoryComponent } from './demo-order-history.component';
import { DemoApplicationState } from '../demo-state';
import { DemoContext, DemoScenario } from '../demo-model';

describe('SC13 route and focus adapter',()=>{
  afterEach(()=>{TestBed.resetTestingModule();localStorage.clear();sessionStorage.clear();});
  it('reacts to query/actor changes without writes and does not steal typing focus',async()=>{
    const params=new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{queryParamMap:params}}]}).overrideComponent(DemoOrderHistoryComponent,{set:{template:'@if(allowed){<h1 #historyHeading tabindex="-1">Mis pedidos</h1><h2 #resultsHeading tabindex="-1">Resultados</h2>}<input id="history-search-test"/>'}});
    const state=TestBed.inject(DemoApplicationState); state.login(DemoContext.Customer);
    const fixture=TestBed.createComponent(DemoOrderHistoryComponent); fixture.detectChanges();await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1')); const before=JSON.stringify({...localStorage});
    const input=fixture.nativeElement.querySelector('input') as HTMLInputElement;input.focus();params.next(convertToParamMap({q:'DEMO-100'}));fixture.detectChanges();await fixture.whenStable();
    expect(fixture.componentInstance.view().found).toBe(1);expect(document.activeElement).toBe(input);
    state.scenario.set(DemoScenario.Rejected);fixture.detectChanges();await fixture.whenStable();expect(document.activeElement).toBe(input);
    state.actorId.set('cliente2');expect(fixture.componentInstance.view().found).toBe(0);state.context.set(DemoContext.Admin);expect(fixture.componentInstance.view().total).toBe(0);
    expect(JSON.stringify({...localStorage})).toBe(before);
  });
});
