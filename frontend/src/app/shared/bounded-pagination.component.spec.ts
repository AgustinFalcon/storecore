import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BoundedPaginationComponent } from './bounded-pagination.component';

describe('BoundedPaginationComponent', () => {
  let fixture: ComponentFixture<BoundedPaginationComponent>;
  let component: BoundedPaginationComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BoundedPaginationComponent] }).compileComponents();
    fixture = TestBed.createComponent(BoundedPaginationComponent);
    component = fixture.componentInstance;
  });

  it('announces valid boundaries and emits only valid targets', () => {
    component.metadata = { total: 51, page: 0, size: 50, truncated: true };
    const emitted: number[] = [];
    component.pageChange.subscribe(page => emitted.push(page));
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[1].getAttribute('aria-disabled')).toBe('false');
    buttons[1].click();
    component.go(-1);
    expect(emitted).toEqual([1]);
    expect(fixture.nativeElement.textContent).toContain('Página 1 de 2');
  });

  it('fails closed instead of announcing an impossible page during recovery', () => {
    component.metadata = { total: 50, page: 1, size: 50, truncated: false };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('recuperando una página disponible');
    expect(fixture.nativeElement.textContent).not.toContain('Página 2 de 1');
  });

  it('keeps navigation focusable while loading and ignores repeat activation', () => {
    component.metadata = { total: 51, page: 0, size: 50, truncated: true };
    component.loading = true;
    const emitted: number[] = [];
    component.pageChange.subscribe(page => emitted.push(page));
    fixture.detectChanges();
    const next = fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement;
    next.focus();
    next.click();
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(emitted).toEqual([]);
  });
});
