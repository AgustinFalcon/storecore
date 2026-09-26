import { Observable } from 'rxjs';
import { StorefrontOffer, StorefrontOfferWrite } from './storefront-offer.entity';

export interface IOfferRepository {
  list(): Observable<readonly StorefrontOffer[]>;
  save(offer: StorefrontOfferWrite): Observable<StorefrontOffer>;
}
