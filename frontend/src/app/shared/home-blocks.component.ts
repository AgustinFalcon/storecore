import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Router, RouterLink, UrlTree } from '@angular/router';
import { HomeSection } from '../domain/content/home-composition';
import { CatalogFacet } from '../domain/catalog/catalog-facet.entity';
import { ProductSummary } from '../domain/catalog/product-summary.entity';
import { ProductTileComponent } from './product-tile.component';
@Component({
  selector: 'sc-home-blocks',
  imports: [RouterLink, ProductTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (section of sections; track section.key) {
      @if (section.active && section.kind.known) {
        <section class="sc-home__section" [attr.aria-label]="section.content.title || section.kind.label">
          @if (section.kind.bodyLimit !== null) {
            <article class="sc-carousel sc-carousel__slide">
              <h2>{{ section.content.title }}</h2>
              <p class="block-body">{{ section.content.body }}</p>
              @if (section.content.ctaLabel && section.content.ctaPath) {
                <a class="sc-btn sc-btn--primary" [routerLink]="cta(section.content.ctaPath)">{{ section.content.ctaLabel }}</a>
              }
            </article>
          } @else {
            <h2>{{ section.content.title }}</h2>
            @if (section.kind.referencesCategories) {
              <ul class="sc-home__tiles">
                @for (id of section.content.categoryIds; track id) {
                  <li>
                    @if (category(id); as item) {
                      <a routerLink="/catalog" [queryParams]="{ category: item.id }">{{ item.name }}</a>
                    } @else { <span>Categoría no disponible: {{ id }}</span> }
                  </li>
                }
              </ul>
            }
            @if (section.kind.referencesProducts) {
              <div class="sc-rail">
                @for (sku of section.content.skus; track sku) {
                  @if (product(sku); as item) { <sc-product-tile [product]="item" /> }
                  @else { <p>Producto no disponible: {{ sku }}</p> }
                }
              </div>
            }
          }
        </section>
      }
    }
  `,
  styles: [':host {display:grid;gap:1.5rem;min-width:0} .sc-carousel__slide {min-height:16rem;padding:1.5rem} .sc-carousel h2,.sc-carousel p {color:inherit;margin:0} .sc-carousel a {justify-self:start} .block-body {white-space:pre-wrap;overflow-wrap:anywhere} h2 {overflow-wrap:anywhere}'],
})
export class HomeBlocksComponent {
  constructor(private readonly router: Router) {}
  @Input() sections: readonly HomeSection[] = [];
  @Input() categories: readonly CatalogFacet[] = [];
  @Input() products: readonly ProductSummary[] = [];
  category(id: number): CatalogFacet | undefined { return this.categories.find(item => item.id === String(id)); }
  product(sku: string): ProductSummary | undefined { return this.products.find(item => item.sku === sku); }
  cta(path: string): UrlTree { return this.router.parseUrl(path); }
}
