import { Observable, of } from 'rxjs';
import { DiscountType } from '../../domain/offer/discount-type';
import { OfferStatus } from '../../domain/offer/offer-status';
import { StorefrontOffer, StorefrontOfferDraft, StorefrontOfferWrite } from '../../domain/offer/storefront-offer.entity';
import { ManageStorefrontOffersUseCase } from '../../domain/offer/use-cases/manage-storefront-offers.usecase';
import { UserOffersStore } from './user-offers.store';

describe('UserOffersStore', () => {
  it('does not post when hasta is not after desde', () => {
    const save = vi.fn(() => of(savedOffer()));
    const store = createStore(save);
    store.setDraft(draft({ startsAt: '2026-09-26T20:00', endsAt: '2026-09-26T18:00' }));
    store.persistOffer();
    expect(save).not.toHaveBeenCalled();
    expect(store.snapshot.errorMessage).toBe('Hasta tiene que ser posterior a desde.');
  });

  it('does not invent a discount when the operator left it blank', () => {
    const save = vi.fn(() => of(savedOffer()));
    const store = createStore(save);
    store.setDraft(draft({ discountValue: '   ' }));
    store.persistOffer();
    expect(save).not.toHaveBeenCalled();
    expect(store.snapshot.draft.discountValue).toBe('   ');
    expect(store.snapshot.errorMessage).toBe('Nombre, vigencia, descuento, margen y al menos un SKU son obligatorios.');
  });

  it('posts the typed discount and the installation window without a browser price', () => {
    const save = vi.fn((offer: StorefrontOfferWrite) => of({ ...savedOffer(), discountValue: offer.discountValue }));
    const store = createStore(save);
    store.setDraft(draft({ skusText: 'SKU-1, SKU-2' }));
    store.persistOffer();

    expect(save).toHaveBeenCalledTimes(1);
    const sent = save.mock.calls[0][0] as StorefrontOfferWrite;
    expect(sent).toEqual({
      name: 'Happy hour',
      status: OfferStatus.Draft,
      priority: 10,
      startsAt: new Date('2026-09-26T18:00').toISOString(),
      endsAt: new Date('2026-09-26T20:00').toISOString(),
      discountType: DiscountType.Percent,
      discountValue: '12.50',
      minMarginPercent: '0',
      skus: ['SKU-1', 'SKU-2'],
    });
    expect(sent).not.toHaveProperty('price');
    expect(sent).not.toHaveProperty('effectiveUnitPrice');
    expect(store.snapshot.draft.discountValue).toBe('');
    expect(store.snapshot.offers).toEqual([]);
  });
});

function draft(overrides: Partial<StorefrontOfferDraft> = {}): StorefrontOfferDraft {
  return {
    name: 'Happy hour',
    status: OfferStatus.Draft,
    priority: 10,
    startsAt: '2026-09-26T18:00',
    endsAt: '2026-09-26T20:00',
    discountType: DiscountType.Percent,
    discountValue: '12.50',
    minMarginPercent: '0',
    skusText: 'SKU-1',
    ...overrides,
  };
}

function savedOffer(): StorefrontOffer {
  return {
    id: '1',
    name: 'Happy hour',
    status: OfferStatus.Draft,
    priority: 10,
    startsAt: '2026-09-26T21:00:00.000Z',
    endsAt: '2026-09-26T23:00:00.000Z',
    discountType: DiscountType.Percent,
    discountValue: '12.50',
    minMarginPercent: '0',
    skus: ['SKU-1'],
    approvedBy: null,
    approvedAt: null,
  };
}

function createStore(save: (offer: StorefrontOfferWrite) => Observable<StorefrontOffer>): UserOffersStore {
  return new UserOffersStore({
    list: () => of([]),
    save,
  } as unknown as ManageStorefrontOffersUseCase);
}
