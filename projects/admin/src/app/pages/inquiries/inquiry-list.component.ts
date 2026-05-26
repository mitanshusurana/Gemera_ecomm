import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FormsModule } from '@angular/forms';

export interface CustomInquiry {
  id: number;
  name: string;
  email: string;
  phone: string;
  concept: string;
  attachmentUrl: string;
  status: string;
  createdAt: string;
}

@Component({
  selector: 'app-inquiry-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-ink">Custom Design Inquiries</h1>
      </div>

      <div class="bg-surface rounded-lg shadow overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-surface">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Customer</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Concept</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Attachment</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-surface divide-y divide-gray-200">
            <tr *ngFor="let inq of inquiries()">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-ink">
                {{ inq.createdAt | date:'mediumDate' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-ink">{{ inq.name }}</div>
                <div class="text-sm text-ink">{{ inq.email }}</div>
                <div class="text-sm text-ink">{{ inq.phone }}</div>
              </td>
              <td class="px-6 py-4">
                <div class="text-sm text-ink max-w-xs truncate" [title]="inq.concept">{{ inq.concept }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <a *ngIf="inq.attachmentUrl" [href]="inq.attachmentUrl" target="_blank" class="text-indigo-600 hover:text-indigo-900">View File</a>
                <span *ngIf="!inq.attachmentUrl" class="text-ink">-</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                  [ngClass]="{
                    'bg-yellow-100 text-yellow-800': inq.status === 'PENDING',
                    'bg-blue-100 text-blue-800': inq.status === 'REVIEWED',
                    'bg-green-100 text-green-800': inq.status === 'CONTACTED',
                    'bg-surface text-ink': inq.status === 'CLOSED'
                  }">
                  {{ inq.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <select [ngModel]="inq.status" (ngModelChange)="updateStatus(inq.id, $event)" class="text-sm border-ink rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                  <option value="PENDING">Pending</option>
                  <option value="REVIEWED">Reviewed</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </td>
            </tr>
            <tr *ngIf="inquiries().length === 0">
              <td colspan="6" class="px-6 py-4 text-center text-sm text-ink">No inquiries found.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class InquiryListComponent implements OnInit {
  private http = inject(HttpClient);
  inquiries = signal<CustomInquiry[]>([]);

  ngOnInit() {
    this.loadInquiries();
  }

  loadInquiries() {
    this.http.get<CustomInquiry[]>(`${environment.apiUrl}/api/v1/inquiries`).subscribe({
      next: (data) => this.inquiries.set(data),
      error: (err) => console.error('Failed to load inquiries', err)
    });
  }

  updateStatus(id: number, status: string) {
    this.http.patch(`${environment.apiUrl}/api/v1/inquiries/${id}/status`, { status }).subscribe({
      next: () => this.loadInquiries(),
      error: (err) => console.error('Failed to update status', err)
    });
  }
}
