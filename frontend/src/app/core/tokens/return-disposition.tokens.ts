import { InjectionToken } from '@angular/core';
import { IReturnDispositionRepository } from '../../domain/order/return-disposition.repository';
export const RETURN_DISPOSITION_REPOSITORY = new InjectionToken<IReturnDispositionRepository>('IReturnDispositionRepository');
