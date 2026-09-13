import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GiftCard, GiftCardService, GiftCardStatus } from '../../services/gift-card.service';

@Component({
  selector: 'app-gift-card-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './gift-card-list.component.html'
})
export class GiftCardListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private giftCardService = inject(GiftCardService);

  cards: GiftCard[] = [];
  loading = true;
  error = '';

  currentPage = 0;
  pageSize = 20;
  totalPages = 0;
  totalElements = 0;

  // Issue form
  issueOpen = false;
  issuing = false;
  issueError = '';
  issuedCard: GiftCard | null = null;

  // Disable action (inline confirm)
  confirmDisableId: string | null = null;
  disabling = false;

  /** Amount rules from the contract: integer INR, 500..100000. */
  issueForm = this.fb.nonNullable.group({
    amount: [1000, [Validators.required, Validators.min(500), Validators.max(100000), Validators.pattern(/^\d+$/)]],
    recipientName: ['', [Validators.required, Validators.maxLength(200)]],
    recipientEmail: ['', [Validators.required, Validators.email]],
    message: ['', [Validators.maxLength(500)]],
    note: ['', [Validators.maxLength(500)]],
  });

  ngOnInit() {
    this.loadCards();
  }

  loadCards() {
    this.loading = true;
    this.error = '';
    this.giftCardService.getGiftCards(this.currentPage, this.pageSize).subscribe({
      next: (page) => {
        this.cards = page?.content ?? [];
        this.totalPages = page?.totalPages ?? 0;
        this.totalElements = page?.totalElements ?? 0;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load gift cards', err);
        this.error = 'Failed to load gift cards.';
        this.loading = false;
      }
    });
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.loadCards();
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadCards();
    }
  }

  statusClass(status: GiftCardStatus | string): string {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-100 text-emerald-800';
      case 'PENDING_PAYMENT': return 'bg-amber-100 text-amber-800';
      case 'DEPLETED': return 'bg-gray-100 text-gray-700';
      case 'DISABLED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  statusLabel(status: GiftCardStatus | string): string {
    return (status || '').replace('_', ' ');
  }

  canDisable(card: GiftCard): boolean {
    return card.status === 'ACTIVE' || card.status === 'PENDING_PAYMENT';
  }

  invalid(control: string): boolean {
    const c = this.issueForm.get(control);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  toggleIssue() {
    this.issueOpen = !this.issueOpen;
    this.issueError = '';
    if (this.issueOpen) {
      this.issuedCard = null;
      this.issueForm.reset({ amount: 1000, recipientName: '', recipientEmail: '', message: '', note: '' });
    }
  }

  submitIssue() {
    if (this.issueForm.invalid) {
      this.issueForm.markAllAsTouched();
      return;
    }
    this.issuing = true;
    this.issueError = '';

    const v = this.issueForm.getRawValue();
    const body = {
      amount: Math.round(Number(v.amount)),
      recipientName: v.recipientName.trim(),
      recipientEmail: v.recipientEmail.trim(),
      message: v.message.trim() || undefined,
      note: v.note.trim() || undefined,
    };

    this.giftCardService.issueGiftCard(body).subscribe({
      next: (card) => {
        this.issuing = false;
        this.issuedCard = card;
        this.issueOpen = false;
        this.currentPage = 0;
        this.loadCards();
      },
      error: (err) => {
        console.error('Failed to issue gift card', err);
        this.issueError = err?.error?.message || 'Failed to issue gift card.';
        this.issuing = false;
      }
    });
  }

  askDisable(card: GiftCard) {
    this.confirmDisableId = card.id;
  }

  cancelDisable() {
    this.confirmDisableId = null;
  }

  confirmDisable(card: GiftCard) {
    this.disabling = true;
    this.giftCardService.disableGiftCard(card.id).subscribe({
      next: (updated) => {
        this.disabling = false;
        this.confirmDisableId = null;
        this.cards = this.cards.map(c => (c.id === updated.id ? updated : c));
      },
      error: (err) => {
        console.error('Failed to disable gift card', err);
        this.error = err?.error?.message || 'Failed to disable gift card.';
        this.disabling = false;
        this.confirmDisableId = null;
      }
    });
  }
}
