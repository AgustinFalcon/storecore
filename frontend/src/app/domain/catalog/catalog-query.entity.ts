import { BoundedPageRequest } from './bounded-page';

export interface CatalogQuery {
  readonly pagination: BoundedPageRequest;
  readonly query: string;
  readonly brand: string;
  readonly category: string;
  readonly offersOnly: boolean;
}

export const emptyCatalogQuery: CatalogQuery = {
  pagination: BoundedPageRequest.first(),
  query: '',
  brand: '',
  category: '',
  offersOnly: false,
};
