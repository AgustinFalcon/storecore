import { Observable } from 'rxjs';
import { BillingProfile } from './billing.entity';

export interface IBillingRepository {
  read(): Observable<BillingProfile>;
  save(profile: Pick<BillingProfile, 'legalName' | 'taxId' | 'taxCondition'>): Observable<BillingProfile>;
}
