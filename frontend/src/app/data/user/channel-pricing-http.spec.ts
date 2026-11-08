import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { PolicyStatus, PolicyTransition } from '../../domain/user/channel-pricing';
import { mapPricePolicy } from './channel-pricing.mapper';
import { accountWire, listingWire, promoWire } from './channel-pricing.spec-fixtures';
import { UserHttpRepository } from './user-http.repository';

describe('pricing and channel HTTP contract', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), UserHttpRepository] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('whitelists creation fields and never sends approval, priority, observed or base prices', async () => {
    const repository = TestBed.inject(UserHttpRepository); const http = TestBed.inject(HttpTestingController);
    const untrusted = { ...mapPricePolicy(promoWire), approvedBy: 'forged', priority: 99 };
    const pending = firstValueFrom(repository.savePromo(untrusted));
    const request = http.expectOne('/api/v1/user/promos');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ listingSku: 'SKU-1', currency: 'ARS', priceScope: 'DEFAULT', desiredPrice: 90, effectivePromoPrice: null, validFrom: promoWire.validFrom, validTo: promoWire.validTo, writer: 'MANUAL' });
    request.flush(promoWire); expect((await pending).status).toBe(PolicyStatus.Draft);
  });
  it('sends a transition object and reads server approval', async () => {
    const repository = TestBed.inject(UserHttpRepository); const http = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repository.transitionPromo('1', PolicyTransition.Activate));
    const request = http.expectOne('/api/v1/user/promos/1/state'); expect(request.request.body).toEqual({ transition: PolicyTransition.Activate.wire });
    request.flush({ ...promoWire, status: PolicyStatus.Active.wire, approvedBy: 'server-admin', approvedAt: promoWire.validFrom });
    expect((await pending).approvedBy).toBe('server-admin');
  });
  it('pages GET reads with bounded size and preserves local versus observed values', async () => {
    const repository = TestBed.inject(UserHttpRepository); const http = TestBed.inject(HttpTestingController);
    const promos = firstValueFrom(repository.listPromos(1)); const request = http.expectOne('/api/v1/user/promos?page=1&size=25');
    request.flush({ items: [promoWire], page: 1, size: 25, total: 26, truncated: true }); expect((await promos).metadata.page).toBe(1);
    const listings = firstValueFrom(repository.listMercadoLibreListings()); const listingRequest = http.expectOne('/api/v1/user/mercadolibre/listings?page=0&size=25');
    expect(listingRequest.request.method).toBe('GET'); listingRequest.flush({ items: [listingWire], page: 0, size: 25, total: 1, truncated: false });
    const listing = (await listings)[0]; expect(listing.desiredQuantity).toBe(4); expect(listing.observedQuantity.value).toBe(0);
    const account = firstValueFrom(repository.readMercadoLibreAccount()); http.expectOne('/api/v1/user/mercadolibre/account').flush(accountWire);
    expect(await account).not.toHaveProperty('authorized');
  });
});
