import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { ThemeAppearance } from '../../core/theme/theme-appearance';
import { AccessState } from '../../domain/access/session-probe';
import { CartStore } from '../cart/cart.store';
import { ShellComponent } from './shell.component';
import { ShellStore } from './shell.store';

describe('Shell access lifecycle', () => {
  it('reuses the accepted navigation state instead of rotating realm CSRF again', () => {
    const router = { events: NEVER, url: '/user/orders', navigate: vi.fn(), navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    const store = { loadHealth: vi.fn(), loadFacets: vi.fn() };
    const cart = { load: vi.fn() };
    const theme = { apply: vi.fn() };
    const access = { navigationState: vi.fn(() => of(AccessState.Anonymous)), rehydrate: vi.fn() };
    const component = TestBed.runInInjectionContext(() => new ShellComponent(
      store as unknown as ShellStore,
      cart as unknown as CartStore,
      {} as CustomerSession,
      {} as UserSession,
      theme as ThemeAppearance,
      access as unknown as AccessCoordinator,
    ));

    component.ngOnInit();

    expect(access.navigationState).toHaveBeenCalledOnce();
    expect(access.rehydrate).not.toHaveBeenCalled();
    expect(store.loadHealth).toHaveBeenCalledOnce();
    expect(store.loadFacets).toHaveBeenCalledOnce();
  });
});
