import { InjectionToken } from '@angular/core';
import { IOrderRepository } from '../../domain/order/order.repository';

export const ORDER_REPOSITORY = new InjectionToken<IOrderRepository>('IOrderRepository');
