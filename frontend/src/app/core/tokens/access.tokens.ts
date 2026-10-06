import { InjectionToken } from '@angular/core';
import { IAccessRepository } from '../../domain/access/access.repository';

export const ACCESS_REPOSITORY = new InjectionToken<IAccessRepository>('IAccessRepository');
