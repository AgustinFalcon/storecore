import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { ManageBrandingUseCase } from '../../domain/branding/branding.repository';
import { BrandingPhase, MerchantBranding } from '../../domain/branding/merchant-branding';
import { StoreBrandingStore } from '../shell/store-branding.store';
import { UserBrandingComponent } from './user-branding.component';
import { UserBrandingStore } from './user-branding.store';
describe('branding leave and conflict confirmation', () => {
  afterEach(() => vi.restoreAllMocks());
  function setup() {
    const branding = MerchantBranding.fromWire({ revision: 1, businessName: 'Tienda', logoUrl: null, primaryColor: '#767676', onPrimaryColor: '#ffffff' })!;
    const session = new UserSession(); session.commit({ id: 'admin', roles: [UserRole.Admin] }, 'csrf');
    const manage = { load: vi.fn(() => of(branding)) };
    TestBed.configureTestingModule({ providers: [UserBrandingStore, { provide: UserSession, useValue: session }, { provide: ManageBrandingUseCase, useValue: manage }, { provide: StoreBrandingStore, useValue: { published: vi.fn() } }] });
    const store = TestBed.inject(UserBrandingStore); store.syncActor(); store.load();
    const component = TestBed.runInInjectionContext(() => new UserBrandingComponent(store));
    store.edit({ ...store.snapshot.draft, businessName: 'Borrador' });
    return { store, component, manage, session };
  }
  it('preserves conflict and draft when reload is declined, and explicitly discards on confirmation', () => {
    const { store, component, manage } = setup(); store.patchState({ phase: BrandingPhase.Conflict, conflict: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); component.reload();
    expect(store.snapshot.draft.businessName).toBe('Borrador'); expect(store.snapshot.conflict).toBe(true); expect(manage.load).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true); component.reload(); expect(store.dirty).toBe(false); expect(store.snapshot.conflict).toBe(false);
  });
  it('loads the new actor even when an old callback synchronizes actor identity before the effect', () => {
    const session = new UserSession(); session.commit({ id: 'admin-a', roles: [UserRole.Admin] }, 'csrf');
    const requests: Subject<MerchantBranding>[] = [];
    const manage = { load: vi.fn(() => { const request = new Subject<MerchantBranding>(); requests.push(request); return request; }) };
    TestBed.configureTestingModule({ providers: [UserBrandingStore, { provide: UserSession, useValue: session }, { provide: ManageBrandingUseCase, useValue: manage }, { provide: StoreBrandingStore, useValue: { published: vi.fn() } }] });
    const store = TestBed.inject(UserBrandingStore);
    TestBed.runInInjectionContext(() => new UserBrandingComponent(store)); TestBed.tick();
    session.commit({ id: 'admin-b', roles: [UserRole.Admin] }, 'next');
    requests[0].next(MerchantBranding.Default);
    expect(store.snapshot.published).toBeNull(); TestBed.tick();
    expect(manage.load).toHaveBeenCalledTimes(2);
    const branding = MerchantBranding.fromWire({ revision: 2, businessName: 'Nueva tienda', logoUrl: null, primaryColor: '#767676', onPrimaryColor: '#ffffff' })!;
    requests[1].next(branding); expect(store.snapshot.published).toBe(branding);
  });
  it('protects dirty navigation and browser exit, but clears state on logout', () => {
    const { store, component, session } = setup(); vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(component.canDeactivate()).toBe(false);
    const event = { preventDefault: vi.fn(), returnValue: 'initial' } as unknown as BeforeUnloadEvent;
    component.beforeUnload(event); expect(event.preventDefault).toHaveBeenCalled(); expect(event.returnValue).toBe('');
    store.patchState({ phase: BrandingPhase.Saving }); expect(component.canDeactivate()).toBe(false);
    session.clear(); expect(component.canDeactivate()).toBe(true); expect(store.snapshot.published).toBeNull();
  });
});
