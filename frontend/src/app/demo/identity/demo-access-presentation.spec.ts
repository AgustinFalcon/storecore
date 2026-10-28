import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DemoPageComponent } from '../demo.component';
import { DemoApplicationState } from '../demo-state';
import { DemoContext } from '../demo-model';
import { DemoScreen } from '../demo-screen';
import { UserRole } from '../../domain/user/user-role';

describe('Buyer access presentation boundary', () => {
  function setup() {
    const params = convertToParamMap({ returnUrl: '/demo/cart' });
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: {
      snapshot: { data: { screen: DemoScreen.Register.path }, queryParamMap: params, paramMap: convertToParamMap({}) },
      queryParamMap: of(params), paramMap: of(convertToParamMap({})),
    } }] }).overrideComponent(DemoPageComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(DemoPageComponent);
    const state = TestBed.inject(DemoApplicationState);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentInstance.profileName = 'New buyer'; fixture.componentInstance.email = 'newbuyer@demo.invalid'; fixture.componentInstance.password = 'demo';
    return { fixture, component: fixture.componentInstance, state, navigate };
  }
  afterEach(() => { localStorage.clear(); sessionStorage.clear(); TestBed.resetTestingModule(); });
  it('does not authenticate or navigate after a failed account transaction', () => {
    const { component, state, navigate } = setup();
    vi.spyOn(state, 'run').mockReturnValue(false); const login = vi.spyOn(state, 'login');
    component.register(); expect(login).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
  it('does not navigate when login rejects after successful registration', () => {
    const { component, state, navigate } = setup();
    vi.spyOn(state, 'run').mockReturnValue(true); vi.spyOn(state, 'login').mockReturnValue(false);
    component.register(); expect(navigate).not.toHaveBeenCalled();
  });
  it('navigates only after successful registration and authentication', () => {
    const { component, state, navigate } = setup();
    vi.spyOn(state, 'run').mockReturnValue(true); const login = vi.spyOn(state, 'login').mockReturnValue(true);
    component.register(); expect(login).toHaveBeenCalledWith(DemoContext.Customer, expect.stringMatching(/^customer-/)); expect(navigate).toHaveBeenCalledWith('/demo/cart');
  });
  it('does not authenticate unknown contexts or administrative roles', () => {
    const { component, state, navigate } = setup(); const login = vi.spyOn(state, 'login');
    component.context(DemoContext.Unknown); component.context(DemoContext.Admin, UserRole.Unknown);
    expect(login).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
});
