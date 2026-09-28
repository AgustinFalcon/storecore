import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BILLING_REPOSITORY } from '../../../core/tokens/billing.tokens';
import { BillingProfile } from '../billing.entity';
import { IBillingRepository } from '../billing.repository';

@Injectable()
export class GetBillingProfileUseCase {
  constructor(@Inject(BILLING_REPOSITORY) private readonly repo: IBillingRepository) {}

  execute(): Observable<BillingProfile> {
    return this.repo.read();
  }
}
