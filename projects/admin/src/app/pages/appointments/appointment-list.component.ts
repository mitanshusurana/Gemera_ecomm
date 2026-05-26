import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FormsModule } from '@angular/forms';

export interface Appointment {
  id: number;
  name: string;
  email: string;
  phone: string;
  appointmentType: string;
  status: string;
  requestedDate: string;
  productId: number;
  notes: string;
  createdAt: string;
}

@Component({
  selector: 'app-appointment-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-ink">Appointments & Consultations</h1>
      </div>

      <div class="bg-surface rounded-lg shadow overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-surface">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Customer</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-ink uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-surface divide-y divide-gray-200">
            <tr *ngFor="let apt of appointments()">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-ink">
                {{ apt.requestedDate | date:'medium' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-ink">{{ apt.name }}</div>
                <div class="text-sm text-ink">{{ apt.email }}</div>
                <div class="text-sm text-ink">{{ apt.phone }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                  {{ apt.appointmentType }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                  [ngClass]="{
                    'bg-yellow-100 text-yellow-800': apt.status === 'PENDING',
                    'bg-green-100 text-green-800': apt.status === 'COMPLETED' || apt.status === 'APPROVED',
                    'bg-red-100 text-red-800': apt.status === 'REJECTED'
                  }">
                  {{ apt.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <select [ngModel]="apt.status" (ngModelChange)="updateStatus(apt.id, $event)" class="text-sm border-ink rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approve</option>
                  <option value="COMPLETED">Complete</option>
                  <option value="REJECTED">Reject</option>
                </select>
              </td>
            </tr>
            <tr *ngIf="appointments().length === 0">
              <td colspan="5" class="px-6 py-4 text-center text-sm text-ink">No appointments found.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class AppointmentListComponent implements OnInit {
  private http = inject(HttpClient);
  appointments = signal<Appointment[]>([]);

  ngOnInit() {
    this.loadAppointments();
  }

  loadAppointments() {
    this.http.get<Appointment[]>(`${environment.apiUrl}/api/v1/appointments`).subscribe({
      next: (data) => this.appointments.set(data),
      error: (err) => console.error('Failed to load appointments', err)
    });
  }

  updateStatus(id: number, status: string) {
    this.http.patch(`${environment.apiUrl}/api/v1/appointments/${id}/status`, { status }).subscribe({
      next: () => this.loadAppointments(),
      error: (err) => console.error('Failed to update status', err)
    });
  }
}
