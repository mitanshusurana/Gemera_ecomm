import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      <div *ngFor="let toast of toastService.toasts()"
           class="pointer-events-auto min-w-[300px] max-w-sm rounded-lg shadow-lg p-4 flex items-start gap-3 transform transition-all duration-300 animate-slide-in-right"
           [ngClass]="{
             'bg-white border-l-4 border-emerald-500': toast.type === 'success',
             'bg-white border-l-4 border-red-500': toast.type === 'error',
             'bg-white border-l-4 border-blue-500': toast.type === 'info'
           }">

        <!-- Icon -->
        <div class="flex-shrink-0">
          <span *ngIf="toast.type === 'success'" class="text-emerald-500 text-xl">✓</span>
          <span *ngIf="toast.type === 'error'" class="text-red-500 text-xl">✕</span>
          <span *ngIf="toast.type === 'info'" class="text-blue-500 text-xl">ℹ</span>
        </div>

        <!-- Content -->
        <div class="flex-1 pt-0.5">
          <p class="text-sm font-medium text-gray-900">{{ toast.message }}</p>
        </div>

        <!-- Close -->
        <button (click)="toastService.remove(toast.id)" class="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>
    </div>
  `,
  styles: [`
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .animate-slide-in-right {
      animation: slideIn 0.3s ease-out forwards;
    }
  `]
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
