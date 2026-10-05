/** Session effects available to user use cases, without signals, cookies or UI. */
export interface UserSessionPort {
  markAuthenticated(): void;
  generation(): number;
  clear(): void;
}
