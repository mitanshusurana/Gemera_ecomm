import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BrowserMultiFormatReader } from '@zxing/library';
import { StockService, StockTake, TakeLine, VarianceReport, apiErrorMessage } from '../../services/stock.service';
import { extractSku } from '../../core/labels';

type LineFilter = 'all' | 'counted' | 'uncounted' | 'variance';

/**
 * /stock/takes/:id: the counting screen. A large SKU box (auto-focused so a
 * wedge scanner types straight into it; Enter counts one piece), a camera
 * scanner built on the same @zxing reader the product list uses, a running
 * total for the last scan, the full line list with a "set count" override,
 * a variance tab, and the close confirmation listing every adjustment.
 */
@Component({
  selector: 'app-stock-take-count',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './stock-take-count.component.html'
})
export class StockTakeCountComponent implements OnInit, AfterViewInit, OnDestroy {
  private stockService = inject(StockService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  @ViewChild('skuInput') skuInput?: ElementRef<HTMLInputElement>;
  @ViewChild('scannerVideo') scannerVideo?: ElementRef<HTMLVideoElement>;

  take: StockTake | null = null;
  loading = true;
  error: string | null = null;

  tab: 'count' | 'variance' = 'count';

  // Scanning
  skuText = '';
  /** Pieces added per scan / Enter. */
  step = 1;
  counting = false;
  lastLine: TakeLine | null = null;
  lastCreated = false;
  scanError: string | null = null;
  scansThisSession = 0;

  // Camera (same reader as the product list)
  isScannerOpen = false;
  codeReader = new BrowserMultiFormatReader();
  private lastCameraCode = '';
  private lastCameraAt = 0;

  // Lines table
  filter: LineFilter = 'all';
  lineSearch = '';
  editingLineId: string | null = null;
  editValue: number | null = null;

  // Variance + close
  variance: VarianceReport | null = null;
  varianceLoading = false;
  closeOpen = false;
  closing = false;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) this.load(id);
    });
  }

  ngAfterViewInit() {
    this.focusSku();
  }

  ngOnDestroy() {
    this.stopScanner();
  }

  get isOpen(): boolean {
    return this.take?.status === 'OPEN';
  }

  load(id: string) {
    this.loading = true;
    this.error = null;
    this.stockService.getTake(id).subscribe({
      next: take => {
        this.take = take;
        this.loading = false;
        setTimeout(() => this.focusSku(), 50);
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load the stock take.');
        this.loading = false;
      }
    });
  }

  reload() {
    if (this.take) this.load(this.take.id);
  }

  focusSku() {
    if (this.isOpen) this.skuInput?.nativeElement?.focus();
  }

  // ---------------------------------------------------------------------
  // Counting
  // ---------------------------------------------------------------------

  /** Enter in the SKU box (wedge scanner or typed). */
  onSkuEnter() {
    const sku = extractSku(this.skuText);
    this.skuText = '';
    if (!sku) return;
    this.countSku(sku, { increment: this.stepValue() });
  }

  private stepValue(): number {
    const n = Math.trunc(Number(this.step));
    return Number.isFinite(n) && n !== 0 ? n : 1;
  }

  private countSku(sku: string, body: { increment?: number; countedQuantity?: number }) {
    if (!this.take || !this.isOpen) return;
    this.counting = true;
    this.scanError = null;
    this.stockService.count(this.take.id, { sku, ...body }).subscribe({
      next: result => {
        this.applyResult(result.line, result.lineCreated, result);
        this.counting = false;
        this.beep(true);
        this.focusSku();
      },
      error: err => {
        this.counting = false;
        this.scanError = err?.status === 404
          ? `No product with SKU ${sku}.`
          : apiErrorMessage(err, 'Count failed.');
        this.beep(false);
        this.focusSku();
      }
    });
  }

  private applyResult(line: TakeLine, created: boolean, totals: { lineCount: number; countedLines: number; varianceLines: number }) {
    if (!this.take) return;
    this.lastLine = line;
    this.lastCreated = created;
    this.scansThisSession++;
    const idx = this.take.lines.findIndex(l => l.id === line.id);
    if (idx >= 0) {
      this.take.lines[idx] = line;
    } else {
      this.take.lines.unshift(line);
    }
    this.take.lineCount = totals.lineCount;
    this.take.countedLines = totals.countedLines;
    this.take.varianceLines = totals.varianceLines;
    // Keep the variance tab honest without refetching on every scan.
    this.variance = null;
  }

  /** +1 / -1 buttons on the last-scanned card and on table rows. */
  bump(line: TakeLine, delta: number) {
    if (!this.take || !this.isOpen) return;
    this.counting = true;
    this.stockService.count(this.take.id, { productId: line.productId, increment: delta }).subscribe({
      next: result => {
        this.applyResult(result.line, result.lineCreated, result);
        this.counting = false;
        this.focusSku();
      },
      error: err => {
        this.counting = false;
        this.toastr.error(apiErrorMessage(err, 'Count failed.'));
      }
    });
  }

  startEdit(line: TakeLine) {
    if (!this.isOpen) return;
    this.editingLineId = line.id;
    this.editValue = line.countedQuantity ?? line.expectedQuantity;
  }

  cancelEdit() {
    this.editingLineId = null;
    this.editValue = null;
    this.focusSku();
  }

  /** "Set count": absolute override for a line. */
  saveEdit(line: TakeLine) {
    if (!this.take || !this.isOpen) return;
    const value = Math.trunc(Number(this.editValue));
    if (!Number.isFinite(value) || value < 0) {
      this.toastr.warning('Enter a whole number of 0 or more.');
      return;
    }
    this.counting = true;
    this.stockService.count(this.take.id, { productId: line.productId, countedQuantity: value }).subscribe({
      next: result => {
        this.applyResult(result.line, result.lineCreated, result);
        this.counting = false;
        this.editingLineId = null;
        this.editValue = null;
        this.focusSku();
      },
      error: err => {
        this.counting = false;
        this.toastr.error(apiErrorMessage(err, 'Could not set the count.'));
      }
    });
  }

  markZero(line: TakeLine) {
    if (!this.take || !this.isOpen) return;
    this.counting = true;
    this.stockService.count(this.take.id, { productId: line.productId, countedQuantity: 0 }).subscribe({
      next: result => {
        this.applyResult(result.line, result.lineCreated, result);
        this.counting = false;
        this.focusSku();
      },
      error: err => {
        this.counting = false;
        this.toastr.error(apiErrorMessage(err, 'Could not set the count.'));
      }
    });
  }

  // ---------------------------------------------------------------------
  // Lines table
  // ---------------------------------------------------------------------

  get visibleLines(): TakeLine[] {
    const lines = this.take?.lines ?? [];
    const q = this.lineSearch.trim().toLowerCase();
    return lines.filter(l => {
      switch (this.filter) {
        case 'counted': if (l.countedQuantity == null) return false; break;
        case 'uncounted': if (l.countedQuantity != null) return false; break;
        case 'variance': if (l.countedQuantity == null || !l.variance) return false; break;
      }
      if (!q) return true;
      return (l.name ?? '').toLowerCase().includes(q) || (l.sku ?? '').toLowerCase().includes(q);
    });
  }

  get uncountedCount(): number {
    return (this.take?.lines ?? []).filter(l => l.countedQuantity == null).length;
  }

  get expectedPieces(): number {
    return (this.take?.lines ?? []).reduce((s, l) => s + (l.expectedQuantity || 0), 0);
  }

  get countedPieces(): number {
    return (this.take?.lines ?? []).reduce((s, l) => s + (l.countedQuantity || 0), 0);
  }

  varianceClass(v: number | null | undefined): string {
    if (v == null || v === 0) return 'text-ink/60';
    return v > 0 ? 'text-emerald-700' : 'text-red-600';
  }

  signed(v: number | null | undefined): string {
    if (v == null) return '—';
    return v > 0 ? `+${v}` : String(v);
  }

  // ---------------------------------------------------------------------
  // Variance tab + close
  // ---------------------------------------------------------------------

  showVariance() {
    this.tab = 'variance';
    this.stopScanner();
    this.loadVariance();
  }

  showCount() {
    this.tab = 'count';
    setTimeout(() => this.focusSku(), 50);
  }

  loadVariance() {
    if (!this.take) return;
    this.varianceLoading = true;
    this.stockService.getVariance(this.take.id).subscribe({
      next: v => {
        this.variance = v;
        this.varianceLoading = false;
      },
      error: err => {
        this.varianceLoading = false;
        this.toastr.error(apiErrorMessage(err, 'Could not load the variance report.'));
      }
    });
  }

  openClose() {
    this.stopScanner();
    this.closeOpen = true;
    if (!this.variance) this.loadVariance();
  }

  cancelClose() {
    this.closeOpen = false;
    this.focusSku();
  }

  confirmClose() {
    if (!this.take || this.closing) return;
    this.closing = true;
    this.stockService.closeTake(this.take.id).subscribe({
      next: take => {
        this.take = take;
        this.closing = false;
        this.closeOpen = false;
        this.toastr.success(`${take.takeNumber} closed; ${this.variance?.lines.length ?? 0} adjustment(s) applied`);
        this.tab = 'variance';
        this.loadVariance();
      },
      error: err => {
        this.closing = false;
        this.toastr.error(apiErrorMessage(err, 'Could not close the stock take.'));
      }
    });
  }

  cancelTake() {
    if (!this.take || !this.isOpen) return;
    if (!confirm(`Cancel ${this.take.takeNumber}? No quantities change and the counts so far are kept for reference.`)) return;
    this.stopScanner();
    this.stockService.cancelTake(this.take.id).subscribe({
      next: take => {
        this.take = take;
        this.toastr.info(`${take.takeNumber} cancelled`);
      },
      error: err => this.toastr.error(apiErrorMessage(err, 'Could not cancel the stock take.'))
    });
  }

  // ---------------------------------------------------------------------
  // Camera scanner (same approach as ProductListComponent, but continuous:
  // the reader stays on and every distinct code, or the same code after a
  // short pause, counts one more piece)
  // ---------------------------------------------------------------------

  toggleScanner() {
    this.isScannerOpen = !this.isScannerOpen;
    if (this.isScannerOpen) {
      this.startScanner();
    } else {
      this.stopScanner();
      this.focusSku();
    }
  }

  startScanner() {
    setTimeout(async () => {
      const video = this.scannerVideo?.nativeElement;
      if (!video) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        const devices = await this.codeReader.listVideoInputDevices();
        if (devices.length === 0) {
          this.toastr.warning('No camera found.');
          this.isScannerOpen = false;
          return;
        }
        let deviceId = devices[0].deviceId;
        const back = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
        if (back) deviceId = back.deviceId;
        this.codeReader.decodeFromVideoDevice(deviceId, video, result => {
          if (!result) return;
          const text = result.getText();
          const now = Date.now();
          // The reader fires on every frame; count the same code again only after a pause.
          if (text === this.lastCameraCode && now - this.lastCameraAt < 2000) return;
          this.lastCameraCode = text;
          this.lastCameraAt = now;
          const sku = extractSku(text);
          if (sku) this.countSku(sku, { increment: this.stepValue() });
        }).catch(err => {
          console.error(err);
          this.toastr.error('Could not start the camera scanner.');
          this.isScannerOpen = false;
        });
      } catch (err) {
        console.error('Camera permission error', err);
        this.toastr.error('Could not access the camera. Check the browser permission.');
        this.isScannerOpen = false;
      }
    }, 100);
  }

  stopScanner() {
    try {
      this.codeReader.reset();
    } catch {
      // reader not started
    }
    const video = this.scannerVideo?.nativeElement;
    const stream = video?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      if (video) video.srcObject = null;
    }
    this.isScannerOpen = false;
  }

  /** Short tone so a scan can be confirmed without looking at the screen. */
  private beep(ok: boolean) {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 1200 : 300;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
      osc.onended = () => ctx.close();
    } catch {
      // audio is a convenience only
    }
  }
}
