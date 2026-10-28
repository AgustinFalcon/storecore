import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { DemoCheckoutResultComponent } from './demo-checkout-result.component';
import { DemoApplicationState } from '../demo-state';
import { DemoContext } from '../demo-model';

describe('SC12A result route and authority integration', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); sessionStorage.clear(); });
  it('reacts to reused route parameters and actor/realm changes without writing', () => {
    const params = new BehaviorSubject(convertToParamMap({ orderId: 'DEMO-100' }));
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params.value }, paramMap: params } }] }).overrideComponent(DemoCheckoutResultComponent, { set: { template: '' } });
    const state = TestBed.inject(DemoApplicationState); state.login(DemoContext.Customer);
    const fixture = TestBed.createComponent(DemoCheckoutResultComponent); const component = fixture.componentInstance;
    const before = JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } });
    expect(component.result().order?.id).toBe('DEMO-100'); params.next(convertToParamMap({ orderId: 'DEMO-101' })); expect(component.result().order?.id).toBe('DEMO-101');
    params.next(convertToParamMap({ orderId: 'DEMO-102' })); expect(component.result().order).toBeNull();
    params.next(convertToParamMap({ orderId: 'DEMO-100' })); state.actorId.set('cliente2'); expect(component.result().order).toBeNull();
    state.actorId.set('cliente'); state.context.set(DemoContext.Admin); expect(component.allowed).toBe(false); expect(component.result().order).toBeNull();
    expect(JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })).toBe(before);
  });
});
