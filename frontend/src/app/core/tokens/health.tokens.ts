import { InjectionToken } from '@angular/core';
import { IHealthRepository } from '../../domain/health/health.repository';

export const HEALTH_REPOSITORY = new InjectionToken<IHealthRepository>('IHealthRepository');
