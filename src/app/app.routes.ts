import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home';
import { ProductsComponent } from './pages/products';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'products', component: ProductsComponent },
  { path: '**', redirectTo: '' },
];
