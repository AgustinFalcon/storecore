/** Session effects available to user use cases, without signals, cookies or UI. */
export interface UserSessionPort {
  markAuthenticated(principal?: UserSessionResult): void;
  clear(): void;
}
import { UserSessionResult } from './user.entity';
