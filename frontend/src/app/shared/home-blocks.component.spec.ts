import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomeBlockKind as Kind, HomeSection } from '../domain/content/home-composition';
import { HomeBlocksComponent } from './home-blocks.component';
describe('typed storefront blocks', () => {
  it('renders only active known blocks and reports missing references without invented names or links', () => {
    TestBed.configureTestingModule({imports: [HomeBlocksComponent], providers: [provideRouter([])]});
    const fixture = TestBed.createComponent(HomeBlocksComponent);
    const base: HomeSection = {key: 'hero', kind: Kind.Hero, active: true, sortOrder: 0, content: {title: 'Portada', body: 'Texto'}, updatedAt: null};
    fixture.componentRef.setInput('sections', [base, {...base, key: 'hidden', active: false, content: {title: 'Oculto', body: ''}}, {...base, key: 'unknown', kind: Kind.Unknown}, {...base, key: 'categories', kind: Kind.CategoryRail, content: {title: 'Categorías', categoryIds: [1, 2]}}, {...base, key: 'products', kind: Kind.ProductRail, content: {title: 'Productos', skus: ['SKU-MISSING']}}]);
    fixture.componentRef.setInput('categories', [{id: '1', name: 'Categoría real'}]); fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Categoría real'); expect(element.textContent).toContain('Categoría no disponible: 2');
    expect(element.textContent).toContain('Producto no disponible: SKU-MISSING'); expect(element.textContent).not.toContain('Oculto');
    expect(element.querySelectorAll('section')).toHaveLength(3); expect(element.querySelectorAll('a')).toHaveLength(1);
  });

  it('preserves query parameters and fragments in internal CTA destinations', () => {
    TestBed.configureTestingModule({imports: [HomeBlocksComponent], providers: [provideRouter([])]});
    const fixture = TestBed.createComponent(HomeBlocksComponent);
    fixture.componentRef.setInput('sections', [{
      key: 'hero', kind: Kind.Hero, active: true, sortOrder: 0,
      content: {title: 'Portada', body: '', ctaLabel: 'Ver ofertas', ctaPath: '/catalog?category=12#offers'}, updatedAt: null,
    } satisfies HomeSection]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('a')?.getAttribute('href')).toBe('/catalog?category=12#offers');
  });
});
