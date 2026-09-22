export interface CatalogQuery {
  readonly query: string;
  readonly brand: string;
  readonly category: string;
  readonly offersOnly: boolean;
}

export const emptyCatalogQuery: CatalogQuery = {
  query: '',
  brand: '',
  category: '',
  offersOnly: false,
};
