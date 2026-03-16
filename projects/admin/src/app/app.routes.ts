import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { ProductListComponent } from './pages/product-list/product-list.component';
import { ProductAddComponent } from './pages/product-add/product-add.component';
import { OrderListComponent } from './pages/order-list/order-list.component';
import { OrderDetailComponent } from './pages/order-detail/order-detail.component';
import { CustomerListComponent } from './pages/customers/customer-list.component';
import { RfqDetailComponent } from './pages/rfq-detail/rfq-detail.component';
import { TreasurePlanListComponent } from './pages/treasure-plans/treasure-plan-list.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { AuditLogComponent } from './pages/audit-logs/audit-log.component';
import { SystemMaintenanceComponent } from './pages/system-maintenance/system-maintenance.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'customers', component: CustomerListComponent },
      { path: 'products', component: ProductListComponent },
      { path: 'products/new', component: ProductAddComponent },
      { path: 'products/edit/:id', component: ProductAddComponent },
      { path: 'orders', component: OrderListComponent },
      { path: 'orders/:id', component: OrderDetailComponent },
      { path: 'rfqs/:id', component: RfqDetailComponent },
      { path: 'treasure', component: TreasurePlanListComponent },
      { path: 'settings', component: SettingsComponent },
      { path: 'logs', component: AuditLogComponent },
      { path: 'system-maintenance', component: SystemMaintenanceComponent },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'login' }
];