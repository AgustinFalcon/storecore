import { InjectionToken } from '@angular/core';
import { ICatalogRepository } from '../../domain/catalog/catalog.repository';

export const CATALOG_REPOSITORY = new InjectionToken<ICatalogRepository>('ICatalogRepository');
