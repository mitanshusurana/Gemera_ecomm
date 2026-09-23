import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  errorMessage = '';
  loading = false;

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    const { email, password } = this.loginForm.value;

    this.authService.login({ email, password }).subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (err) => {
        console.error('Login error', err);
        if (err?.status === 401 && /deactivated/i.test(err?.error?.message ?? '')) {
          this.errorMessage = 'This account has been deactivated. Ask the owner to reactivate it.';
        } else if (err instanceof Error && /not a staff account/i.test(err.message)) {
          this.errorMessage = 'This is a customer account. Staff sign in with the account the owner created for them.';
        } else {
          this.errorMessage = 'Invalid email or password';
        }
        this.loading = false;
      }
    });
  }
}
