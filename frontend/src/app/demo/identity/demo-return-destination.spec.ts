import { DemoReturnDestination as Destination } from './demo-return-destination';

describe('SC03 return destination boundary', () => {
  it.each(['/demo/catalog/%2E%2E/cart', '/demo/catalog/%2e%2e/cart', '/demo/catalog/%2e./cart', '/demo/catalog/.%2e/cart', '/demo/catalog/%252e%252e/cart'])('rejects encoded normalization before parsing %s', raw => {
    expect(Destination.fromWire(raw)).toEqual({ kind: Destination.Unknown, url: '/demo' });
  });
  it.each(['/demo', '/demo/catalog', '/demo/catalog/DEMO-001?variant=with-case&quantity=2', '/demo/cart', '/demo/checkout', '/demo/customer/profile', '/demo/customer/addresses', '/demo/customer/favorites', '/demo/customer/orders', '/demo/customer/orders/ORD-1015'])('keeps the allowed customer target %s', raw => {
    const target = Destination.fromWire(raw); expect(target.kind).not.toBe(Destination.Unknown); expect(target.url).toBe(raw);
  });
  it.each([null, {}, '', 'https://external.invalid/demo', '//external.invalid/demo', '/demo/user/home', '/demo/recover', '/demo/login', '/demo/%75ser/home', '/demo/%63atalog', '/demo/../demo/cart', '/demo/catalog/x%2fy', '/demo/catalog;x=1', '/demo\\cart', '/demolition', '/demo/customer/orders/x/y', '/demo/cart\n'])('rejects unsupported wire %s', raw => {
    expect(Destination.fromWire(raw)).toEqual({ kind: Destination.Unknown, url: '/demo' });
  });
});
