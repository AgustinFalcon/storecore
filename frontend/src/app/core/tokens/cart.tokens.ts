import { InjectionToken } from '@angular/core';
import { ICartRepository } from '../../domain/cart/cart.repository';

export const CART_REPOSITORY = new InjectionToken<ICartRepository>('ICartRepository');
