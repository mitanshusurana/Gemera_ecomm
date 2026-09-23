import { Routes } from '@angular/router';

/**
 * Child routes of `/stock`, loaded with `loadChildren` from app.routes.ts so
 * the whole stock area (and the @zxing scanner in the counting screen) stays
 * out of the initial bundle.
 */
export const STOCK_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./stock-overview.component').then(m => m.StockOverviewComponent) },
  { path: 'transfers', loadComponent: () => import('./stock-transfer-list.component').then(m => m.StockTransferListComponent) },
  { path: 'transfers/new', loadComponent: () => import('./stock-transfer-form.component').then(m => m.StockTransferFormComponent) },
  { path: 'transfers/:id', loadComponent: () => import('./stock-transfer-detail.component').then(m => m.StockTransferDetailComponent) },
  { path: 'takes', loadComponent: () => import('./stock-take-list.component').then(m => m.StockTakeListComponent) },
  { path: 'takes/:id', loadComponent: () => import('./stock-take-count.component').then(m => m.StockTakeCountComponent) },
];
