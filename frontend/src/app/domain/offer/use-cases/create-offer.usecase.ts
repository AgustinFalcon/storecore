import { CreateOfferCommand } from '../offer';
import { IOfferRepository } from '../offer.repository';
export class CreateOfferUseCase { constructor(private readonly repository: IOfferRepository) {} execute(command: CreateOfferCommand) { return this.repository.create(command); } }
