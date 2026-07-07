import { Component, signal, inject, OnInit, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute, RouterLink } from "@angular/router";
import { AuthService } from "../services/auth.service";
import { ToastService } from "../services/toast.service";

@Component({
  selector: "app-reset-password",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gradient-to-br from-diamond-50 to-gold-50">
      <div class="container-luxury section-padding">
        <div class="max-w-md mx-auto">
          <div class="card p-8">
            <h1 class="text-4xl font-display font-bold text-diamond-900 mb-2 text-center">
              Reset Password
            </h1>
            <p class="text-ink mb-8 text-center">
              Please enter your new password below.
            </p>

            <form (ngSubmit)="submit()" #resetForm="ngForm" class="space-y-6">
              <div>
                <label class="block text-sm font-semibold text-ink mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  [(ngModel)]="newPassword"
                  name="newPassword"
                  required
                  minlength="8"
                  class="input-field"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label class="block text-sm font-semibold text-ink mb-2">
                  Confirm New Password
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

              <button
                type="submit"
                [disabled]="isLoading() || !resetForm.valid || newPassword !== confirmPassword"
                class="w-full btn-primary"
              >
                {{ isLoading() ? "Resetting..." : "Reset Password" }}
              </button>
            </form>

            <div *ngIf="errorMessage()" class="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
              {{ errorMessage() }}
            </div>
            
            <div *ngIf="successMessage()" class="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 text-green-600 text-sm text-center">
              {{ successMessage() }}
              <div class="mt-2">
                <a routerLink="/login" class="text-gold-600 font-semibold hover:underline">Click here to log in</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ResetPasswordComponent implements OnInit {
  token = "";
  newPassword = "";
  confirmPassword = "";
  
  isLoading = signal(false);
  errorMessage = signal("");
  successMessage = signal("");

  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastService = inject(ToastService);

  ngOnInit() {
    this.token = this.route.snapshot.queryParams['token'];
    if (!this.token) {
      this.errorMessage.set("Invalid or missing reset token.");
    }
  }

  submit(): void {
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage.set("Passwords do not match");
      return;
    }
    if (!this.token) {
      this.errorMessage.set("Token is missing");
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set("");

    this.authService.resetPassword(this.token, this.newPassword).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.successMessage.set("Your password has been reset successfully.");
        this.toastService.show("Password reset successful", "success");
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.errorMessage.set("Failed to reset password. The link might be expired or invalid.");
      }
    });
  }
}
