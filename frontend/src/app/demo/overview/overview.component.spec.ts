import { TestBed } from '@angular/core/testing';
import { ActivatedRoute,convertToParamMap,provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { DemoOverviewComponent } from './overview.component';
import { DemoApplicationState } from '../demo-state';
import { DemoContext,DemoScenario } from '../demo-model';
import { UserRole } from '../../domain/user/user-role';
import { OverviewRange } from './overview-types';

describe('SC15 reactive access and focus',()=>{
  afterEach(()=>{TestBed.resetTestingModule();localStorage.clear();sessionStorage.clear();});
  function setup(){const query=new BehaviorSubject(convertToParamMap({}));TestBed.configureTestingModule({providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{queryParamMap:query}}]}).overrideComponent(DemoOverviewComponent,{set:{template:'<h1 #overviewHeading tabindex="-1">Resumen</h1><button id="control">Control</button>'}});const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const fixture=TestBed.createComponent(DemoOverviewComponent);return{query,state,fixture,component:fixture.componentInstance};}
  it('focuses entry and authority changes, but not period/shell; clock reference stays fixed',async()=>{const{fixture,state,component,query}=setup();fixture.detectChanges();await fixture.whenStable();expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1'));const reference=component.reference,button=fixture.nativeElement.querySelector('button') as HTMLButtonElement;button.focus();query.next(convertToParamMap({range:OverviewRange.Week.wire}));state.scenario.set(DemoScenario.Rejected);fixture.detectChanges();await fixture.whenStable();expect(document.activeElement).toBe(button);expect(component.reference).toBe(reference);expect(component.view()?.range).toBe(OverviewRange.Week);state.role.set(UserRole.Operator);fixture.detectChanges();await fixture.whenStable();expect(component.view()?.actions).toHaveLength(2);expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1'));state.logout();fixture.detectChanges();await fixture.whenStable();expect(component.view()).toBeNull();});
  it('keeps unknown query distinct from All without invoking writes',()=>{const{component,state,query}=setup();const before=JSON.stringify(state.data),run=vi.spyOn(state,'run');query.next(convertToParamMap({range:'untrusted'}));expect(component.range()).toBe(OverviewRange.Unknown);expect(component.view()?.metrics).toBeNull();expect(run).not.toHaveBeenCalled();expect(JSON.stringify(state.data)).toBe(before);});
});
