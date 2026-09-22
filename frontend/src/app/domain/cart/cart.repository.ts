import { Observable } from 'rxjs';
import { Cart, CheckoutCommand, CheckoutReceipt } from './cart.entity';

export interface ICartRepository {
  read(): Observable<Cart>;
  addLine(sku: string, quantity: number): Observable<Cart>;
  checkout(command: CheckoutCommand): Observable<CheckoutReceipt>;
}
