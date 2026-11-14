import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { ManageBrandingUseCase } from '../../domain/branding/branding.repository';
import { BrandingAuthorityError, BrandingPhase, MerchantBranding } from '../../domain/branding/merchant-branding';
import { StoreBrandingStore } from '../shell/store-branding.store';
import { UserBrandingStore } from './user-branding.store';
const branding = (revision = 1) => MerchantBranding.fromWire({ revision, businessName: 'Tienda', logoUrl: null, primaryColor: '#767676', onPrimaryColor: '#ffffff' })!;
describe('ADMIN branding editor', () => {
  function setup() {
    const gets: Subject<MerchantBranding>[] = [], puts: Subject<MerchantBranding>[] = [];
    const manage = { load: vi.fn(() => { const request = new Subject<MerchantBranding>(); gets.push(request); return request; }), execute: vi.fn(() => { const request = new Subject<MerchantBranding>(); puts.push(request); return request; }) };
    const publicBranding = { published: vi.fn() };
    const session = new UserSession(); session.commit({ id: 'admin-a', roles: [UserRole.Admin] }, 'csrf');
    TestBed.configureTestingModule({ providers: [UserBrandingStore, { provide: ManageBrandingUseCase, useValue: manage }, { provide: StoreBrandingStore, useValue: publicBranding }, { provide: UserSession, useValue: session }] });
    const store = TestBed.inject(UserBrandingStore); store.syncActor(); store.load();
    return { store, session, gets, puts, manage, publicBranding };
  }
  it('allows one publish, preserves draft on error/conflict and requires confirmed reload', () => {
    const { store, gets, puts, manage, publicBranding } = setup(); gets[0].next(branding());
    store.edit({ ...store.snapshot.draft, businessName: 'Nueva tienda' }); store.publish(); store.publish();
    expect(manage.execute).toHaveBeenCalledTimes(1);
    puts[0].error(new HttpErrorResponse({ status: 409 }));
    expect(store.snapshot.phase).toBe(BrandingPhase.Conflict); expect(store.snapshot.draft.businessName).toBe('Nueva tienda');
    store.publish(); store.load(); expect(manage.load).toHaveBeenCalledTimes(1);
    store.load(true); gets[1].next(branding(2)); expect(store.dirty).toBe(false);
    store.edit({ ...store.snapshot.draft, businessName: 'Final' }); store.publish(); puts[1].next(branding(3));
    expect(publicBranding.published).toHaveBeenCalledWith(branding(3)); expect(store.snapshot.phase).toBe(BrandingPhase.Success);
  });
  it('blocks retry after malformed publish authority and preserves the dirty draft', () => {
    const { store, gets, puts, manage } = setup(); gets[0].next(branding());
    store.edit({ ...store.snapshot.draft, businessName: 'Borrador' }); store.publish(); puts[0].error(new BrandingAuthorityError());
    expect(store.snapshot.published).toBeNull(); expect(store.dirty).toBe(true); store.publish(); expect(manage.execute).toHaveBeenCalledTimes(1);
  });
  it('revokes malformed authority while preserving a same-actor dirty draft and leave protection', () => {
    const { store, gets, manage } = setup(); gets[0].next(branding());
    store.edit({ ...store.snapshot.draft, businessName: 'Mi borrador' }); store.load(true); gets[1].error(new Error('bad wire'));
    expect(store.snapshot.published).toBeNull(); expect(store.snapshot.draft.businessName).toBe('Mi borrador'); expect(store.dirty).toBe(true);
    store.publish(); expect(manage.execute).not.toHaveBeenCalled();
  });
  for (const transition of ['logout', 'actor', 'role'] as const) {
    for (const operation of ['GET', 'PUT'] as const) {
      it('rejects a late ' + operation + ' on ' + transition + ' even before the component effect runs', () => {
        const { store, session, gets, puts, publicBranding } = setup();
        if (operation === 'PUT') { gets[0].next(branding()); store.edit({ ...store.snapshot.draft, businessName: 'Borrador' }); store.publish(); }
        if (transition === 'logout') session.clear();
        if (transition === 'actor') session.commit({ id: 'admin-b', roles: [UserRole.Admin] }, 'next');
        if (transition === 'role') session.commit({ id: 'admin-a', roles: [UserRole.Operator] }, 'next');
        (operation === 'GET' ? gets[0] : puts[0]).next(branding(5));
        expect(store.snapshot.published).toBeNull(); expect(store.dirty).toBe(false); expect(store.snapshot.draft.businessName).toBe('StoreCore');
        expect(publicBranding.published).not.toHaveBeenCalled();
      });
    }
  }
  it('cancels active reads on actor sync and blocks non-admin actions', () => {
    const { store, session, gets, manage } = setup(); session.commit({ id: 'operator', roles: [UserRole.Operator] }, 'next'); store.syncActor();
    expect(gets[0].observed).toBe(false); store.load(); store.publish(); expect(manage.load).toHaveBeenCalledTimes(1); expect(manage.execute).not.toHaveBeenCalled();
    expect(store.snapshot.phase).toBe(BrandingPhase.AccessDenied);
  });
});
