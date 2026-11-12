import { InjectionToken } from '@angular/core';
import { IRecoveryRepository } from '../../domain/access/recovery';
export const RECOVERY_REPOSITORY = new InjectionToken<IRecoveryRepository>('RECOVERY_REPOSITORY');
