import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CreateStaffRequest, StaffRoleInfo, StaffService, StaffUser } from '../../services/staff.service';
import { AuthService } from '../../services/auth.service';
import { ROLE_DESCRIPTIONS, STAFF_ROLES, StaffRole } from '../../core/permissions';

/**
 * Staff accounts (ADMIN only, `staff.manage`): list, create, change role,
 * deactivate / reactivate, reset password. The API refuses to demote or
 * deactivate the signed-in owner and the last active ADMIN; the buttons for
 * those cases are hidden here so the refusal is never the first hint.
 */
@Component({
  selector: 'app-staff-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './staff-list.component.html'
})
export class StaffListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private staffService = inject(StaffService);
  private auth = inject(AuthService);

  staff: StaffUser[] = [];
  /** Roles with their one-line scope; falls back to the local copy until the API answers. */
  roles: StaffRoleInfo[] = STAFF_ROLES.map(r => ({ role: r, description: ROLE_DESCRIPTIONS[r], permissions: [] }));
  loading = true;
  error = '';
  savedMessage = '';

  readonly myEmail = (this.auth.currentUserEmail() || '').toLowerCase();

  // Create form
  formOpen = false;
  saving = false;
  formError = '';
  createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(190)]],
    role: ['SALES' as StaffRole | string, [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });

  // Per-row inline panels: 'role' | 'password' | 'deactivate' | null
  panelFor: string | null = null;
  panel: 'role' | 'password' | 'deactivate' | null = null;
  panelBusy = false;
  panelError = '';
  roleChoice = '';
  newPassword = '';

  ngOnInit() {
    this.load();
    this.staffService.roles().subscribe({
      next: roles => { if (roles?.length) this.roles = roles; },
      error: () => { /* keep the local descriptions */ },
    });
  }

  load() {
    this.loading = true;
    this.error = '';
    this.staffService.list().subscribe({
      next: rows => {
        this.staff = rows;
        this.loading = false;
      },
      error: err => {
        this.error = this.messageOf(err, 'Could not load staff accounts.');
        this.loading = false;
      },
    });
  }

  // ---- derived -----------------------------------------------------------

  describe(role: string): string {
    const fromApi = this.roles.find(r => r.role === role)?.description;
    return fromApi ?? (ROLE_DESCRIPTIONS as Record<string, string>)[role] ?? '';
  }

  get selectedRoleDescription(): string {
    return this.describe(this.createForm.controls.role.value);
  }

  isMe(u: StaffUser): boolean {
    return (u.email || '').toLowerCase() === this.myEmail;
  }

  activeAdminCount(): number {
    return this.staff.filter(u => u.role === 'ADMIN' && u.active).length;
  }

  /** The owner cannot demote or switch off themself, nor the last active ADMIN. */
  isProtected(u: StaffUser): boolean {
    return this.isMe(u) || (u.role === 'ADMIN' && u.active && this.activeAdminCount() <= 1);
  }

  invalid(name: 'name' | 'email' | 'role' | 'password'): boolean {
    const c = this.createForm.controls[name];
    return c.invalid && (c.dirty || c.touched);
  }

  // ---- create ------------------------------------------------------------

  openCreate() {
    this.formOpen = true;
    this.formError = '';
    this.savedMessage = '';
    this.createForm.reset({ name: '', email: '', role: 'SALES', password: '' });
  }

  closeForm() {
    this.formOpen = false;
    this.formError = '';
  }

  submitCreate() {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.formError = '';
    const body: CreateStaffRequest = {
      name: this.createForm.controls.name.value.trim(),
      email: this.createForm.controls.email.value.trim().toLowerCase(),
      role: this.createForm.controls.role.value,
      password: this.createForm.controls.password.value,
    };
    this.staffService.create(body).subscribe({
      next: created => {
        this.staff = [...this.staff, created];
        this.saving = false;
        this.formOpen = false;
        this.savedMessage = `Created ${created.email} as ${created.role}. Share the password with them directly; it is not e-mailed.`;
      },
      error: err => {
        this.formError = this.messageOf(err, 'Could not create the account.');
        this.saving = false;
      },
    });
  }

  // ---- row panels --------------------------------------------------------

  openPanel(u: StaffUser, which: 'role' | 'password' | 'deactivate') {
    if (this.panelFor === u.id && this.panel === which) {
      this.closePanel();
      return;
    }
    this.panelFor = u.id;
    this.panel = which;
    this.panelError = '';
    this.roleChoice = u.role;
    this.newPassword = '';
    this.savedMessage = '';
  }

  closePanel() {
    this.panelFor = null;
    this.panel = null;
    this.panelError = '';
    this.roleChoice = '';
    this.newPassword = '';
  }

  isOpen(u: StaffUser, which: 'role' | 'password' | 'deactivate'): boolean {
    return this.panelFor === u.id && this.panel === which;
  }

  submitRole(u: StaffUser) {
    if (!this.roleChoice || this.roleChoice === u.role) {
      this.closePanel();
      return;
    }
    this.panelBusy = true;
    this.panelError = '';
    this.staffService.changeRole(u.id, this.roleChoice).subscribe({
      next: updated => this.replace(updated, `${updated.email} is now ${updated.role}.`),
      error: err => this.panelFail(err, 'Could not change the role.'),
    });
  }

  submitPassword(u: StaffUser) {
    if (this.newPassword.length < 8) {
      this.panelError = 'Use at least 8 characters.';
      return;
    }
    this.panelBusy = true;
    this.panelError = '';
    this.staffService.resetPassword(u.id, this.newPassword).subscribe({
      next: () => {
        this.panelBusy = false;
        this.closePanel();
        this.savedMessage = `Password for ${u.email} updated. Share it with them directly.`;
      },
      error: err => this.panelFail(err, 'Could not reset the password.'),
    });
  }

  submitActive(u: StaffUser, active: boolean) {
    this.panelBusy = true;
    this.panelError = '';
    this.staffService.setActive(u.id, active).subscribe({
      next: updated => this.replace(updated, active
        ? `${updated.email} can sign in again.`
        : `${updated.email} has been deactivated and can no longer sign in.`),
      error: err => this.panelFail(err, active ? 'Could not reactivate the account.' : 'Could not deactivate the account.'),
    });
  }

  private replace(updated: StaffUser, message: string) {
    this.staff = this.staff.map(s => (s.id === updated.id ? updated : s));
    this.panelBusy = false;
    this.closePanel();
    this.savedMessage = message;
  }

  private panelFail(err: unknown, fallback: string) {
    this.panelError = this.messageOf(err, fallback);
    this.panelBusy = false;
  }

  private messageOf(err: any, fallback: string): string {
    const m = err?.error?.message ?? err?.error?.detail;
    return typeof m === 'string' && m ? m : fallback;
  }
}
