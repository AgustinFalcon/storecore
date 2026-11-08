import { InjectionToken } from '@angular/core';
import { IFavoriteRepository } from '../../domain/favorite/favorite.repository';

export const FAVORITE_REPOSITORY = new InjectionToken<IFavoriteRepository>('FAVORITE_REPOSITORY');
