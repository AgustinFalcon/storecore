import { RedirectFunction } from '@angular/router';
import { routes } from '../../app.routes';
import { ReturnDestination } from '../../domain/access/return-destination';

describe('legacy UI login redirects', () => {
  for (const parentPath of ['customer', 'user']) {
    const legacy = routes[0].children?.find((route) => route.path === parentPath)?.children?.find((route) => route.path === 'session');
    const redirect = legacy?.redirectTo as RedirectFunction;
    const input = (returnTo: unknown) => ({ queryParams: { returnTo } }) as unknown as Parameters<RedirectFunction>[0];
    it(`redirects ${parentPath} login preserving only a closed destination`, () => {
      expect(redirect(input(ReturnDestination.UserOrders.wire))).toBe(`/login?returnTo=${ReturnDestination.UserOrders.wire}`);
      for (const raw of ['https://external.example', '//external.example', '/user/orders', '', undefined]) expect(redirect(input(raw))).toBe('/login');
    });
  }
});
