import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { CatalogQuery } from '../../domain/catalog/catalog-query.entity';
import { CatalogPageComponent } from './catalog-page.component';
import { CatalogState, CatalogStore } from './catalog.store';

class FakeCatalogStore {
  snapshot: Pick<CatalogState, 'query'> = {
    query: { query: '', brand: '', category: '', offersOnly: false },
  };
  readonly state$ = new BehaviorSubject<CatalogState>({
    loading: false,
    errorMessage: '',
    query: this.snapshot.query,
    products: [],
    brands: [],
    categories: [],
    home: null,
    offers: [],
    product: null,
  });
  readonly loadFacets = vi.fn();
  readonly search = vi.fn();

  setQuery(query: CatalogQuery): void {
    this.snapshot = { query };
    this.state$.next({ ...this.state$.value, query });
  }
}

describe('CatalogPageComponent query string', () => {
  let params$: BehaviorSubject<ParamMap>;
  let navigate: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<CatalogPageComponent>;
  let store: FakeCatalogStore;

  beforeEach(async () => {
    params$ = new BehaviorSubject<ParamMap>(convertToParamMap({ offers: '1', category: 'luz' }));
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.overrideComponent(CatalogPageComponent, {
      set: { providers: [{ provide: CatalogStore, useClass: FakeCatalogStore }] },
    });
    await TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: params$.asObservable(),
            get snapshot() {
              return { queryParamMap: params$.value };
            },
          },
        },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CatalogPageComponent);
    store = fixture.debugElement.injector.get(CatalogStore) as unknown as FakeCatalogStore;
    fixture.detectChanges();
  });

  it('applies a home link on entry and again when the route is reused', () => {
    expect(store.loadFacets).toHaveBeenCalledOnce();
    expect(store.snapshot.query).toEqual({ query: '', brand: '', category: 'luz', offersOnly: true });
    expect(store.search).toHaveBeenCalledOnce();

    params$.next(convertToParamMap({ q: 'foco' }));
    expect(store.snapshot.query).toEqual({ query: 'foco', brand: '', category: '', offersOnly: false });
    expect(store.search).toHaveBeenCalledTimes(2);
  });

  it('writes the toolbar into the query string and retries when it is already there', () => {
    store.setQuery({ query: 'foco', brand: '3', category: '', offersOnly: false });
    fixture.componentInstance.search();
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { q: 'foco', brand: '3', category: null, offers: null },
    });
    expect(store.search).toHaveBeenCalledOnce();

    params$.next(convertToParamMap({ q: 'foco', brand: '3' }));
    navigate.mockClear();
    fixture.componentInstance.search();
    expect(navigate).not.toHaveBeenCalled();
    expect(store.search).toHaveBeenCalledTimes(3);
  });
});
