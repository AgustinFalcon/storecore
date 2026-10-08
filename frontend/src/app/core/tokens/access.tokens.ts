import { InjectionToken } from '@angular/core';
import { AccessRepository } from '../../domain/access/access.repository';
export const ACCESS_REPOSITORY = new InjectionToken<AccessRepository>('ACCESS_REPOSITORY');
