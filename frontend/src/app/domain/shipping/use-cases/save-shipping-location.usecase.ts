import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SHIPPING_REPOSITORY } from '../../../core/tokens/shipping.tokens';
import { ShippingSelection } from '../shipping.entity';
import { IShippingRepository } from '../shipping.repository';

@Injectable()
export class SaveShippingLocationUseCase {
  constructor(@Inject(SHIPPING_REPOSITORY) private readonly repo: IShippingRepository) {}

  execute(latitude: number, longitude: number): Observable<ShippingSelection> {
    return this.repo.saveLocation(latitude, longitude);
  }
}
