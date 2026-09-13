import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store, StoreService } from '../../services/store.service';

@Component({
  selector: 'app-store-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './store-list.component.html'
})
export class StoreListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private storeService = inject(StoreService);

  stores: Store[] = [];
  loading = true;
  error = '';

  /** Form is shown while creating or editing; `editingId` tells which. */
  formOpen = false;
  editingId: string | null = null;
  saving = false;
  formError = '';

  /** Store awaiting delete confirmation (inline, no window.confirm). */
  confirmDeleteId: string | null = null;
  deleting = false;

  storeForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    address: ['', [Validators.required, Validators.maxLength(500)]],
    phone: [''],
    hours: [''],
    lat: [0, [Validators.required, Validators.min(-90), Validators.max(90)]],
    lng: [0, [Validators.required, Validators.min(-180), Validators.max(180)]],
  });

  ngOnInit() {
    this.loadStores();
  }

  loadStores() {
    this.loading = true;
    this.error = '';
    this.storeService.getStores().subscribe({
      next: (stores) => {
        this.stores = stores ?? [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load stores', err);
        this.error = 'Failed to load stores.';
        this.loading = false;
      }
    });
  }

  invalid(control: string): boolean {
    const c = this.storeForm.get(control);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  openCreate() {
    this.editingId = null;
    this.formError = '';
    this.storeForm.reset({ name: '', address: '', phone: '', hours: '', lat: 0, lng: 0 });
    this.formOpen = true;
    this.confirmDeleteId = null;
  }

  openEdit(store: Store) {
    this.editingId = store.id;
    this.formError = '';
    this.storeForm.reset({
      name: store.name ?? '',
      address: store.address ?? '',
      phone: store.phone ?? '',
      hours: store.hours ?? '',
      lat: store.lat ?? 0,
      lng: store.lng ?? 0,
    });
    this.formOpen = true;
    this.confirmDeleteId = null;
  }

  cancelForm() {
    this.formOpen = false;
    this.editingId = null;
    this.formError = '';
  }

  submitForm() {
    if (this.storeForm.invalid) {
      this.storeForm.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.formError = '';

    const v = this.storeForm.getRawValue();
    const body = {
      name: v.name.trim(),
      address: v.address.trim(),
      phone: v.phone.trim(),
      hours: v.hours.trim(),
      lat: Number(v.lat),
      lng: Number(v.lng),
    };

    const request = this.editingId
      ? this.storeService.updateStore(this.editingId, { id: this.editingId, ...body })
      : this.storeService.createStore(body);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.cancelForm();
        this.loadStores();
      },
      error: (err) => {
        console.error('Failed to save store', err);
        this.formError = err?.error?.message || 'Failed to save store.';
        this.saving = false;
      }
    });
  }

  askDelete(store: Store) {
    this.confirmDeleteId = store.id;
  }

  cancelDelete() {
    this.confirmDeleteId = null;
  }

  confirmDelete(store: Store) {
    if (!store.id) return;
    this.deleting = true;
    this.storeService.deleteStore(store.id).subscribe({
      next: () => {
        this.deleting = false;
        this.confirmDeleteId = null;
        this.stores = this.stores.filter(s => s.id !== store.id);
      },
      error: (err) => {
        console.error('Failed to delete store', err);
        this.error = err?.error?.message || 'Failed to delete store.';
        this.deleting = false;
        this.confirmDeleteId = null;
      }
    });
  }
}
