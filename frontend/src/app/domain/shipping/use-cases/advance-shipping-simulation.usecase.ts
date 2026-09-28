import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SHIPPING_REPOSITORY } from '../../../core/tokens/shipping.tokens';
import { ShippingSelection, ShippingSimStatus } from '../shipping.entity';
import { IShippingRepository } from '../shipping.repository';

@Injectable()
export class AdvanceShippingSimulationUseCase {
  constructor(@Inject(SHIPPING_REPOSITORY) private readonly repo: IShippingRepository) {}

  execute(status: ShippingSimStatus): Observable<ShippingSelection> {
    return this.repo.advance(status);
  }
}
