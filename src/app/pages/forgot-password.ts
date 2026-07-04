import { Component, signal, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink, Router } from "@angular/router";
import { AuthService } from "../services/auth.service";
import { ToastService } from "../services/toast.service";

@Component({
  selector: "app-forgot-password",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gradient-to-br from-diamond-50 to-gold-50">
      <div class="container-luxury section-padding">
        <div class="max-w-md mx-auto">
          <div class="card p-8 text-center">
            <h1 class="text-4xl font-display font-bold text-diamond-900 mb-2">
              Forgot Password
            </h1>
            <p class="text-ink mb-8">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form (ngSubmit)="submit()" #forgotForm="ngForm" class="space-y-6 text-left">
              <div>
                <label class="block text-sm font-semibold text-ink mb-2">
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

              <button
                type="submit"
                [disabled]="isLoading() || !forgotForm.valid"
                class="w-full btn-primary"
              >
                {{ isLoading() ? "Sending..." : "Send Reset Link" }}
              </button>

              <div class="text-center text-sm mt-4">
                <a routerLink="/login" class="text-gold-600 hover:text-gold-700 font-semibold">
                  &larr; Back to Login
                </a>
              </div>
            </form>

            <div *ngIf="errorMessage()" class="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
              {{ errorMessage() }}
            </div>
            <div *ngIf="successMessage()" class="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 text-green-600 text-sm">
              {{ successMessage() }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  email = "";
  isLoading = signal(false);
  errorMessage = signal("");
  successMessage = signal("");

  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  submit(): void {
    if (!this.email) return;
    this.isLoading.set(true);
    this.errorMessage.set("");
    this.successMessage.set("");

    this.authService.forgotPassword(this.email).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.successMessage.set("If an account exists, a reset link has been sent to your email.");
        this.toastService.show("Reset link sent", "success");
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set("Failed to process request. Please try again.");
      }
    });
  }
}
