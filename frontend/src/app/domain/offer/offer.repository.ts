import { Observable } from 'rxjs';
import { CreateOfferCommand, Offer, OfferTransition } from './offer';

export interface IOfferRepository {
  list(): Observable<readonly Offer[]>;
  create(command: CreateOfferCommand): Observable<Offer>;
  transition(id: number, transition: OfferTransition): Observable<Offer>;
}
