import { ComponentFixture, TestBed } from '@angular/core/testing';
import { mapMercadoLibreAccount } from '../../data/mappers/http-mappers';
import { MercadoLibreAccountStatus as Status } from '../../domain/user/mercadolibre-account-status';
import { InstallationState } from './installation.store';
import { UserMercadoLibreViewComponent } from './user-mercadolibre.view';

describe('MercadoLibre account wire to render', () => {
  let fixture: ComponentFixture<UserMercadoLibreViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UserMercadoLibreViewComponent] }).compileComponents();
    fixture = TestBed.createComponent(UserMercadoLibreViewComponent);
  });

  function render(raw: unknown): HTMLElement {
    const state: InstallationState = {
      loading: false, errorMessage: '', capabilities: [], inventory: [], listings: [],
      listingDraft: { listingId: '', variationId: '', sku: '', accountId: null },
      mlAccount: mapMercadoLibreAccount(raw),
    };
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('article');
  }

  it('preserves active and disabled account responses and renders type-owned labels', () => {
    for (const status of [Status.Active, Status.Disabled]) {
      const account = mapMercadoLibreAccount({ authorized: status.isActive, accountRef: 'ml-test', status: status.wire });
      expect(account.status).toBe(status);
      expect(account.authorized).toBe(status.isActive);
      expect(account.accountRef).toBe('ml-test');
      const panel = render({ authorized: status.isActive, accountRef: 'ml-test', status: status.wire });
      expect(panel.textContent).toContain(status.label);
      expect(Boolean(panel.querySelector('.sc-badge--ok'))).toBe(status.isActive);
    }
  });

  it('never renders unknown raw wires or an authorized badge for inconsistent wires', () => {
    for (const raw of ['FUTURE_ACCOUNT', null, {}, 'PAUSED']) {
      const account = mapMercadoLibreAccount({ authorized: true, accountRef: 'ml-test', status: raw });
      expect(account.authorized).toBe(false);
      const panel = render({ authorized: true, accountRef: 'ml-test', status: raw });
      expect(panel.querySelector('.sc-badge--ok')).toBeNull();
      expect(panel.textContent).toContain(account.status.label);
      expect(panel.textContent).not.toContain('FUTURE_ACCOUNT');
    }
  });
});
