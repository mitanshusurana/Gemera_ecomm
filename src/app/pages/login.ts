import { Component, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink, Router, ActivatedRoute } from "@angular/router";
import { AuthService } from "../services/auth.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-diamond-50 to-gold-50">
      <!-- Breadcrumb -->
      <div class="bg-white border-b border-diamond-200">
        <div class="container-luxury py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-gold-600 hover:text-gold-700">Home</a>
            <span class="text-gray-500">/</span>
            <span class="text-gray-700">{{
              isLogin() ? "Login" : "Register"
            }}</span>
          </div>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <div class="max-w-md mx-auto">
          <!-- Login Form -->
          <div *ngIf="isLogin()" class="card p-8">
            <h1 class="text-4xl font-display font-bold text-diamond-900 mb-2">
              Welcome Back
            </h1>
            <p class="text-gray-600 mb-8">
              Sign in to your account to continue shopping
            </p>

            <form (ngSubmit)="login()" #loginForm="ngForm" class="space-y-6">
              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  required
                  class="input-field"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  [(ngModel)]="password"
                  name="password"
                  required
                  class="input-field"
                  placeholder="••••••••"
                />
              </div>

              <div class="flex items-center justify-between text-sm">
                <label class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    class="w-4 h-4 rounded border-diamond-300"
                  />
                  <span class="text-gray-700">Remember me</span>
                </label>
                <a
                  href="#"
                  class="text-gold-600 hover:text-gold-700 font-semibold"
                >
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                [disabled]="isLoading() || !loginForm.valid"
                class="w-full btn-primary"
              >
                {{ isLoading() ? "Signing in..." : "Sign In" }}
              </button>

              <div class="text-center text-sm text-gray-600">
                Don't have an account?
                <button
                  type="button"
                  (click)="toggleMode()"
                  class="text-gold-600 hover:text-gold-700 font-semibold"
                >
                  Create one
                </button>
              </div>
            </form>
          </div>

          <!-- Register Form -->
          <div *ngIf="!isLogin()" class="card p-8">
            <h1 class="text-4xl font-display font-bold text-diamond-900 mb-2">
              Create Account
            </h1>
            <p class="text-gray-600 mb-8">
              Join us to start shopping our fine collection
            </p>

            <form
              (ngSubmit)="register()"
              #registerForm="ngForm"
              class="space-y-6"
            >
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    [(ngModel)]="firstName"
                    name="firstName"
                    required
                    class="input-field"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    [(ngModel)]="lastName"
                    name="lastName"
                    required
                    class="input-field"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  required
                  class="input-field"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  [(ngModel)]="phone"
                  name="phone"
                  required
                  class="input-field"
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  [(ngModel)]="password"
                  name="password"
                  required
                  class="input-field"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  [(ngModel)]="confirmPassword"
                  name="confirmPassword"
                  required
                  class="input-field"
                  placeholder="••••••••"
                />
              </div>

              <label class="flex items-start gap-2">
                <input
                  type="checkbox"
                  required
                  class="w-4 h-4 mt-1 rounded border-diamond-300"
                />
                <span class="text-sm text-gray-700">
                  I agree to the
                  <a
                    href="#"
                    class="text-gold-600 hover:text-gold-700 font-semibold"
                  >
                    Terms of Service
                  </a>
                  and
                  <a
                    href="#"
                    class="text-gold-600 hover:text-gold-700 font-semibold"
                  >
                    Privacy Policy
                  </a>
                </span>
              </label>

              <button
                type="submit"
                [disabled]="
                  isLoading() ||
                  !registerForm.valid ||
                  password !== confirmPassword
                "
                class="w-full btn-primary"
              >
                {{ isLoading() ? "Creating account..." : "Create Account" }}
              </button>

              <div class="text-center text-sm text-gray-600">
                Already have an account?
                <button
                  type="button"
                  (click)="toggleMode()"
                  class="text-gold-600 hover:text-gold-700 font-semibold"
                >
                  Sign in
                </button>
              </div>
            </form>
          </div>

          <!-- Error Message -->
          <div
            *ngIf="errorMessage()"
            class="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm"
          >
            {{ errorMessage() }}
          </div>

          <!-- Info Box -->
          <div
            class="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6 text-sm text-blue-900"
          >
            <p class="font-semibold mb-2">Demo Mode</p>
            <p>
              For testing purposes, use any email and password combination.
              Authentication is mocked for development.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  isLogin = signal(true);
  isLoading = signal(false);
  errorMessage = signal("");

  email = "";
  password = "";
  firstName = "";
  lastName = "";
  phone = "";
  confirmPassword = "";

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  toggleMode(): void {
    this.isLogin.update((val) => !val);
    this.errorMessage.set("");
  }

  login(): void {
    this.isLoading.set(true);
    this.errorMessage.set("");

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        this.isLoading.set(false);
        const returnUrl = this.route.snapshot.queryParams["returnUrl"] || "/";
        this.router.navigateByUrl(returnUrl);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.errorMessage.set("Invalid email or password. Please try again.");
        console.error("Login error:", error);
      },
    });
  }

  register(): void {
    if (this.password !== this.confirmPassword) {
      this.errorMessage.set("Passwords do not match");
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set("");

    this.authService
      .register({
        email: this.email,
        password: this.password,
        firstName: this.firstName,
        lastName: this.lastName,
        phone: this.phone,
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.errorMessage.set("");
          this.isLogin.set(true);
          alert(
            "Account created successfully! You can now log in with your credentials.",
          );
        },
        error: (error) => {
          this.isLoading.set(false);
          this.errorMessage.set("Failed to create account. Please try again.");
          console.error("Register error:", error);
        },
      });
  }
}
