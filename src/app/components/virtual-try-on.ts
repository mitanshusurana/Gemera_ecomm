import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-virtual-try-on',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 md:p-8 animate-fade-in font-sans">
      <div class="bg-surface w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl relative flex flex-col md:flex-row h-full max-h-[800px]">
        
        <!-- Close Button -->
        <button (click)="close()" class="absolute top-4 right-4 z-20 w-10 h-10 bg-surface/20 hover:bg-surface/40 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        <!-- Camera Area (Left/Top) -->
        <div class="flex-1 bg-ink relative overflow-hidden flex items-center justify-center min-h-[400px]">
          
          <!-- Mock Camera Feed -->
          <img *ngIf="cameraActive()" src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800" class="w-full h-full object-cover opacity-80" alt="Camera Feed">
          
          <!-- Product Overlay (AR Simulation) -->
          <img *ngIf="cameraActive() && productImageUrl" [src]="productImageUrl" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 object-contain drop-shadow-2xl animate-pulse" alt="Product Overlay">
          
          <!-- Camera Off State -->
          <div *ngIf="!cameraActive()" class="text-center p-8">
            <div class="w-20 h-20 bg-surface/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-surface/20">
              <svg class="w-8 h-8 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
            <h3 class="text-xl font-display text-white mb-2">Enable Camera Access</h3>
            <p class="text-white/60 text-sm mb-6 max-w-xs mx-auto">Please allow camera permissions to try this item on virtually in real-time.</p>
            <button (click)="enableCamera()" class="px-6 py-3 bg-white text-ink font-bold rounded-full hover:bg-gold-100 transition-colors">
              Allow Camera
            </button>
          </div>

          <!-- AR Guides -->
          <div *ngIf="cameraActive()" class="absolute inset-0 pointer-events-none border-[1px] border-white/20 m-8 rounded-3xl">
             <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-ink/50 backdrop-blur px-3 py-1 rounded-full text-[10px] text-white uppercase tracking-widest border border-white/10">Look into the camera</div>
          </div>

        </div>

        <!-- Details Sidebar (Right/Bottom) -->
        <div class="w-full md:w-80 bg-surface p-6 flex flex-col border-l border-ink/10 relative z-10">
          <div class="mb-6">
            <span class="inline-block px-2 py-1 bg-gold-100 text-gold-800 text-[10px] font-extrabold uppercase tracking-widest rounded mb-3">Virtual Try-On</span>
            <h2 class="text-2xl font-display font-bold text-ink mb-1">{{ productName }}</h2>
            <p class="text-ink/60 text-sm">{{ productCategory }}</p>
          </div>

          <div class="flex-1">
            <p class="text-sm text-ink/80 mb-6">See how this beautiful piece looks on you before buying. Adjust the position by dragging on the screen.</p>
            
            <div class="space-y-4">
              <button class="w-full py-3 border border-ink text-ink font-bold rounded-lg hover:bg-ink hover:text-surface transition-colors flex items-center justify-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                Take Snapshot
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  `
})
export class VirtualTryOnComponent {
  @Input() isOpen = false;
  @Input() productImageUrl?: string;
  @Input() productName = 'Beautiful Jewelry';
  @Input() productCategory = 'Fine Jewelry';
  @Output() closeEvent = new EventEmitter<void>();

  cameraActive = signal(false);

  close() {
    this.isOpen = false;
    this.cameraActive.set(false);
    this.closeEvent.emit();
  }

  enableCamera() {
    // In a real app, this would request navigator.mediaDevices.getUserMedia
    setTimeout(() => {
      this.cameraActive.set(true);
    }, 600);
  }
}
