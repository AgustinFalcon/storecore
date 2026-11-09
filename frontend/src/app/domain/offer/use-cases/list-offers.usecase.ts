import { IOfferRepository } from '../offer.repository';
export class ListOffersUseCase { constructor(private readonly repository: IOfferRepository) {} execute() { return this.repository.list(); } }
