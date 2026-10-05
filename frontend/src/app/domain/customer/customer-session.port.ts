/** Session effects available to customer use cases, without signals, cookies or UI. */
export interface CustomerSessionPort {
  markAuthenticated(): void;
  generation(): number;
  clear(): void;
}
