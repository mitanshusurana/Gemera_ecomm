import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { permissionGuard } from './guards/permission.guard';

/**
 * Every page is lazy-loaded with `loadComponent` so that heavy, page-local
 * dependencies (@zxing/library in the product list, angularx-qrcode in the labels view) are
 * split into their own chunks instead of landing in the initial bundle. The
 * shell (login + layout + guard) is all the initial download has to carry.
 *
 * `authGuard` admits any staff role; each page then names the permission key
 * it needs (mirroring the API's `@access.has(...)` on the endpoints it calls).
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
      { path: 'dashboard', canActivate: [permissionGuard('dashboard.read')], loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'analytics', canActivate: [permissionGuard('dashboard.read')], loadComponent: () => import('./pages/analytics/analytics.component').then(m => m.AnalyticsComponent) },
      { path: 'appointments', canActivate: [permissionGuard('appointments.write')], loadComponent: () => import('./pages/appointments/appointment-list.component').then(m => m.AppointmentListComponent) },
      { path: 'repairs', canActivate: [permissionGuard('repairs.write')], loadComponent: () => import('./pages/repairs/repair-list.component').then(m => m.RepairListComponent) },
      { path: 'inquiries', canActivate: [permissionGuard('inquiries.write')], loadComponent: () => import('./pages/inquiries/inquiry-list.component').then(m => m.InquiryListComponent) },
      { path: 'customers', canActivate: [permissionGuard('customers.read')], loadComponent: () => import('./pages/customers/customer-list.component').then(m => m.CustomerListComponent) },
      { path: 'categories', canActivate: [permissionGuard('categories.write')], loadComponent: () => import('./pages/categories/categories.component').then(m => m.CategoriesComponent) },
      { path: 'products', canActivate: [permissionGuard('products.read')], loadComponent: () => import('./pages/product-list/product-list.component').then(m => m.ProductListComponent) },
      { path: 'products/labels', canActivate: [permissionGuard('labels.print')], loadComponent: () => import('./pages/product-labels/product-labels.component').then(m => m.ProductLabelsComponent) },
      { path: 'products/new', canActivate: [permissionGuard('products.write')], loadComponent: () => import('./pages/product-add/product-add.component').then(m => m.ProductAddComponent) },
      { path: 'products/edit/:id', canActivate: [permissionGuard('products.write')], loadComponent: () => import('./pages/product-add/product-add.component').then(m => m.ProductAddComponent) },
      { path: 'rates', canActivate: [permissionGuard('rates.write')], loadComponent: () => import('./pages/rates/metal-rates.component').then(m => m.MetalRatesComponent) },
      { path: 'stock', canActivate: [permissionGuard('stock.read')], loadChildren: () => import('./pages/stock/stock.routes').then(m => m.STOCK_ROUTES) },
      { path: 'orders', canActivate: [permissionGuard('orders.read')], loadComponent: () => import('./pages/order-list/order-list.component').then(m => m.OrderListComponent) },
      { path: 'orders/:id', canActivate: [permissionGuard('orders.read')], loadComponent: () => import('./pages/order-detail/order-detail.component').then(m => m.OrderDetailComponent) },
      { path: 'returns', canActivate: [permissionGuard('orders.write')], loadComponent: () => import('./pages/returns/return-list.component').then(m => m.ReturnListComponent) },
      { path: 'rfqs', canActivate: [permissionGuard('rfq.write')], loadComponent: () => import('./pages/rfq-list/rfq-list.component').then(m => m.RfqListComponent) },
      { path: 'rfqs/:id', canActivate: [permissionGuard('rfq.write')], loadComponent: () => import('./pages/rfq-detail/rfq-detail.component').then(m => m.RfqDetailComponent) },
      { path: 'treasure', canActivate: [permissionGuard('treasure.write')], loadComponent: () => import('./pages/treasure-plans/treasure-plan-list.component').then(m => m.TreasurePlanListComponent) },
      { path: 'stores', canActivate: [permissionGuard('stores.write')], loadComponent: () => import('./pages/stores/store-list.component').then(m => m.StoreListComponent) },
      { path: 'gift-cards', canActivate: [permissionGuard('giftcards.write')], loadComponent: () => import('./pages/gift-cards/gift-card-list.component').then(m => m.GiftCardListComponent) },
      { path: 'exchange', canActivate: [permissionGuard('exchange.write')], loadComponent: () => import('./pages/exchange/exchange-list.component').then(m => m.ExchangeListComponent) },
      { path: 'coupons', canActivate: [permissionGuard('coupons.write')], loadComponent: () => import('./pages/coupons/coupon-list.component').then(m => m.CouponListComponent) },
      { path: 'settings', canActivate: [permissionGuard('settings.read')], loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent) },
      { path: 'logs', canActivate: [permissionGuard('logs.read')], loadComponent: () => import('./pages/audit-logs/audit-log.component').then(m => m.AuditLogComponent) },
      { path: 'notifications', canActivate: [permissionGuard('logs.read')], loadComponent: () => import('./pages/notifications/notification-list.component').then(m => m.NotificationListComponent) },
      { path: 'system-maintenance', canActivate: [permissionGuard('maintenance.write')], loadComponent: () => import('./pages/system-maintenance/system-maintenance.component').then(m => m.SystemMaintenanceComponent) },
      { path: 'staff', canActivate: [permissionGuard('staff.manage')], loadComponent: () => import('./pages/staff/staff-list.component').then(m => m.StaffListComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
