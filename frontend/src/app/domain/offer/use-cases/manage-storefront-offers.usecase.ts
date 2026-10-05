import { Observable } from 'rxjs';
import { IOfferRepository } from '../offer.repository';
import { StorefrontOffer, StorefrontOfferWrite } from '../storefront-offer.entity';

export class ManageStorefrontOffersUseCase {
  constructor(private readonly repo: IOfferRepository) {}

  list(): Observable<readonly StorefrontOffer[]> {
    return this.repo.list();
  }

  save(offer: StorefrontOfferWrite): Observable<StorefrontOffer> {
    return this.repo.save(offer);
  }
}
