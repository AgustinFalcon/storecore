import { OfferTransition } from '../offer';
import { IOfferRepository } from '../offer.repository';
export class TransitionOfferUseCase { constructor(private readonly repository: IOfferRepository) {} execute(id: number, transition: OfferTransition) { return this.repository.transition(id, transition); } }
