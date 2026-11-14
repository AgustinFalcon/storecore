import { Subject } from 'rxjs';
import { ReadStoreBrandingUseCase } from '../../domain/branding/branding.repository';
import { MerchantBranding } from '../../domain/branding/merchant-branding';
import { ThemeAppearance } from '../../core/theme/theme-appearance';
import { StoreBrandingStore } from './store-branding.store';
const branding = (revision: number) => MerchantBranding.fromWire({ revision, businessName: 'Tienda ' + revision, logoUrl: null, primaryColor: '#767676', onPrimaryColor: '#ffffff' })!;
describe('root branding monotonicity', () => {
  function setup() {
    const pending: Subject<MerchantBranding | null>[] = [];
    const read = { execute: () => { const request = new Subject<MerchantBranding | null>(); pending.push(request); return request; } };
    const theme = { apply: vi.fn() };
    return { store: new StoreBrandingStore(read as unknown as ReadStoreBrandingUseCase, theme as unknown as ThemeAppearance), pending, theme };
  }
  it('fences old GET success and failure after publish and applies the new pair immediately', () => {
    const { store, pending, theme } = setup(); store.load(); store.load();
    store.published(branding(4)); pending[0].next(branding(3)); pending[1].error(new Error('late'));
    expect(store.branding().revision).toBe(4);
    expect(theme.apply).toHaveBeenCalledExactlyOnceWith({ theme: '#767676', themeInk: '#ffffff' });
  });
  it('converges on the highest revision for both out-of-order GET sequences', () => {
    for (const sequence of [[3, 2], [2, 3]]) {
      const { store, pending } = setup(); store.load(); store.load();
      pending[1].next(branding(sequence[0])); pending[0].next(branding(sequence[1]));
      expect(store.branding().revision).toBe(3);
    }
  });
  it('keeps safe defaults on malformed/error and retains a valid snapshot on subsequent failure', () => {
    const { store, pending } = setup(); store.load(); pending[0].next(null);
    expect(store.branding()).toBe(MerchantBranding.Default);
    store.load(); pending[1].next(branding(2)); store.load(); pending[2].error(new Error('offline'));
    expect(store.branding().revision).toBe(2);
  });
});
