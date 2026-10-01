import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { IOfferRepository } from '../../domain/offer/offer.repository';
import { StorefrontOffer, StorefrontOfferWrite } from '../../domain/offer/storefront-offer.entity';
import { mapStorefrontOffer, mapStorefrontOffers } from './offer-http.mapper';

@Injectable()
export class OfferHttpRepository implements IOfferRepository {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<readonly StorefrontOffer[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/offers`)
      .pipe(map((body) => mapStorefrontOffers(readApiBody<unknown>(body))));
  }

  save(offer: StorefrontOfferWrite): Observable<StorefrontOffer> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/user/offers`, {
        ...offer,
        status: offer.status.wire,
        discountType: offer.discountType.wire,
      })
      .pipe(map((body) => mapStorefrontOffer(readApiBody<unknown>(body))));
  }
}
