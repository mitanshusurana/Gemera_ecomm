import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import {
  ChannelStatus,
  EventTemplate,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  NotificationChannel,
  NotificationLogEntry,
  NotificationService,
  TestResponse,
} from '../../services/notification.service';

/**
 * Messaging log: every e-mail, WhatsApp and SMS attempt with its outcome,
 * the provider state per channel, and a "send test" form so an operator can
 * prove a newly configured provider works before customers depend on it.
 */
@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notification-list.component.html'
})
export class NotificationListComponent implements OnInit {
  private service = inject(NotificationService);
  private authService = inject(AuthService);

  readonly channels = NOTIFICATION_CHANNELS;
  readonly statuses = NOTIFICATION_STATUSES;

  channelStatus: Partial<Record<NotificationChannel, ChannelStatus>> = {};
  events: EventTemplate[] = [];

  logs: NotificationLogEntry[] = [];
  loading = true;
  error: string | null = null;
  page = 0;
  readonly size = 25;
  totalElements = 0;
  totalPages = 0;

  filterChannel = '';
  filterStatus = '';
  search = '';

  /** Test form */
  testChannel: NotificationChannel = 'WHATSAPP';
  testDestination = '';
  testEvent = '';
  testing = false;
  testResult: TestResponse | null = null;
  testError: string | null = null;

  get canTest(): boolean {
    return this.authService.can('settings.write');
  }

  ngOnInit(): void {
    this.service.channels().subscribe({
      next: (c) => (this.channelStatus = c),
      error: () => { /* cards show "unknown" */ },
    });
    this.service.events().subscribe({
      next: (e) => (this.events = e),
      error: () => { /* the test form then offers only the default message */ },
    });
    this.load();
  }

  load(page = 0): void {
    this.page = page;
    this.loading = true;
    this.error = null;
    this.service.list(page, this.size, this.filterChannel, this.filterStatus, this.search).subscribe({
      next: (res) => {
        this.logs = res.content ?? [];
        this.totalElements = res.totalElements ?? 0;
        this.totalPages = res.totalPages ?? 0;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.status === 403
          ? 'You do not have permission to view the messaging log.'
          : 'Could not load the messaging log. Please try again.';
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    this.load(0);
  }

  clearFilters(): void {
    this.filterChannel = '';
    this.filterStatus = '';
    this.search = '';
    this.load(0);
  }

  /** Events that have a template on the selected test channel. */
  testEvents(): EventTemplate[] {
    return this.events.filter((e) =>
      this.testChannel === 'EMAIL' ? !!e.emailTemplate
        : this.testChannel === 'WHATSAPP' ? !!e.waTemplate
          : !!e.smsText);
  }

  onTestChannelChange(): void {
    this.testEvent = '';
    this.testResult = null;
    this.testError = null;
  }

  sendTest(): void {
    const destination = this.testDestination.trim();
    if (!destination) {
      this.testError = this.testChannel === 'EMAIL' ? 'Enter an e-mail address.' : 'Enter a mobile number.';
      return;
    }
    this.testing = true;
    this.testResult = null;
    this.testError = null;
    this.service.sendTest(this.testChannel, destination, this.testEvent || undefined).subscribe({
      next: (res) => {
        this.testResult = res;
        this.testing = false;
        this.load(0);
      },
      error: (err) => {
        const detail = err?.error?.detail || err?.error?.message;
        this.testError = typeof detail === 'string' ? detail : 'The test could not be sent.';
        this.testing = false;
      },
    });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'SENT': return 'bg-green-100 text-green-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      default: return 'bg-ink/10 text-ink/80';
    }
  }

  channelIcon(channel: string): string {
    switch (channel) {
      case 'EMAIL': return 'mail';
      case 'WHATSAPP': return 'chat';
      case 'SMS': return 'sms';
      default: return 'notifications';
    }
  }

  /** "ORDER_SHIPPED" to "Order shipped". */
  eventLabel(event: string): string {
    if (!event) return '';
    const s = event.replace(/_/g, ' ').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
