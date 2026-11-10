import { InjectionToken } from '@angular/core';
import { IInventoryAdjustmentRepository } from '../../domain/user/inventory-adjustment.repository';
export const INVENTORY_ADJUSTMENT_REPOSITORY = new InjectionToken<IInventoryAdjustmentRepository>('IInventoryAdjustmentRepository');
