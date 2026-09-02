import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface AuditLogEntry {
  id: string;
  eventType: string;
  userEmail: string;
  details: string;
  ipAddress?: string;
  createdAt?: string;
}

/**
 * Audit trail.
 *
 * This component was an empty class, and its template rendered invented events
 * -- including a fabricated administrator login with an IP address. That is
 * what an auditor would have been shown. It now reads GET /admin/logs, which
 * has existed all along and was never called.
 *
 * The backing coverage is thin: AuditLog is written from only two places in the
 * backend (settings updates and backup triggers), so price changes, stock
 * adjustments, order-status transitions and role changes are not recorded. The
 * page states that rather than letting an empty table imply nothing happened.
 */
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.css',
})
export class AuditLogComponent implements OnInit {
  private http = inject(HttpClient);

  logs: AuditLogEntry[] = [];
  loading = true;
  error: string | null = null;

  page = 0;
  readonly size = 20;
  hasMore = false;

  ngOnInit(): void {
    this.load();
  }

  load(append = false): void {
    this.loading = true;
    this.error = null;

    this.http
      .get<any>(`${environment.apiUrl}/admin/logs`, {
        params: { page: this.page, size: this.size },
      })
      .subscribe({
        next: (res) => {
          const content: AuditLogEntry[] = res?.content ?? [];
          this.logs = append ? [...this.logs, ...content] : content;
          this.hasMore = !res?.last && content.length === this.size;
          this.loading = false;
        },
        error: (err) => {
          this.error =
            err?.status === 403
              ? 'You do not have permission to view the audit trail.'
              : 'Could not load the audit trail. Please try again.';
          this.loading = false;
        },
      });
  }

  loadMore(): void {
    this.page += 1;
    this.load(true);
  }

  /** CSV of what is loaded. The download button previously had no handler. */
  download(): void {
    const header = ['Timestamp', 'Event', 'User', 'IP', 'Details'];
    const rows = this.logs.map((l) => [
      l.createdAt ?? '',
      l.eventType ?? '',
      l.userEmail ?? '',
      l.ipAddress ?? '',
      (l.details ?? '').replace(/"/g, '""'),
    ]);

    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
