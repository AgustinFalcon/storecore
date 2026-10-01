import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DiscountType } from '../../domain/offer/discount-type';
import { OfferStatus } from '../../domain/offer/offer-status';
import { StorefrontOfferWrite } from '../../domain/offer/storefront-offer.entity';
import { OfferHttpRepository } from './offer-http.repository';

const write: StorefrontOfferWrite = {
  name: 'Happy hour',
  status: OfferStatus.Active,
  priority: 10,
  startsAt: '2026-09-26T21:00:00.000Z',
  endsAt: '2026-09-26T23:00:00.000Z',
  discountType: DiscountType.Percent,
  discountValue: '12.50',
  minMarginPercent: '5',
  skus: ['SKU-1'],
};

describe('OfferHttpRepository', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), OfferHttpRepository],
    });
  });

  it('lists offers from the user offers endpoint and keeps a missing discount blank', async () => {
    const repo = TestBed.inject(OfferHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.list());
    const req = ctrl.expectOne('/api/v1/user/offers');
    expect(req.request.method).toBe('GET');
    req.flush({
      code: 200,
      data: [
        {
          id: '9',
          name: 'Vidriera',
          status: 'DRAFT',
          priority: 0,
          startsAt: '2026-09-26T21:00:00.000Z',
          endsAt: '2026-09-26T23:00:00.000Z',
          discountType: 'FIXED',
          discountValue: null,
          minMarginPercent: null,
          skus: ['SKU-1'],
          approvedBy: null,
          approvedAt: null,
        },
      ],
      message: null,
      errorCode: null,
      retryable: null,
      traceId: null,
    });
    await expect(pending).resolves.toEqual([
      {
        id: '9',
        name: 'Vidriera',
        status: OfferStatus.Draft,
        priority: 0,
        startsAt: '2026-09-26T21:00:00.000Z',
        endsAt: '2026-09-26T23:00:00.000Z',
        discountType: DiscountType.Fixed,
        discountValue: '',
        minMarginPercent: '',
        skus: ['SKU-1'],
        approvedBy: null,
        approvedAt: null,
      },
    ]);
    ctrl.verify();
  });

  it('posts the operator discount text and does not add a browser price', async () => {
    const repo = TestBed.inject(OfferHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.save(write));
    const req = ctrl.expectOne('/api/v1/user/offers');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      ...write,
      status: OfferStatus.Active.wire,
      discountType: DiscountType.Percent.wire,
    });
    expect(req.request.body).not.toHaveProperty('price');
    expect(req.request.body).not.toHaveProperty('effectiveUnitPrice');
    req.flush({
      name: write.name,
      status: write.status.wire,
      priority: write.priority,
      startsAt: write.startsAt,
      endsAt: write.endsAt,
      discountType: write.discountType.wire,
      discountValue: 12.5,
      minMarginPercent: 5,
      skus: write.skus,
      id: '4',
      approvedBy: '7',
      approvedAt: '2026-09-26T21:01:00.000Z',
    });
    const saved = await pending;
    expect(saved.id).toBe('4');
    expect(saved.discountValue).toBe('12.5');
    expect(saved.minMarginPercent).toBe('5');
    expect(saved.approvedBy).toBe('7');
    expect(saved).not.toHaveProperty('price');
    ctrl.verify();
  });
});
