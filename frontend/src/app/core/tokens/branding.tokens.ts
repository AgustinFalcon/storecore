import { InjectionToken } from '@angular/core';
import { IBrandingRepository } from '../../domain/branding/branding.repository';
export const BRANDING_REPOSITORY = new InjectionToken<IBrandingRepository>('BRANDING_REPOSITORY');
