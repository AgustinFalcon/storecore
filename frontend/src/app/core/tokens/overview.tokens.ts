import { InjectionToken } from '@angular/core';
import { IOverviewRepository } from '../../domain/overview/overview.repository';
export const OVERVIEW_REPOSITORY = new InjectionToken<IOverviewRepository>('OVERVIEW_REPOSITORY');
