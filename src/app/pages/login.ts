import { Component, signal, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink, Router, ActivatedRoute } from "@angular/router";
import { AuthService } from "../services/auth.service";
import { ToastService } from "../services/toast.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f]">
      <!-- Breadcrumb -->
      <div class="border-b border-[#e0e0e0]">
        <div class="max-w-[1080px] mx-auto px-6 md:px-12 py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-[#D4AF37] hover:underline">Home</a>
            <span class="text-[#6e6e73]">/</span>
            <span class="text-[#1d1d1f]">{{
              isLogin() ? "Login" : "Register"
            }}</span>
          </div>
        </div>
      </div>

      <div class="max-w-[1080px] mx-auto px-6 md:px-12 py-16 md:py-24">
        <div class="max-w-md mx-auto">
          <!-- Login Form -->
          <div *ngIf="isLogin()" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8 md:p-10 animate-fadeIn">
            <h1 class="font-display font-semibold text-3xl md:text-4xl tracking-tight text-[#1d1d1f] mb-2">
              Welcome Back
            </h1>
            <p class="text-[#6e6e73] mb-8">
              Sign in to your account to continue shopping
            </p>

            <form (ngSubmit)="login()" #loginForm="ngForm" class="space-y-6">
              <div>
                <label class="block text-sm font-medium text-[#1d1d1f] mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  required
                  email
                  #loginEmail="ngModel"
                  class="input-field"
                  [ngClass]="{'border-red-500': loginEmail.invalid && (loginEmail.dirty || loginEmail.touched)}"
                  placeholder="you@example.com"
                />
                <div *ngIf="loginEmail.invalid && (loginEmail.dirty || loginEmail.touched)" class="text-red-600 text-xs mt-1">
                  <span *ngIf="loginEmail.errors?.['required']">Email is required.</span>
                  <span *ngIf="loginEmail.errors?.['email']">Please enter a valid email address.</span>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-[#1d1d1f] mb-2">
                  Password
                </label>
                <input
                  type="password"
                  [(ngModel)]="password"
                  name="password"
                  required
                  #loginPassword="ngModel"
                  class="input-field"
                  [ngClass]="{'border-red-500': loginPassword.invalid && (loginPassword.dirty || loginPassword.touched)}"
                  placeholder="••••••••"
                />
                <div *ngIf="loginPassword.invalid && (loginPassword.dirty || loginPassword.touched)" class="text-red-600 text-xs mt-1">
                  <span *ngIf="loginPassword.errors?.['required']">Password is required.</span>
                </div>
              </div>

              <div class="flex items-center justify-between text-sm">
                <label class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    [(ngModel)]="rememberMe"
                    name="rememberMe"
                    class="w-4 h-4 rounded border-[#e0e0e0] accent-[#D4AF37]"
                  />
                  <span class="text-[#1d1d1f]">Remember me</span>
                </label>
                <a
                  routerLink="/forgot-password"
                  class="text-[#D4AF37] hover:underline font-medium"
                >
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                [disabled]="isLoading() || !loginForm.valid"
                class="btn-apple-pill w-full"
              >
                {{ isLoading() ? "Signing in..." : "Sign In" }}
              </button>

              <div class="text-center text-sm text-[#6e6e73]">
                Don't have an account?
                <button
                  type="button"
                  (click)="toggleMode()"
                  class="text-[#D4AF37] hover:underline font-medium"
                >
                  Create one
                </button>
              </div>
            </form>
          </div>

          <!-- Register Form -->
          <div *ngIf="!isLogin()" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8 md:p-10 animate-fadeIn">
            <h1 class="font-display font-semibold text-3xl md:text-4xl tracking-tight text-[#1d1d1f] mb-2">
              Create Account
            </h1>
            <p class="text-[#6e6e73] mb-8">
              Join us to start shopping our fine collection
            </p>

            <form
              #registerForm="ngForm"
              (ngSubmit)="register()"
              class="space-y-6"
            >
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-[#1d1d1f] mb-2">First Name</label>
                  <input type="text" [(ngModel)]="firstName" name="firstName" required #regFirstName="ngModel" class="input-field" [ngClass]="{'border-red-500': regFirstName.invalid && (regFirstName.dirty || regFirstName.touched)}" placeholder="John" />
                  <div *ngIf="regFirstName.invalid && (regFirstName.dirty || regFirstName.touched)" class="text-red-600 text-xs mt-1">First name is required.</div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Last Name</label>
                  <input type="text" [(ngModel)]="lastName" name="lastName" required #regLastName="ngModel" class="input-field" [ngClass]="{'border-red-500': regLastName.invalid && (regLastName.dirty || regLastName.touched)}" placeholder="Doe" />
                  <div *ngIf="regLastName.invalid && (regLastName.dirty || regLastName.touched)" class="text-red-600 text-xs mt-1">Last name is required.</div>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Email Address</label>
                <input type="email" [(ngModel)]="email" name="email" required email #regEmail="ngModel" class="input-field" [ngClass]="{'border-red-500': regEmail.invalid && (regEmail.dirty || regEmail.touched)}" placeholder="you@example.com" />
                <div *ngIf="regEmail.invalid && (regEmail.dirty || regEmail.touched)" class="text-red-600 text-xs mt-1">
                  <span *ngIf="regEmail.errors?.['required']">Email is required.</span>
                  <span *ngIf="regEmail.errors?.['email']">Please enter a valid email address.</span>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Phone Number</label>
                <input type="tel" [(ngModel)]="phone" name="phone" required #regPhone="ngModel" class="input-field" [ngClass]="{'border-red-500': regPhone.invalid && (regPhone.dirty || regPhone.touched)}" placeholder="+1 (555) 000-0000" />
                <div *ngIf="regPhone.invalid && (regPhone.dirty || regPhone.touched)" class="text-red-600 text-xs mt-1">Phone number is required.</div>
              </div>

              <div>
                <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Password</label>
                <input type="password" [(ngModel)]="password" name="password" required minlength="8" #regPassword="ngModel" class="input-field" [ngClass]="{'border-red-500': regPassword.invalid && (regPassword.dirty || regPassword.touched)}" placeholder="••••••••" />
                <div *ngIf="regPassword.invalid && (regPassword.dirty || regPassword.touched)" class="text-red-600 text-xs mt-1">
                  <span *ngIf="regPassword.errors?.['required']">Password is required.</span>
                  <span *ngIf="regPassword.errors?.['minlength']">Password must be at least 8 characters.</span>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Confirm Password</label>
                <input type="password" [(ngModel)]="confirmPassword" name="confirmPassword" required #regConfirm="ngModel" class="input-field" [ngClass]="{'border-red-500': (regConfirm.invalid || password !== confirmPassword) && (regConfirm.dirty || regConfirm.touched)}" placeholder="••••••••" />
                <div *ngIf="(regConfirm.invalid || password !== confirmPassword) && (regConfirm.dirty || regConfirm.touched)" class="text-red-600 text-xs mt-1">
                  <span *ngIf="regConfirm.errors?.['required']">Please confirm your password.</span>
                  <span *ngIf="!regConfirm.errors?.['required'] && password !== confirmPassword">Passwords do not match.</span>
                </div>
              </div>

              <label class="flex items-start gap-2">
                <input
                  type="checkbox"
                  required
                  class="w-4 h-4 mt-1 rounded border-[#e0e0e0] accent-[#D4AF37]"
                />
                <span class="text-sm text-[#1d1d1f]">
                  I agree to the
                  <a
                    routerLink="/terms"
                    class="text-[#D4AF37] hover:underline font-medium"
                  >
                    Terms of Service
                  </a>
                  and
                  <a
                    routerLink="/privacy"
                    class="text-[#D4AF37] hover:underline font-medium"
                  >
                    Privacy Policy
                  </a>
                </span>
              </label>

              <div>
                <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Referral code <span class="text-[#6e6e73] font-normal">(optional)</span></label>
                <input type="text" [(ngModel)]="referralCode" name="referralCode" autocomplete="off" autocapitalize="characters" spellcheck="false" class="input-field uppercase tracking-[0.08em]" placeholder="e.g. PRIYA-7K2Q" />
                <p class="text-xs text-[#6e6e73] mt-1">Joining on a friend's recommendation? Enter their code and you both earn bonus points on your first order.</p>
              </div>

              <label class="flex items-start gap-2">
                <input
                  type="checkbox"
                  [(ngModel)]="marketingOptIn"
                  name="marketingOptIn"
                  class="w-4 h-4 mt-1 rounded border-[#e0e0e0] accent-[#D4AF37]"
                />
                <span class="text-sm text-[#1d1d1f]">
                  Send me new collections and offers
                  <span class="block text-xs text-[#6e6e73]">Optional. A few emails a year; unsubscribe any time.</span>
                </span>
              </label>

              <button
                type="submit"
                [disabled]="
                  isLoading() ||
                  !registerForm.valid ||
                  password !== confirmPassword
                "
                class="btn-apple-pill w-full"
              >
                {{ isLoading() ? "Creating account..." : "Create Account" }}
              </button>

              <div class="text-center text-sm text-[#6e6e73]">
                Already have an account?
                <button
                  type="button"
                  (click)="toggleMode()"
                  class="text-[#D4AF37] hover:underline font-medium"
                >
                  Sign in
                </button>
              </div>
            </form>
          </div>

          <!-- Error Message -->
          <div
            *ngIf="errorMessage()"
            class="mt-6 bg-red-50 border border-red-200 rounded-[12px] p-4 text-red-600 text-sm"
          >
            {{ errorMessage() }}
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
  rememberMe = false;
  /** Registration only; default unchecked (growth contract, section 3). */
  marketingOptIn = false;
  /** Optional referral code; prefilled from ?ref= (the share link) and shown in register mode. */
  referralCode = "";

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastService = inject(ToastService);

  constructor() {
    const ref = this.route.snapshot.queryParams["ref"];
    if (typeof ref === "string" && ref.trim()) {
      this.referralCode = ref.trim().toUpperCase();
      this.isLogin.set(false);
    }
  }

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
        this.toastService.show('Logged in successfully', 'success');
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set("Invalid email or password. Please try again.");
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
        marketingOptIn: this.marketingOptIn,
        referralCode: this.referralCode.trim() ? this.referralCode.trim().toUpperCase() : undefined,
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.errorMessage.set("");
          this.isLogin.set(true);
          this.toastService.show("Account created successfully! You can now log in with your credentials.", 'success');
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set("Failed to create account. Please try again.");
        },
      });
  }
}
