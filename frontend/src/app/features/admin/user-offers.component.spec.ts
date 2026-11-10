import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DiscountKind, Offer, OfferStatus } from '../../domain/offer/offer';
import { ListOffersUseCase } from '../../domain/offer/use-cases/list-offers.usecase';
import { CreateOfferUseCase } from '../../domain/offer/use-cases/create-offer.usecase';
import { TransitionOfferUseCase } from '../../domain/offer/use-cases/transition-offer.usecase';
import { UserOffersComponent } from './user-offers.component';

const offer: Offer = { id: 1, name: 'Oferta herramientas', status: OfferStatus.Active, priority: 0,
  startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', discountKind: DiscountKind.Percent,
  discountValue: 10, minMarginPercent: 0, skus: ['SKU-1'], createdAt: '2026-11-01T00:00:00Z', approvedAt: null };

function render(offers: readonly Offer[]) {
  TestBed.configureTestingModule({ imports: [UserOffersComponent], providers: [
    { provide: ListOffersUseCase, useValue: { execute: vi.fn(() => of(offers)) } },
    { provide: CreateOfferUseCase, useValue: { execute: vi.fn() } },
    { provide: TransitionOfferUseCase, useValue: { execute: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(UserOffersComponent);
  fixture.detectChanges();
  return fixture;
}

describe('UserOffersComponent filter states', () => {
  it('announces no matches and clears text and status together to restore the stored offer', () => {
    const fixture = render([offer]);
    fixture.componentInstance.query.set('no existe');
    fixture.componentInstance.statusFilter.set(OfferStatus.Paused);
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('.sc-empty[role="status"]') as HTMLElement;
    expect(empty.textContent).toContain('Sin coincidencias');
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(0);
    empty.querySelector('button')!.click(); fixture.detectChanges();
    expect(fixture.componentInstance.query()).toBe('');
    expect(fixture.componentInstance.statusFilter()).toBeNull();
    expect(fixture.nativeElement.querySelector('.sc-empty')).toBeNull();
    expect(fixture.nativeElement.querySelector('article').textContent).toContain(offer.name);
  });

  it('keeps the installation-empty state distinct from a no-match filter', () => {
    const fixture = render([]);
    fixture.componentInstance.query.set('SKU'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay ofertas');
    expect(fixture.nativeElement.textContent).not.toContain('Sin coincidencias');
    expect(fixture.nativeElement.querySelector('.sc-empty button')).toBeNull();
  });
});
