import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none font-sans">
      <div *ngFor="let toast of toastService.toasts()"
           class="pointer-events-auto min-w-[300px] max-w-sm bg-white border border-[#e0e0e0] border-l-4 rounded-[12px] shadow-lg p-4 flex items-start gap-3 transform transition-all duration-300 animate-slide-in-right"
           [ngClass]="{
             'border-l-green-500': toast.type === 'success',
             'border-l-red-500': toast.type === 'error',
             'border-l-blue-500': toast.type === 'info'
           }">

        <!-- Icon -->
        <div class="flex-shrink-0">
          <span *ngIf="toast.type === 'success'" class="text-green-600 text-xl">✓</span>
          <span *ngIf="toast.type === 'error'" class="text-red-600 text-xl">✕</span>
          <span *ngIf="toast.type === 'info'" class="text-blue-600 text-xl">ℹ</span>
        </div>

        <!-- Content -->
        <div class="flex-1 pt-0.5">
          <p class="text-sm font-medium text-[#1d1d1f]">{{ toast.message }}</p>
        </div>

        <!-- Close -->
        <button (click)="toastService.remove(toast.id)" aria-label="Dismiss notification" class="text-[#6e6e73] hover:text-[#1d1d1f] active-press">
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
