import { Routes } from "@angular/router";
import { HomeComponent } from "./pages/home";
import { ProductsComponent } from "./pages/products";
import { ProductDetailComponent } from "./pages/product-detail";
import { CartComponent } from "./pages/cart";
import { CheckoutComponent } from "./pages/checkout";
import { AccountComponent } from "./pages/account";
import { LoginComponent } from "./pages/login";
import { StripePaymentComponent } from "./pages/stripe-payment";
import { RazorpayPaymentComponent } from "./pages/razorpay-payment";
import { OrderConfirmationComponent } from "./pages/order-confirmation";
import { RFQRequestComponent } from "./pages/rfq-request";
import { AboutComponent } from "./pages/about";
import { ContactComponent } from "./pages/contact";
import { PrivacyPolicyComponent } from "./pages/privacy";
import { TermsComponent } from "./pages/terms";
import { CompareComponent } from "./pages/compare";
import { JournalComponent } from "./pages/journal";
import { authGuard } from "./guards/auth.guard";
import { AdminLayoutComponent } from "./pages/admin/admin-layout";
import { AdminDashboardComponent } from "./pages/admin/dashboard";
import { AdminProductListComponent } from "./pages/admin/products";
import { adminGuard } from "./guards/admin.guard";

export const routes: Routes = [
  { path: "", component: HomeComponent },
  { path: "login", component: LoginComponent },
  { path: "products", component: ProductsComponent },
  { path: "products/:id", component: ProductDetailComponent },
  { path: "compare", component: CompareComponent },
  { path: "cart", component: CartComponent },
  { path: "checkout", component: CheckoutComponent },
  {
    path: "checkout/payment/stripe",
    component: StripePaymentComponent,
  },
  {
    path: "checkout/payment/razorpay",
    component: RazorpayPaymentComponent,
  },
  { path: "account", component: AccountComponent, canActivate: [authGuard] },
  {
    path: "order-confirmation",
    component: OrderConfirmationComponent,
  },
  { path: "rfq", component: RFQRequestComponent },
  { path: "about", component: AboutComponent },
  { path: "contact", component: ContactComponent },
  { path: "privacy", component: PrivacyPolicyComponent },
  { path: "terms", component: TermsComponent },
  { path: "journal", component: JournalComponent },
  {
    path: "admin",
    component: AdminLayoutComponent,
    canActivate: [adminGuard],
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      { path: "dashboard", component: AdminDashboardComponent },
      { path: "products", component: AdminProductListComponent },
    ]
  },
  { path: "**", redirectTo: "" },
];
