import { Observable } from 'rxjs';
import { ShippingOptionId, ShippingSelection, ShippingSimStatus } from './shipping.entity';

export interface IShippingRepository {
  read(): Observable<ShippingSelection>;
  save(optionId: ShippingOptionId): Observable<ShippingSelection>;
  saveLocation(latitude: number, longitude: number): Observable<ShippingSelection>;
  advance(status: ShippingSimStatus): Observable<ShippingSelection>;
}
