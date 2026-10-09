import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { DemoPageComponent, DemoRootComponent } from './app/demo/demo.component';
import { DemoScreen } from './app/demo/demo-screen';

// Dedicated compilation entry: no HttpClient, real auth, cookie or API provider is reachable.
bootstrapApplication(DemoRootComponent, {
  providers: [provideRouter([{ path: 'demo', children: [
    ...DemoScreen.all.map(screen => ({ path: screen.path, component: DemoPageComponent, title: `${screen.title} · StoreCore Demo`, data: { screen: screen.path } })),
    { path: 'customer/session', redirectTo: 'login', pathMatch: 'full' },
    { path: 'user/session', redirectTo: 'login', pathMatch: 'full' },
    { path: 'customer', redirectTo: 'login', pathMatch: 'full' },
    { path: 'user', redirectTo: 'user/home', pathMatch: 'full' },
    { path: '**', redirectTo: '' },
  ] }, { path: '**', redirectTo: 'demo' }])],
}).catch((error: unknown) => console.error(error));
