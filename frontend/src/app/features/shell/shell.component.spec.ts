import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { ThemeAppearance } from '../../core/theme/theme-appearance';
import { AccessContext } from '../../domain/access/access-context';
import { AccessState, SessionProbe } from '../../domain/access/session-probe';
import { CartStore } from '../cart/cart.store';
import { ShellComponent } from './shell.component';
import { ShellStore } from './shell.store';

describe('Shell access initialization', () => {
  it('reuses guard-verified authority without fencing newly started container reads', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const state = AccessState.resolve(SessionProbe.authenticated({ id: 'buyer', email: 'buyer@test', firstName: '', lastName: '', phone: '' }, 'csrf'),
      SessionProbe.Anonymous, AccessContext.Customer);
    const access = { state: () => state, rehydrate: vi.fn(() => of(state)) };
    const cart = { load: vi.fn() };
    const shell = TestBed.runInInjectionContext(() => new ShellComponent(
      { loadHealth: vi.fn(), loadFacets: vi.fn() } as unknown as ShellStore, cart as unknown as CartStore,
      new CustomerSession(), new UserSession(), { apply: vi.fn() } as unknown as ThemeAppearance,
      access as unknown as AccessCoordinator));
    shell.ngOnInit();
    expect(access.rehydrate).not.toHaveBeenCalled(); expect(cart.load).toHaveBeenCalledOnce();
  });
});
