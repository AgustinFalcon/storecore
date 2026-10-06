/** Session effects available to customer use cases, without signals, cookies or UI. */
export interface CustomerSessionPort {
  markAuthenticated(principal?: CustomerProfile | CustomerSessionResult): void;
  clear(): void;
}
import { CustomerProfile, CustomerSessionResult } from './customer.entity';
