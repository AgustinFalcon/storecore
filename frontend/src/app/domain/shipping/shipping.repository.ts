import { Observable } from 'rxjs';
import { ShippingChoice } from '../order/closed-status';
import { ShippingSelection, ShippingSimStatus } from './shipping.entity';

export interface IShippingRepository {
  read(): Observable<ShippingSelection>;
  save(optionId: ShippingChoice): Observable<ShippingSelection>;
  saveLocation(latitude: number, longitude: number): Observable<ShippingSelection>;
  advance(status: ShippingSimStatus): Observable<ShippingSelection>;
}
