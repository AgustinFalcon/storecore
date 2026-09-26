import { InjectionToken } from '@angular/core';
import { IOfferRepository } from '../../domain/offer/offer.repository';

export const OFFER_REPOSITORY = new InjectionToken<IOfferRepository>('IOfferRepository');
