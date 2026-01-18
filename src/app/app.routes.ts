import { Routes } from "@angular/router";
import { authGuard } from "./guards/auth.guard";
import { adminGuard } from "./guards/admin.guard";

export const routes: Routes = [
  {
    path: "",
    loadComponent: () => import("./pages/home").then(m => m.HomeComponent)
  },
  {
    path: "login",
    loadComponent: () => import("./pages/login").then(m => m.LoginComponent)
  },
  {
    path: "products",
    loadComponent: () => import("./pages/products").then(m => m.ProductsComponent)
  },
  {
    path: "products/:id",
    loadComponent: () => import("./pages/product-detail").then(m => m.ProductDetailComponent)
  },
  {
    path: "builder",
    loadComponent: () => import("./pages/builder").then(m => m.BuilderComponent)
  },
  {
    path: "compare",
    loadComponent: () => import("./pages/compare").then(m => m.CompareComponent)
  },
  {
    path: "cart",
    loadComponent: () => import("./pages/cart").then(m => m.CartComponent)
  },
  {
    path: "checkout",
    loadComponent: () => import("./pages/checkout").then(m => m.CheckoutComponent)
  },
  {
    path: "track-order",
    loadComponent: () => import("./pages/track-order").then(m => m.TrackOrderComponent),
  },
  {
    path: "verify-certificate",
    loadComponent: () => import("./pages/verify-certificate").then(m => m.VerifyCertificateComponent),
  },
  {
    path: "account",
    loadComponent: () => import("./pages/account").then(m => m.AccountComponent),
    canActivate: [authGuard]
  },
  {
    path: "order-confirmation",
    loadComponent: () => import("./pages/order-confirmation").then(m => m.OrderConfirmationComponent),
  },
  {
    path: "rfq",
    loadComponent: () => import("./pages/rfq-request").then(m => m.RFQRequestComponent)
  },
  {
    path: "treasure",
    loadComponent: () => import("./pages/treasure-chest").then(m => m.TreasureChestComponent)
  },
  {
    path: "stores",
    loadComponent: () => import("./pages/store-locator").then(m => m.StoreLocatorComponent)
  },
  {
    path: "about",
    loadComponent: () => import("./pages/about").then(m => m.AboutComponent)
  },
  {
    path: "contact",
    loadComponent: () => import("./pages/contact").then(m => m.ContactComponent)
  },
  {
    path: "privacy",
    loadComponent: () => import("./pages/privacy").then(m => m.PrivacyPolicyComponent)
  },
  {
    path: "terms",
    loadComponent: () => import("./pages/terms").then(m => m.TermsComponent)
  },
  {
    path: "journal",
    loadComponent: () => import("./pages/journal").then(m => m.JournalComponent)
  },
  {
    path: "admin",
    loadComponent: () => import("./pages/admin/admin-layout").then(m => m.AdminLayoutComponent),
    canActivate: [adminGuard],
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      {
        path: "dashboard",
        loadComponent: () => import("./pages/admin/dashboard").then(m => m.AdminDashboardComponent)
      },
      {
        path: "products",
        loadComponent: () => import("./pages/admin/products").then(m => m.AdminProductListComponent)
      },
    ]
  },
  { path: "**", redirectTo: "" },
];
