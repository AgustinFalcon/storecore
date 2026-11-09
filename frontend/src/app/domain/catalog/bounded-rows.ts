/** Retains the list API while carrying the server's bounded-read metadata. */
export interface ListMetadata { readonly total: number; readonly page: number; readonly size: number; readonly truncated: boolean; }
export type BoundedRows<T> = readonly T[] & { readonly metadata: ListMetadata };
export function listMetadata<T>(rows: BoundedRows<T>): ListMetadata {
  return rows.metadata;
}
