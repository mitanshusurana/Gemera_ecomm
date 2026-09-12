import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-virtual-try-on',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 sm:p-6 animate-fadeIn font-sans">
      <div class="bg-white w-full max-w-5xl rounded-[18px] overflow-hidden shadow-2xl relative flex flex-col lg:flex-row h-full max-h-[850px] border border-white/20">

        <!-- Header Close Button -->
        <button (click)="close()" class="absolute top-4 right-4 z-30 w-9 h-9 bg-black/50 hover:bg-black/80 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all active-press" title="Close AR Studio" aria-label="Close AR Studio">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        <!-- MAIN VIEWPORT (LEFT / CENTER) -->
        <div class="flex-1 bg-[#111113] relative overflow-hidden flex items-center justify-center select-none"
             (mousedown)="startDrag($event)"
             (mousemove)="onDrag($event)"
             (mouseup)="endDrag()"
             (mouseleave)="endDrag()"
             (touchstart)="startDragTouch($event)"
             (touchmove)="onDragTouch($event)"
             (touchend)="endDrag()">
          
          <!-- Mode 1: Live Webcam Stream -->
          <video #videoElement
                 *ngIf="tryOnMode() === 'webcam' && isWebcamRunning()"
                 autoplay
                 playsinline
                 muted
                 class="w-full h-full object-cover">
          </video>

          <!-- Mode 2: Uploaded Photo -->
          <img *ngIf="tryOnMode() === 'upload' && uploadedPhotoUrl()"
               [src]="uploadedPhotoUrl()"
               class="w-full h-full object-contain"
               alt="Uploaded Try-on Reference">

          <!-- Mode 3: Model Silhouette Presets -->
          <div *ngIf="tryOnMode() === 'model'" class="w-full h-full relative flex items-center justify-center bg-gradient-to-b from-[#1c1c1e] to-[#121214]">
            <img [src]="modelPresetUrl()" class="w-full h-full object-contain opacity-75" alt="Model Silhouette">
          </div>

          <!-- Fallback: Webcam Perms / Idle State -->
          <div *ngIf="tryOnMode() === 'webcam' && !isWebcamRunning()" class="text-center p-8 z-10 max-w-sm">
            <div class="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20 text-[#D4AF37]">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
            <h3 class="text-lg font-display font-semibold text-white mb-2">Live Camera Fitting</h3>
            <p class="text-white/60 text-xs mb-6 leading-relaxed">Position your hand or neckline in front of your camera to preview proportions in real-time.</p>
            <button (click)="startWebcam()" class="btn-apple-pill text-xs !py-2.5 !px-6">
              Enable Live Camera
            </button>
            <p *ngIf="cameraError()" class="text-amber-400 text-xs mt-3">{{ cameraError() }}</p>
          </div>

          <!-- DRAGGABLE JEWELRY ITEM OVERLAY -->
          <div *ngIf="productImageUrl && (isWebcamRunning() || tryOnMode() !== 'webcam' || uploadedPhotoUrl())"
               class="absolute cursor-grab active:cursor-grabbing transition-transform duration-75 pointer-events-auto"
               [style.left.px]="posX()"
               [style.top.px]="posY()"
               [style.transform]="'translate(-50%, -50%) scale(' + scale() + ') rotate(' + rotation() + 'deg)'"
               [style.opacity]="opacity()">
            
            <img [src]="productImageUrl"
                 class="w-36 h-36 object-contain pointer-events-none drop-shadow-[0_15px_25px_rgba(0,0,0,0.6)]"
                 [alt]="productName">

            <!-- Bounding Box Indicator -->
            <div class="absolute inset-0 border border-[#D4AF37]/50 rounded-xl pointer-events-none animate-pulse"></div>
          </div>

          <!-- AR Guides & Draggable Hint -->
          <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full text-[11px] text-white/90 border border-white/10 pointer-events-none flex items-center gap-2">
            <span>🖐️</span> Drag to position • Use sliders to resize & rotate
          </div>

          <!-- Hidden Canvas for Snapshot Capture -->
          <canvas #captureCanvas class="hidden"></canvas>

        </div>

        <!-- RIGHT SIDEBAR: CONTROLS & SETTINGS -->
        <div class="w-full lg:w-84 bg-[#fafafc] p-6 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-[#e0e0e0] z-20 overflow-y-auto">
          
          <div class="space-y-6">
            <!-- Product Header -->
            <div>
              <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37] block mb-1">AR Fitting Studio</span>
              <h2 class="font-display font-semibold text-xl text-[#1d1d1f] leading-snug">{{ productName }}</h2>
              <p class="text-xs text-[#7a7a7a] mt-0.5">{{ productCategory }}</p>
            </div>

            <!-- Mode Selector Chips -->
            <div>
              <span class="text-[11px] font-semibold text-[#1d1d1f] uppercase tracking-wider block mb-2">Fitting Canvas</span>
              <div class="grid grid-cols-3 gap-1.5 text-xs">
                <button (click)="setMode('webcam')"
                        [class.bg-[#1d1d1f]]="tryOnMode() === 'webcam'"
                        [class.text-white]="tryOnMode() === 'webcam'"
                        [class.bg-white]="tryOnMode() !== 'webcam'"
                        class="py-2 px-2 rounded-lg border border-[#e0e0e0] text-center font-medium transition-all active-press">
                  📹 Live
                </button>
                <button (click)="setMode('model')"
                        [class.bg-[#1d1d1f]]="tryOnMode() === 'model'"
                        [class.text-white]="tryOnMode() === 'model'"
                        [class.bg-white]="tryOnMode() !== 'model'"
                        class="py-2 px-2 rounded-lg border border-[#e0e0e0] text-center font-medium transition-all active-press">
                  👤 Model
                </button>
                <label class="py-2 px-2 rounded-lg border border-[#e0e0e0] text-center font-medium transition-all active-press cursor-pointer bg-white hover:bg-[#f0f0f0] flex items-center justify-center">
                  📁 Photo
                  <input type="file" (change)="handlePhotoUpload($event)" accept="image/*" aria-label="Upload a photo" class="hidden">
                </label>
              </div>
            </div>

            <!-- Precision Controls: Scale, Rotation, Opacity -->
            <div class="space-y-4 pt-4 border-t border-[#e0e0e0]">
              
              <!-- Scale Slider -->
              <div>
                <div class="flex justify-between text-xs font-semibold text-[#1d1d1f] mb-1">
                  <span>Proportion Size</span>
                  <span class="text-[#7a7a7a]">{{ (scale() * 100).toFixed(0) }}%</span>
                </div>
                <input type="range" min="0.4" max="2.5" step="0.05"
                       [ngModel]="scale()" (ngModelChange)="scale.set($event)"
                       class="w-full accent-[#D4AF37] cursor-pointer">
              </div>

              <!-- Rotation Slider -->
              <div>
                <div class="flex justify-between text-xs font-semibold text-[#1d1d1f] mb-1">
                  <span>Angle Alignment</span>
                  <span class="text-[#7a7a7a]">{{ rotation() }}°</span>
                </div>
                <input type="range" min="-180" max="180" step="5"
                       [ngModel]="rotation()" (ngModelChange)="rotation.set($event)"
                       class="w-full accent-[#D4AF37] cursor-pointer">
              </div>

              <!-- Reset Button -->
              <div class="flex justify-end">
                <button (click)="resetPlacement()" class="text-[11px] text-[#D4AF37] hover:underline font-semibold">
                  ↺ Reset Center
                </button>
              </div>

            </div>

          </div>

          <!-- Bottom Action Buttons -->
          <div class="space-y-3 pt-6 border-t border-[#e0e0e0]">
            <button (click)="takeSnapshot()" class="btn-apple-pill w-full !py-3 text-xs flex items-center justify-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              Save Snapshot
            </button>
            <p class="text-[10px] text-[#7a7a7a] text-center">Snapshot downloads a high-resolution preview with true scale.</p>
          </div>

        </div>

      </div>
    </div>
  `
})
export class VirtualTryOnComponent implements OnDestroy {
  @Input() isOpen = false;
  @Input() productImageUrl?: string;
  @Input() productName = 'Fine Jewelry';
  @Input() productCategory = 'Fine Jewelry';
  @Output() closeEvent = new EventEmitter<void>();

  @ViewChild('videoElement') videoElementRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('captureCanvas') captureCanvasRef?: ElementRef<HTMLCanvasElement>;

  tryOnMode = signal<'webcam' | 'model' | 'upload'>('model');
  isWebcamRunning = signal(false);
  cameraError = signal<string | null>(null);
  uploadedPhotoUrl = signal<string | null>(null);
  
  // Placement Transform Signals
  posX = signal(250);
  posY = signal(250);
  scale = signal(1.0);
  rotation = signal(0);
  opacity = signal(0.95);

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private initialPosX = 0;
  private initialPosY = 0;
  private mediaStream: MediaStream | null = null;

  modelPresetUrl = signal('https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&q=80&w=800');

  ngOnDestroy() {
    this.stopWebcam();
  }

  close() {
    this.stopWebcam();
    this.isOpen = false;
    this.closeEvent.emit();
  }

  setMode(mode: 'webcam' | 'model' | 'upload') {
    this.tryOnMode.set(mode);
    if (mode === 'webcam') {
      this.startWebcam();
    } else {
      this.stopWebcam();
    }
  }

  startWebcam() {
    this.cameraError.set(null);
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
        .then(stream => {
          this.mediaStream = stream;
          this.isWebcamRunning.set(true);
          setTimeout(() => {
            if (this.videoElementRef?.nativeElement) {
              this.videoElementRef.nativeElement.srcObject = stream;
            }
          }, 100);
        })
        .catch(err => {
          console.warn('Webcam permission error:', err);
          this.cameraError.set('Camera access was not granted or is unavailable on this device. You can use Model presets or Upload Photo.');
          this.isWebcamRunning.set(false);
        });
    } else {
      this.cameraError.set('Live camera is not supported in this browser. Please use Model preset or Upload Photo.');
    }
  }

  stopWebcam() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.isWebcamRunning.set(false);
  }

  handlePhotoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.uploadedPhotoUrl.set(e.target?.result as string);
        this.tryOnMode.set('upload');
        this.stopWebcam();
      };
      reader.readAsDataURL(input.files[0]);
    }
  }

  resetPlacement() {
    this.posX.set(250);
    this.posY.set(250);
    this.scale.set(1.0);
    this.rotation.set(0);
  }

  // Drag Interactions
  startDrag(e: MouseEvent) {
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.initialPosX = this.posX();
    this.initialPosY = this.posY();
  }

  onDrag(e: MouseEvent) {
    if (!this.isDragging) return;
    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;
    this.posX.set(this.initialPosX + deltaX);
    this.posY.set(this.initialPosY + deltaY);
  }

  endDrag() {
    this.isDragging = false;
  }

  startDragTouch(e: TouchEvent) {
    if (e.touches.length > 0) {
      this.isDragging = true;
      this.dragStartX = e.touches[0].clientX;
      this.dragStartY = e.touches[0].clientY;
      this.initialPosX = this.posX();
      this.initialPosY = this.posY();
    }
  }

  onDragTouch(e: TouchEvent) {
    if (!this.isDragging || e.touches.length === 0) return;
    const deltaX = e.touches[0].clientX - this.dragStartX;
    const deltaY = e.touches[0].clientY - this.dragStartY;
    this.posX.set(this.initialPosX + deltaX);
    this.posY.set(this.initialPosY + deltaY);
  }

  takeSnapshot() {
    const canvas = this.captureCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 600;

    // Draw background
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If product image is loaded, draw it
    if (this.productImageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((this.rotation() * Math.PI) / 180);
        ctx.scale(this.scale(), this.scale());
        ctx.drawImage(img, -100, -100, 200, 200);
        ctx.restore();

        // Download
        const link = document.createElement('a');
        link.download = `${this.productName.replace(/\s+/g, '_')}_TryOn.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      };
      img.src = this.productImageUrl;
    }
  }
}
