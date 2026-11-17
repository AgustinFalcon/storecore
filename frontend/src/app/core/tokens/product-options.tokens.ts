import { InjectionToken } from '@angular/core';
import { IProductOptionsRepository } from '../../domain/catalog/product-options.repository';

export const PRODUCT_OPTIONS_REPOSITORY = new InjectionToken<IProductOptionsRepository>('IProductOptionsRepository');
