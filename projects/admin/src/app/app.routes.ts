import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

/**
 * Every page is lazy-loaded with `loadComponent` so that heavy, page-local
 * dependencies (@zxing/library in the product list, angularx-qrcode in the labels view) are
 * split into their own chunks instead of landing in the initial bundle. The
 * shell (login + layout + guard) is all the initial download has to carry.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/admin-layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'appointments', loadComponent: () => import('./pages/appointments/appointment-list.component').then(m => m.AppointmentListComponent) },
      { path: 'inquiries', loadComponent: () => import('./pages/inquiries/inquiry-list.component').then(m => m.InquiryListComponent) },
      { path: 'customers', loadComponent: () => import('./pages/customers/customer-list.component').then(m => m.CustomerListComponent) },
      { path: 'categories', loadComponent: () => import('./pages/categories/categories.component').then(m => m.CategoriesComponent) },
      { path: 'products', loadComponent: () => import('./pages/product-list/product-list.component').then(m => m.ProductListComponent) },
      { path: 'products/labels', loadComponent: () => import('./pages/product-labels/product-labels.component').then(m => m.ProductLabelsComponent) },
      { path: 'products/new', loadComponent: () => import('./pages/product-add/product-add.component').then(m => m.ProductAddComponent) },
      { path: 'products/edit/:id', loadComponent: () => import('./pages/product-add/product-add.component').then(m => m.ProductAddComponent) },
      { path: 'orders', loadComponent: () => import('./pages/order-list/order-list.component').then(m => m.OrderListComponent) },
      { path: 'orders/:id', loadComponent: () => import('./pages/order-detail/order-detail.component').then(m => m.OrderDetailComponent) },
      { path: 'rfqs', loadComponent: () => import('./pages/rfq-list/rfq-list.component').then(m => m.RfqListComponent) },
      { path: 'rfqs/:id', loadComponent: () => import('./pages/rfq-detail/rfq-detail.component').then(m => m.RfqDetailComponent) },
      { path: 'treasure', loadComponent: () => import('./pages/treasure-plans/treasure-plan-list.component').then(m => m.TreasurePlanListComponent) },
      { path: 'stores', loadComponent: () => import('./pages/stores/store-list.component').then(m => m.StoreListComponent) },
      { path: 'gift-cards', loadComponent: () => import('./pages/gift-cards/gift-card-list.component').then(m => m.GiftCardListComponent) },
      { path: 'coupons', loadComponent: () => import('./pages/coupons/coupon-list.component').then(m => m.CouponListComponent) },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent) },
      { path: 'logs', loadComponent: () => import('./pages/audit-logs/audit-log.component').then(m => m.AuditLogComponent) },
      { path: 'system-maintenance', loadComponent: () => import('./pages/system-maintenance/system-maintenance.component').then(m => m.SystemMaintenanceComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
