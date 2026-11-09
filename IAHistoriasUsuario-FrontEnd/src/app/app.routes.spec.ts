import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NotFoundComponent } from './components/not-found/not-found.component';
import { routes } from './app.routes';

@Component({ standalone: true, template: '' })
class RouteStubComponent {}

describe('Application routes', () => {
  beforeEach(() => {
    localStorage.clear();
    const routerTestRoutes: Routes = routes.map((route) => {
      if (route.path === '**')
        return { path: '**', component: NotFoundComponent };
      return route.loadComponent
        ? { path: route.path, component: RouteStubComponent }
        : route;
    });
    TestBed.configureTestingModule({
      providers: [provideRouter(routerTestRoutes)],
    });
  });

  afterEach(() => localStorage.clear());

  it('defines exactly the five canonical modules as lazy standalone routes', () => {
    const mainRoutes = routes.filter(
      (route) => route.path !== '**' && route.loadComponent,
    );
    expect(mainRoutes.map((route) => route.path)).toEqual([
      'disenar-work-item',
      'crear-desde-texto',
      'previsualizar-work-item',
      'configuracion-azure',
      'evaluar-hu',
    ]);
    expect(
      mainRoutes.every((route) => route.children === undefined),
    ).toBeTrue();
  });

  it('redirects the root explicitly to the canonical designer', async () => {
    await RouterTestingHarness.create('/');
    expect(TestBed.inject(Router).url).toBe('/disenar-work-item');
  });

  it('navigates to every canonical module route', async () => {
    const harness = await RouterTestingHarness.create('/disenar-work-item');
    const router = TestBed.inject(Router);
    for (const route of [
      '/disenar-work-item',
      '/crear-desde-texto',
      '/previsualizar-work-item',
      '/configuracion-azure',
      '/evaluar-hu',
    ]) {
      await harness.navigateByUrl(route);
      expect(router.url).withContext(route).toBe(route);
    }
  });

  it('does not define redirects for retired route names', () => {
    expect(
      routes.some((route) =>
        ['armar-prompt', 'crear-json', 'preview-json'].includes(
          route.path ?? '',
        ),
      ),
    ).toBeFalse();
  });

  it('renders the real Not Found state for unknown and retired URLs', async () => {
    const harness = await RouterTestingHarness.create('/armar-prompt');
    for (const route of ['/armar-prompt', '/crear-json', '/preview-json']) {
      await harness.navigateByUrl(route);
      expect(harness.routeNativeElement?.textContent)
        .withContext(route)
        .toContain('Página no encontrada');
      expect(TestBed.inject(Router).url).withContext(route).toBe(route);
    }
    await harness.navigateByUrl('/ruta-inexistente');
    expect(harness.routeNativeElement?.textContent).toContain(
      'Página no encontrada',
    );
  });

  it('offers an accessible action back to the canonical designer', async () => {
    const harness = await RouterTestingHarness.create('/ruta-inexistente');
    const link = harness.routeDebugElement?.query(By.css('a'));
    expect(link?.nativeElement.textContent.trim()).toBe(
      'Ir a Diseñar Work Item',
    );
    expect(link?.nativeElement.getAttribute('href')).toBe('/disenar-work-item');
  });
});
