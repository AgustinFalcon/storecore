import { TestBed } from '@angular/core/testing';
import { BrandLogo } from '../../domain/branding/merchant-branding';
import { BrandingLogoComponent } from './branding-logo.component';
describe('safe branding logo rendering', () => {
  it('uses a normal image with alt text/no-referrer, hides errors without changing domain data, and retries a changed URL', () => {
    const fixture = TestBed.createComponent(BrandingLogoComponent);
    const logo = BrandLogo.fromWire('https://example.test/logo.png');
    fixture.componentRef.setInput('logo', logo); fixture.componentRef.setInput('name', 'Tienda'); fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img'); expect(img.alt).toBe('Logo de Tienda'); expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    img.dispatchEvent(new Event('error')); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('img')).toBeNull(); expect(logo.url).toBe('https://example.test/logo.png');
    fixture.componentRef.setInput('logo', BrandLogo.fromWire('/assets/other.png')); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('/assets/other.png');
  });
});
