import { Route } from '@angular/router';
import { routes } from './app.routes';
import { userGuard } from './core/auth/user.guard';
import { userContentLeaveGuard } from './features/admin/user-content-leave.guard';

const expectedUserLeaves = new Map<string, string>([
  ['home', 'Operaciones'],
  ['content', 'Contenido'],
  ['catalog', 'Catálogo admin'],
  ['offers', 'Ofertas'],
  ['customers', 'Clientes'],
  ['promos', 'Promos'],
  ['orders', 'Fulfillment'],
  ['orders/:id', 'Fulfillment'],
  ['inventory', 'Inventario'],
  ['mercadolibre', 'Mercado Libre'],
  ['capabilities', 'Capabilities'],
  ['profile-import', 'Perfil'],
]);

function userChildren(): Route[] {
  const user = routes[0].children?.find((route) => route.path === 'user');
  if (!user?.children) throw new Error('USER route tree is missing');
  return user.children;
}

describe('USER administration lazy route boundary', () => {
  it('keeps every productive leaf guarded and lazy-loadable', async () => {
    const children = userChildren();

    for (const [path, title] of expectedUserLeaves) {
      const route = children.find((candidate) => candidate.path === path);
      expect(route, `missing route ${path}`).toBeDefined();
      expect(route?.component, `${path} must not be eager`).toBeUndefined();
      expect(route?.loadComponent, `${path} must expose a loader`).toEqual(expect.any(Function));
      expect(route?.title).toBe(title);
      expect(route?.canActivate).toEqual([userGuard]);
      expect(await route?.loadComponent?.(), `${path} loader must resolve`).toBeTruthy();
    }
  });

  it('keeps content navigation protected by the lightweight leave guard', () => {
    const content = userChildren().find((route) => route.path === 'content');
    expect(content?.canDeactivate).toEqual([userContentLeaveGuard]);
  });
});
