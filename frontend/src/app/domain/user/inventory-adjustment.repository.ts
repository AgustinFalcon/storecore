import { Observable } from 'rxjs';
import { AdjustAvailableStockCommand, InventoryAdjustmentReceipt, InventoryAdjustmentResult } from './inventory-adjustment';
export interface IInventoryAdjustmentRepository {
  submit(command: AdjustAvailableStockCommand): Observable<InventoryAdjustmentReceipt>;
  lookup(command: AdjustAvailableStockCommand): Observable<InventoryAdjustmentResult>;
  refreshCsrf(): Observable<void>;
}
export class AdjustAvailableStockUseCase {
  constructor(private readonly repository: IInventoryAdjustmentRepository) {}
  submit(command: AdjustAvailableStockCommand): Observable<InventoryAdjustmentReceipt> { return this.repository.submit(command); }
  lookup(command: AdjustAvailableStockCommand): Observable<InventoryAdjustmentResult> { return this.repository.lookup(command); }
  refreshCsrf(): Observable<void> { return this.repository.refreshCsrf(); }
}
