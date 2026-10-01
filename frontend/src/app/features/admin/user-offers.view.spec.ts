import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DiscountType } from '../../domain/offer/discount-type';
import { OfferStatus } from '../../domain/offer/offer-status';
import { UserOffersState } from './user-offers.store';
import { UserOffersViewComponent } from './user-offers.view';

describe('UserOffersView', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UserOffersViewComponent],
      providers: [provideRouter([])],
    });
  });

  it('says this screen writes the offers table and points channel MANUAL to /user/promos', () => {
    const fixture = TestBed.createComponent(UserOffersViewComponent);
    fixture.componentRef.setInput('state', state());
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('tabla offers');
    expect(text).toContain('happy hour');
    expect(text).toContain('/user/promos');
    expect(text).toContain('writer MANUAL');
    expect(text).toContain('No hay ofertas de vitrina.');
    expect(text).not.toContain('effectiveUnitPrice');
  });

  it('shows the discount the API sent and does not print a calculated shelf price', () => {
    const fixture = TestBed.createComponent(UserOffersViewComponent);
    fixture.componentRef.setInput(
      'state',
      state({
        offers: [
          {
            id: '4',
            name: 'Happy hour',
            status: OfferStatus.Active,
            priority: 10,
            startsAt: '2026-09-26T21:00:00.000Z',
            endsAt: '2026-09-26T23:00:00.000Z',
            discountType: DiscountType.Percent,
            discountValue: '12.50',
            minMarginPercent: '5',
            skus: ['SKU-1'],
            approvedBy: '7',
            approvedAt: '2026-09-26T21:01:00.000Z',
          },
        ],
      }),
    );
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('12.50 %');
    expect(text).toContain('SKU-1');
    expect(text).not.toContain('80');
    expect(text).not.toMatch(/\$\s*\d/);
  });
});

function state(overrides: Partial<UserOffersState> = {}): UserOffersState {
  return {
    loading: false,
    errorMessage: '',
    offers: [],
    draft: {
      name: '',
      status: OfferStatus.Draft,
      priority: 0,
      startsAt: '',
      endsAt: '',
      discountType: DiscountType.Percent,
      discountValue: '',
      minMarginPercent: '',
      skusText: '',
    },
    ...overrides,
  };
}
