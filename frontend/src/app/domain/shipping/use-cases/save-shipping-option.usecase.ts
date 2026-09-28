import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SHIPPING_REPOSITORY } from '../../../core/tokens/shipping.tokens';
import { ShippingOptionId, ShippingSelection } from '../shipping.entity';
import { IShippingRepository } from '../shipping.repository';

@Injectable()
export class SaveShippingOptionUseCase {
  constructor(@Inject(SHIPPING_REPOSITORY) private readonly repo: IShippingRepository) {}

  execute(optionId: ShippingOptionId): Observable<ShippingSelection> {
    return this.repo.save(optionId);
  }
}
