import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { CatalogQuery } from '../../domain/catalog/catalog-query.entity';
import { ICatalogRepository } from '../../domain/catalog/catalog.repository';
import { HomeContent } from '../../domain/catalog/home-content.entity';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { ProductSummary } from '../../domain/catalog/product-summary.entity';
import { mapFacets, mapHome, mapProductDetail, mapProductSummaries } from '../mappers/http-mappers';

@Injectable()
export class CatalogHttpRepository implements ICatalogRepository {
  constructor(private readonly http: HttpClient) {}

  search(query: CatalogQuery): Observable<readonly ProductSummary[]> {
    let params = new HttpParams();
    if (query.query) {
      params = params.set('query', query.query);
    }
    if (query.brand) {
      params = params.set('brand', query.brand);
    }
    if (query.category) {
      params = params.set('category', query.category);
    }
    if (query.offersOnly) {
      params = params.set('offers', 'true');
    }
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/catalog`, { params })
      .pipe(map((body) => mapProductSummaries(readApiBody<unknown>(body))));
  }

  readProduct(sku: string): Observable<ProductDetail> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/catalog/products/${sku}`)
      .pipe(map((body) => mapProductDetail(readApiBody<unknown>(body))));
  }

  listBrands(): Observable<readonly CatalogFacet[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/catalog/brands`)
      .pipe(map((body) => mapFacets(readApiBody<unknown>(body))));
  }

  listCategories(): Observable<readonly CatalogFacet[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/catalog/categories`)
      .pipe(map((body) => mapFacets(readApiBody<unknown>(body))));
  }

  readHome(): Observable<HomeContent> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/content/home`)
      .pipe(map((body) => mapHome(readApiBody<unknown>(body))));
  }
}
