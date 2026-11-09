import { Observable } from 'rxjs';
import { ConfirmDispositionCommand, ReturnDisposition } from './return-disposition';

export interface IReturnDispositionRepository {
  read(orderId: string): Observable<ReturnDisposition>;
  confirm(orderId: string, command: ConfirmDispositionCommand): Observable<ReturnDisposition>;
}

export class ManageReturnDispositionUseCase {
  constructor(private readonly repository: IReturnDispositionRepository) {}
  read(orderId: string): Observable<ReturnDisposition> { return this.repository.read(orderId); }
  confirm(orderId: string, command: ConfirmDispositionCommand): Observable<ReturnDisposition> { return this.repository.confirm(orderId, command); }
}
