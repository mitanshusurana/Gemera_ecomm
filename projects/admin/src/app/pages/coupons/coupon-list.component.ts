import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Coupon, CouponDiscountType, CouponRequest, CouponService } from '../../services/coupon.service';

@Component({
  selector: 'app-coupon-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './coupon-list.component.html'
})
export class CouponListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private couponService = inject(CouponService);

  coupons: Coupon[] = [];
  loading = true;
  error = '';

  // Create / edit form (inline, like the gift-card issue form)
  formOpen = false;
  /** Coupon being edited, or null when creating. */
  editing: Coupon | null = null;
  saving = false;
  formError = '';
  savedMessage = '';

  // Deactivate action (inline confirm)
  confirmDeactivateId: string | null = null;
  deactivating = false;

  readonly discountTypes: Array<{ value: CouponDiscountType; label: string }> = [
    { value: 'PERCENTAGE', label: 'Percentage off' },
    { value: 'FLAT', label: 'Flat amount off (INR)' },
  ];

  couponForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Z0-9_-]{3,32}$/)]],
    description: ['', [Validators.maxLength(500)]],
    discountType: ['PERCENTAGE' as CouponDiscountType, [Validators.required]],
    discountValue: [10, [Validators.required, Validators.min(0.01)]],
    minOrderValue: [null as number | null, [Validators.min(0)]],
    usageLimit: [null as number | null, [Validators.min(1), Validators.pattern(/^\d+$/)]],
    /** `datetime-local` value (local time), converted to ISO on save. */
    expiryDate: [''],
    active: [true],
  });

  ngOnInit() {
    this.loadCoupons();
  }

  loadCoupons() {
    this.loading = true;
    this.error = '';
    this.couponService.getCoupons().subscribe({
      next: (coupons) => {
        this.coupons = [...coupons].sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load coupons', err);
        this.error = 'Failed to load coupons.';
        this.loading = false;
      }
    });
  }

  // -------------------------------------------------------------------
  // Display helpers
  // -------------------------------------------------------------------

  discountLabel(c: Coupon): string {
    const n = Number(c.discountValue) || 0;
    return c.discountType === 'PERCENTAGE' ? `${n}%` : `₹${n.toLocaleString('en-IN')}`;
  }

  usageLabel(c: Coupon): string {
    const used = Number(c.timesUsed) || 0;
    return c.usageLimit == null ? `${used} / ∞` : `${used} / ${c.usageLimit}`;
  }

  isExpired(c: Coupon): boolean {
    if (!c.expiryDate) return false;
    const t = new Date(c.expiryDate).getTime();
    return Number.isFinite(t) && t < Date.now();
  }

  isExhausted(c: Coupon): boolean {
    return c.usageLimit != null && (Number(c.timesUsed) || 0) >= c.usageLimit;
  }

  statusLabel(c: Coupon): string {
    if (!c.active) return 'INACTIVE';
    if (this.isExpired(c)) return 'EXPIRED';
    if (this.isExhausted(c)) return 'EXHAUSTED';
    return 'ACTIVE';
  }

  statusClass(c: Coupon): string {
    switch (this.statusLabel(c)) {
      case 'ACTIVE': return 'bg-emerald-100 text-emerald-800';
      case 'EXPIRED': return 'bg-amber-100 text-amber-800';
      case 'EXHAUSTED': return 'bg-gray-100 text-gray-700';
      default: return 'bg-red-100 text-red-800';
    }
  }

  invalid(control: string): boolean {
    const c = this.couponForm.get(control);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  get isPercentage(): boolean {
    return this.couponForm.controls.discountType.value === 'PERCENTAGE';
  }

  /** Coupon codes are stored upper case without spaces, the way customers type them. */
  normaliseCode() {
    const c = this.couponForm.controls.code;
    const next = c.value.toUpperCase().replace(/\s+/g, '');
    if (next !== c.value) c.setValue(next);
  }

  // -------------------------------------------------------------------
  // Create / edit
  // -------------------------------------------------------------------

  openCreate() {
    this.editing = null;
    this.formError = '';
    this.savedMessage = '';
    this.couponForm.reset({
      code: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: null,
      usageLimit: null,
      expiryDate: '',
      active: true,
    });
    this.formOpen = true;
  }

  openEdit(coupon: Coupon) {
    this.editing = coupon;
    this.formError = '';
    this.savedMessage = '';
    this.couponForm.reset({
      code: coupon.code ?? '',
      description: coupon.description ?? '',
      discountType: coupon.discountType ?? 'PERCENTAGE',
      discountValue: Number(coupon.discountValue) || 0,
      minOrderValue: coupon.minOrderValue ?? null,
      usageLimit: coupon.usageLimit ?? null,
      expiryDate: toDatetimeLocal(coupon.expiryDate),
      active: coupon.active !== false,
    });
    this.formOpen = true;
  }

  closeForm() {
    this.formOpen = false;
    this.editing = null;
    this.formError = '';
  }

  submit() {
    this.normaliseCode();
    if (this.couponForm.invalid) {
      this.couponForm.markAllAsTouched();
      return;
    }
    const v = this.couponForm.getRawValue();
    if (v.discountType === 'PERCENTAGE' && Number(v.discountValue) > 100) {
      this.formError = 'A percentage discount cannot exceed 100%.';
      return;
    }

    const body: CouponRequest = {
      code: v.code.trim(),
      description: v.description.trim() || null,
      discountType: v.discountType,
      discountValue: Number(v.discountValue),
      minOrderValue: v.minOrderValue == null || v.minOrderValue === ('' as unknown) ? null : Number(v.minOrderValue),
      usageLimit: v.usageLimit == null || v.usageLimit === ('' as unknown) ? null : Math.round(Number(v.usageLimit)),
      expiryDate: v.expiryDate ? new Date(v.expiryDate).toISOString() : null,
      active: !!v.active,
    };

    this.saving = true;
    this.formError = '';
    const request = this.editing
      ? this.couponService.updateCoupon(this.editing.id, body)
      : this.couponService.createCoupon(body);
    const wasEditing = !!this.editing;

    request.subscribe({
      next: (saved) => {
        this.saving = false;
        this.savedMessage = wasEditing
          ? `Coupon ${saved?.code || body.code} updated.`
          : `Coupon ${saved?.code || body.code} created.`;
        this.closeForm();
        this.loadCoupons();
      },
      error: (err) => {
        console.error('Failed to save coupon', err);
        this.formError = err?.error?.message || err?.error?.error || 'Failed to save the coupon.';
        this.saving = false;
      }
    });
  }

  // -------------------------------------------------------------------
  // Deactivate
  // -------------------------------------------------------------------

  askDeactivate(coupon: Coupon) {
    this.confirmDeactivateId = coupon.id;
  }

  cancelDeactivate() {
    this.confirmDeactivateId = null;
  }

  confirmDeactivate(coupon: Coupon) {
    this.deactivating = true;
    this.couponService.deactivateCoupon(coupon.id).subscribe({
      next: () => {
        this.deactivating = false;
        this.confirmDeactivateId = null;
        this.coupons = this.coupons.map(c => (c.id === coupon.id ? { ...c, active: false } : c));
      },
      error: (err) => {
        console.error('Failed to deactivate coupon', err);
        this.error = err?.error?.message || 'Failed to deactivate the coupon.';
        this.deactivating = false;
        this.confirmDeactivateId = null;
      }
    });
  }
}

/** ISO datetime -> the `yyyy-MM-ddTHH:mm` local value a datetime-local input needs. */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
