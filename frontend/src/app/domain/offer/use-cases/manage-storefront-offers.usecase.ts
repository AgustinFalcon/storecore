import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { OFFER_REPOSITORY } from '../../../core/tokens/offer.tokens';
import { IOfferRepository } from '../offer.repository';
import { StorefrontOffer, StorefrontOfferWrite } from '../storefront-offer.entity';

@Injectable()
export class ManageStorefrontOffersUseCase {
  constructor(@Inject(OFFER_REPOSITORY) private readonly repo: IOfferRepository) {}

  list(): Observable<readonly StorefrontOffer[]> {
    return this.repo.list();
  }

  save(offer: StorefrontOfferWrite): Observable<StorefrontOffer> {
    return this.repo.save(offer);
  }
}
