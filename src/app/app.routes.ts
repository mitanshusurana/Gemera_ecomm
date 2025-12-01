import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home';
import { ProductsComponent } from './pages/products';
import { ProductDetailComponent } from './pages/product-detail';
import { CartComponent } from './pages/cart';
import { CheckoutComponent } from './pages/checkout';
import { AccountComponent } from './pages/account';
import { StripePaymentComponent } from './pages/stripe-payment';
import { RazorpayPaymentComponent } from './pages/razorpay-payment';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'products', component: ProductsComponent },
  { path: 'products/:id', component: ProductDetailComponent },
  { path: 'cart', component: CartComponent },
  { path: 'checkout', component: CheckoutComponent, canActivate: [authGuard] },
  { path: 'checkout/payment/stripe', component: StripePaymentComponent, canActivate: [authGuard] },
  { path: 'checkout/payment/razorpay', component: RazorpayPaymentComponent, canActivate: [authGuard] },
  { path: 'account', component: AccountComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
