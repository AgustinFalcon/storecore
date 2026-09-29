import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SHIPPING_REPOSITORY } from '../../../core/tokens/shipping.tokens';
import { ShippingChoice } from '../../order/closed-status';
import { ShippingSelection } from '../shipping.entity';
import { IShippingRepository } from '../shipping.repository';

@Injectable()
export class SaveShippingOptionUseCase {
  constructor(@Inject(SHIPPING_REPOSITORY) private readonly repo: IShippingRepository) {}

  execute(optionId: ShippingChoice): Observable<ShippingSelection> {
    return this.repo.save(optionId);
  }
}
