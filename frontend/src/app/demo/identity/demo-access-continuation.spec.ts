import { DemoContext, DemoProductVariant as Variant, demoSeed } from '../demo-model';
import { DemoScreen } from '../demo-screen';
import { UserRole } from '../../domain/user/user-role';
import { AccessSelectionPurpose as Purpose, DemoAccessContinuation, PurchaseCaptureStatus as Status } from './demo-access-continuation';
import { DemoReturnDestination as Destination } from './demo-return-destination';

describe('Buyer access continuation', () => {
  const flow = new DemoAccessContinuation();
  const product = demoSeed().products.find(value => value.sku === 'DEMO-001')!;
  it('translates every closed capture status and fails unknown wire closed', () => {
    for (const status of Status.all) expect(Status.fromWire(status.wire)).toBe(status);
    for (const raw of [null, {}, 'invented', '']) expect(Status.fromWire(raw)).toBe(Status.Unknown);
  });
  it('captures the live SKU selection over stale query values and serializes filters once', () => {
    const filters = new URLSearchParams('variant=standard&quantity=1&q=drill%26returnUrl%3Dhttps%3A%2F%2Fevil.invalid&category=Herramientas&brand=Norte&stock=available&max=500000&sort=price-down&page=2');
    const captured = flow.capture.execute(product, Variant.Case, 2, 5, filters);
    expect(captured.status).toBe(Status.Ready); expect(captured.target.kind).toBe(Destination.Product);
    const url = new URL(captured.target.url, 'https://demo.invalid');
    expect(url.pathname).toBe('/demo/catalog/DEMO-001');
    expect(url.searchParams.getAll('variant')).toEqual([Variant.Case.wire]);
    expect(url.searchParams.getAll('quantity')).toEqual(['2']);
    expect(url.searchParams.get('q')).toBe(filters.get('q'));
    for (const key of ['category', 'brand', 'stock', 'max', 'sort', 'page']) expect(url.searchParams.get(key)).toBe(filters.get(key));
    expect(url.searchParams.has('returnUrl')).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 6])('rejects invalid live quantity %s without a return target', quantity => {
    const result = flow.capture.execute(product, Variant.Standard, quantity, 5, new URLSearchParams());
    expect(result.status).toBe(Status.Quantity); expect(result.target.kind).toBe(Destination.Unknown);
  });
  it('rejects unavailable products, unsupported variants and unsafe SKU paths', () => {
    const query = new URLSearchParams();
    expect(flow.capture.execute(undefined, Variant.Standard, 1, 5, query).status).toBe(Status.Unavailable);
    expect(flow.capture.execute({ ...product, active: false }, Variant.Standard, 1, 5, query).status).toBe(Status.Unavailable);
    expect(flow.capture.execute(product, Variant.Standard, 1, 0, query).status).toBe(Status.Unavailable);
    expect(flow.capture.execute(product, Variant.Unknown, 1, 5, query).status).toBe(Status.Variant);
    expect(flow.capture.execute({ ...product, supportsCase: false }, Variant.Case, 1, 5, query).status).toBe(Status.Variant);
    expect(flow.capture.execute({ ...product, sku: '../cart' }, Variant.Standard, 1, 5, query).status).toBe(Status.Unknown);
  });
  it('keeps stockless favorites possible without representing a purchasable quantity', () => {
    for (const purpose of Purpose.all) expect(Purpose.fromWire(purpose.wire)).toBe(purpose);
    expect(Purpose.fromWire('invented')).toBe(Purpose.Unknown);
    const captured = flow.capture.execute(product, Variant.Case, 1, 0, new URLSearchParams(), Purpose.Favorite);
    expect(captured.status).toBe(Status.Ready);
    expect(new URL(captured.target.url, 'https://demo.invalid').searchParams.has('quantity')).toBe(false);
    expect(flow.capture.execute(product, Variant.Case, 1, 5, new URLSearchParams(), Purpose.Unknown).status).toBe(Status.Unknown);
  });
  it.each([{ available: 0, quantity: 2 }, { available: 1, quantity: 2 }, { available: 5, quantity: NaN }, { available: 5, quantity: -1 }, { available: 5, quantity: 1.5 }])('favorite normalizes non-purchasable quantity without blocking access: %s', ({ available, quantity }) => {
    const captured = flow.capture.execute(product, Variant.Case, quantity, available, new URLSearchParams(), Purpose.Favorite);
    expect(captured.status).toBe(Status.Ready);
    const params = new URL(captured.target.url, 'https://demo.invalid').searchParams;
    expect(params.get('variant')).toBe(Variant.Case.wire); expect(params.has('quantity')).toBe(false);
  });
  it('keeps absence and invalid registration fallback distinct from explicit Home', () => {
    for (const raw of [null, '/demo/user/home', 'https://external.invalid', '/demo/catalog/%2E%2E/cart']) {
      expect(flow.query(raw)).toBeNull();
      expect(flow.resolve.execute(raw, DemoScreen.Register, DemoContext.Customer, UserRole.Unknown)).toBe('/demo/customer/profile');
      expect(flow.resolve.execute(raw, DemoScreen.Login, DemoContext.Customer, UserRole.Unknown)).toBe('/demo');
    }
    expect(flow.query('/demo')).toEqual({ returnUrl: '/demo' });
    expect(flow.resolve.execute('/demo', DemoScreen.Register, DemoContext.Customer, UserRole.Unknown)).toBe('/demo');
  });
  it('fences role and entry before authentication and keeps administrative landings fixed', () => {
    expect(flow.resolve.execute('/demo/cart', DemoScreen.Login, DemoContext.Admin, UserRole.Admin)).toBe('/demo/user/home');
    expect(flow.resolve.execute('/demo/cart', DemoScreen.Login, DemoContext.Admin, UserRole.Operator)).toBe('/demo/user/customers');
    expect(flow.resolve.execute('/demo/cart', DemoScreen.Login, DemoContext.Admin, UserRole.Unknown)).toBeNull();
    expect(flow.resolve.execute('/demo/cart', DemoScreen.Login, DemoContext.Unknown, UserRole.Unknown)).toBeNull();
    expect(flow.resolve.execute('/demo/cart', DemoScreen.Product, DemoContext.Customer, UserRole.Unknown)).toBeNull();
    let calls = 0;
    expect(flow.complete.execute(null, () => { calls++; return true; })).toBeNull(); expect(calls).toBe(0);
    expect(flow.complete.execute('/demo/cart', () => false)).toBeNull();
    expect(flow.complete.execute('/demo/cart', () => true)).toBe('/demo/cart');
  });
});
