import { InjectionToken } from '@angular/core';
import { IShippingRepository } from '../../domain/shipping/shipping.repository';

export const SHIPPING_REPOSITORY = new InjectionToken<IShippingRepository>('IShippingRepository');
