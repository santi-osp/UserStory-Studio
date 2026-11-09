import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'disenar-work-item',
  },
  {
    path: 'disenar-work-item',
    loadComponent: () =>
      import('./components/builder/builder.component').then(
        (component) => component.BuilderComponent,
      ),
  },
  {
    path: 'crear-desde-texto',
    loadComponent: () =>
      import('./components/work-item-json-builder/work-item-json-builder.component').then(
        (component) => component.WorkItemJsonBuilderComponent,
      ),
  },
  {
    path: 'previsualizar-work-item',
    loadComponent: () =>
      import('./components/preview/preview.component').then(
        (component) => component.PreviewComponent,
      ),
  },
  {
    path: 'configuracion-azure',
    loadComponent: () =>
      import('./components/settings/settings.component').then(
        (component) => component.SettingsComponent,
      ),
  },
  {
    path: 'evaluar-hu',
    loadComponent: () =>
      import('./components/work-item-evaluation/work-item-evaluation.component').then(
        (component) => component.WorkItemEvaluationComponent,
      ),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./components/not-found/not-found.component').then(
        (component) => component.NotFoundComponent,
      ),
  },
];
