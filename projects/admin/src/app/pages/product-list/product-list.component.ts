import { environment } from '../../../environments/environment';
import { Component, inject, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductService, CostPriceRow, CostPriceImportResult } from '../../services/product.service';
import { AuthService } from '../../services/auth.service';
import { BrowserMultiFormatReader } from '@zxing/library';
import { QRCodeComponent } from 'angularx-qrcode';
import { ToastrService } from 'ngx-toastr';
import { extractSku, isLowStock, productQrUrl } from '../../core/labels';
import { StockService, ErpCodeMapping, ErpCodeMappingResult, apiErrorMessage } from '../../services/stock.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, QRCodeComponent],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Storefront origin for the 'View Live' preview and the QR payloads. */
  readonly storefrontUrl = environment.storefrontUrl;

  private productService = inject(ProductService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private stockService = inject(StockService);
  private authService = inject(AuthService);

  /** Cost price and margin are shown only to staff who may edit products. */
  get canWrite(): boolean {
    return this.authService.can('products.write');
  }

  /** (price - cost) / price x 100 for the margin column; null when either is missing. */
  marginPercent(product: any): number | null {
    const price = Number(product?.price);
    const cost = product?.costPrice;
    if (!price || price <= 0 || cost === null || cost === undefined) return null;
    const c = Number(cost);
    return isFinite(c) ? (price - c) / price * 100 : null;
  }

  marginClass(product: any): string {
    const m = this.marginPercent(product);
    if (m === null) return 'text-ink/50';
    if (m < 0) return 'text-red-600';
    if (m < 10) return 'text-amber-600';
    return 'text-emerald-700';
  }

  @ViewChild('searchInput') searchInput!: ElementRef;

  /** Rows as returned by the API for the current search. */
  products: any[] = [];
  loading = true;
  searchQuery: string = '';
  searchTimeout: any;

  /** §5: `?lowStock=true` filters client-side to stock <= (reorderPointAlert ?? 1). */
  lowStockOnly = false;

  /**
   * FINISH-CONTRACT §1: `?incomplete=true` loads GET /admin/inventory/incomplete
   * (server-paged) instead of the catalogue. Rows are IncompleteProductDTOs:
   * { id, sku, name, category, itemType, missingFields } and carry no price or stock.
   */
  incompleteOnly = false;
  incompletePage = 0;
  readonly incompletePageSize = 50;
  incompleteTotalPages = 0;
  incompleteTotalElements = 0;
  /** Set when the incomplete endpoint is unavailable, so the page explains rather than showing an empty table. */
  incompleteError: string | null = null;

  get printQueueCount() {
    return this.productService.getPrintQueue().length;
  }

  // QR Scanner logic
  isScannerOpen = false;
  codeReader = new BrowserMultiFormatReader();
  @ViewChild('scannerVideo') scannerVideo!: ElementRef<HTMLVideoElement>;

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.lowStockOnly = params.get('lowStock') === 'true';
      this.incompleteOnly = params.get('incomplete') === 'true';
      this.incompletePage = 0;
      this.loadProducts(this.searchQuery);
    });
  }

  ngOnDestroy() {
    this.stopScanner();
  }

  ngAfterViewInit() {
    // Focus search input automatically so a barcode scanner can type immediately
    setTimeout(() => this.searchInput?.nativeElement?.focus(), 100);
  }

  // ---------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------

  /** What the table shows: the API rows, narrowed to low-stock ones when asked. */
  get visibleProducts(): any[] {
    return this.lowStockOnly && !this.incompleteOnly ? this.products.filter(isLowStock) : this.products;
  }

  /** Incomplete rows carry no stock, so the low-stock highlight only applies to catalogue rows. */
  isLowStock(product: any): boolean {
    return !this.incompleteOnly && isLowStock(product);
  }

  /** The `missingFields` labels of an incomplete row, tolerant of a missing or malformed array. */
  missingFieldsOf(product: any): string[] {
    const fields = product?.missingFields;
    return Array.isArray(fields) ? fields.filter((f: unknown) => typeof f === 'string' && f.trim() !== '') : [];
  }

  qrUrl(sku: string): string {
    return productQrUrl(this.storefrontUrl, sku);
  }

  clearLowStockFilter() {
    this.router.navigate(['/products'], { queryParams: {} });
  }

  clearIncompleteFilter() {
    this.router.navigate(['/products'], { queryParams: {} });
  }

  goToIncompletePage(page: number) {
    if (page < 0 || (this.incompleteTotalPages > 0 && page >= this.incompleteTotalPages)) return;
    this.incompletePage = page;
    this.loadIncomplete();
  }

  // ---------------------------------------------------------------------
  // Scanner / SKU lookup (§1)
  // ---------------------------------------------------------------------

  toggleScanner() {
    this.isScannerOpen = !this.isScannerOpen;
    if (this.isScannerOpen) {
      this.startScanner();
    } else {
      this.stopScanner();
    }
  }

  startScanner() {
    setTimeout(async () => {
      if (this.scannerVideo && this.scannerVideo.nativeElement) {
        try {
          // Explicitly request camera permission first
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });

          // Stop the initial stream immediately, we just needed it to trigger the permission prompt
          // and allow listVideoInputDevices to see the labels.
          stream.getTracks().forEach(track => track.stop());

          this.codeReader.listVideoInputDevices()
            .then((videoInputDevices) => {
              if (videoInputDevices.length > 0) {
                // Try to find the back camera, fallback to the first one available
                let selectedDeviceId = videoInputDevices[0].deviceId;
                const backCamera = videoInputDevices.find((device) =>
                  device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('environment')
                );
                if (backCamera) {
                  selectedDeviceId = backCamera.deviceId;
                }

                this.codeReader.decodeFromVideoDevice(selectedDeviceId, this.scannerVideo.nativeElement, (result) => {
                  if (result) {
                    this.stopScanner();
                    this.isScannerOpen = false;
                    this.lookupScanned(result.getText());
                  }
                }).catch(console.error);
              } else {
                alert('No camera devices found.');
                this.isScannerOpen = false;
              }
            })
            .catch((err) => {
              console.error('Error listing camera devices:', err);
              alert('Could not list camera devices.');
              this.isScannerOpen = false;
            });
        } catch (err) {
          console.error('Error accessing camera permissions:', err);
          alert('Could not access the camera. Please ensure permissions are granted.');
          this.isScannerOpen = false;
        }
      }
    }, 100);
  }

  stopScanner() {
    this.codeReader.reset();

    // Explicitly release video stream from the browser
    if (this.scannerVideo && this.scannerVideo.nativeElement) {
      const stream = this.scannerVideo.nativeElement.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        this.scannerVideo.nativeElement.srcObject = null;
      }
    }
  }

  /**
   * A scan (camera or a wedge scanner pressing Enter in the search box) may be
   * a raw SKU or a `/p/{sku}` URL. Resolve it and open the edit page when the
   * SKU is known; otherwise fall back to a normal search for the text.
   */
  lookupScanned(raw: string) {
    const sku = extractSku(raw);
    if (!sku) return;
    this.searchQuery = sku;
    this.productService.getProductBySku(sku).subscribe({
      next: (product) => {
        if (product?.id) {
          this.router.navigate(['/products/edit', product.id]);
        } else {
          this.loadProducts(sku);
        }
      },
      error: () => {
        this.toastr.info(`No product with SKU ${sku}; showing search results instead.`);
        this.loadProducts(sku);
      }
    });
  }

  onSearchEnter() {
    clearTimeout(this.searchTimeout);
    this.lookupScanned(this.searchQuery);
  }

  onSearch(event: any) {
    clearTimeout(this.searchTimeout);
    this.searchQuery = event.target.value;

    // Debounce search slightly to wait for full scanner input or fast typing
    this.searchTimeout = setTimeout(() => {
      this.loadProducts(this.searchQuery);
    }, 300);
  }

  clearSearch() {
    this.searchQuery = '';
    this.loadProducts();
    this.searchInput?.nativeElement?.focus();
  }

  loadProducts(search?: string) {
    if (this.incompleteOnly) {
      this.loadIncomplete();
      return;
    }
    this.loading = true;
    // The low-stock filter is applied client-side, so pull a large page for it.
    const opts = this.lowStockOnly ? { page: 0, size: 500 } : {};
    this.productService.getProducts(search, opts).subscribe({
      next: (data) => {
        this.products = Array.isArray(data) ? data : (data?.content ?? []);
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load products', err);
        this.loading = false;
      }
    });
  }

  /** FINISH-CONTRACT §1: one server page of products failing their item-type rules. */
  private loadIncomplete() {
    this.loading = true;
    this.incompleteError = null;
    this.productService.getIncomplete(this.incompletePage, this.incompletePageSize).subscribe({
      next: (data: any) => {
        const rows = Array.isArray(data) ? data : (data?.content ?? []);
        this.products = Array.isArray(rows) ? rows : [];
        this.incompleteTotalElements = typeof data?.totalElements === 'number' ? data.totalElements : this.products.length;
        this.incompleteTotalPages = typeof data?.totalPages === 'number' ? data.totalPages : (this.products.length ? 1 : 0);
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load incomplete products', err);
        this.products = [];
        this.incompleteTotalElements = 0;
        this.incompleteTotalPages = 0;
        this.incompleteError = err?.status === 404
          ? 'The catalogue-health check is not available on this server yet.'
          : 'Could not load the catalogue-health check. Try again in a moment.';
        this.loading = false;
      }
    });
  }

  deleteProduct(id: string) {
    if (confirm('Are you sure you want to delete this product?')) {
      this.productService.deleteProduct(id).subscribe({
        next: () => {
          this.productService.removeFromPrintQueue(id);
          this.loadProducts(this.searchQuery);
        },
        error: (err) => {
          console.error('Failed to delete product', err);
          alert('Failed to delete product');
        }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Label selection (§1)
  // ---------------------------------------------------------------------

  togglePrintSelection(product: any, event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    if (isChecked) {
      this.productService.addToPrintQueue(product);
    } else {
      this.productService.removeFromPrintQueue(product.id);
    }
  }

  isProductSelected(product: any): boolean {
    return this.productService.isInPrintQueue(product.id);
  }

  /** True when every visible row is selected (and there is at least one). */
  get allVisibleSelected(): boolean {
    const rows = this.visibleProducts;
    return rows.length > 0 && rows.every(p => this.isProductSelected(p));
  }

  get someVisibleSelected(): boolean {
    return !this.allVisibleSelected && this.visibleProducts.some(p => this.isProductSelected(p));
  }

  toggleSelectPage(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    for (const p of this.visibleProducts) {
      if (checked) this.productService.addToPrintQueue(p);
      else this.productService.removeFromPrintQueue(p.id);
    }
  }

  printLabels() {
    const ids = this.productService.getPrintQueue().map(p => p.id);
    if (ids.length === 0) return;
    this.router.navigate(['/products/labels'], { queryParams: { ids: ids.join(',') } });
  }

  clearPrintQueue() {
    this.productService.clearPrintQueue();
  }

  // ---------------------------------------------------------------------
  // ERP material codes: paste `sku,code` lines -> preview -> PUT /admin/inventory/erp-codes
  // ---------------------------------------------------------------------

  erpImportOpen = false;
  erpImportText = '';
  erpImportRows: ErpCodeMapping[] = [];
  erpImportSkipped: string[] = [];
  erpImportResult: ErpCodeMappingResult | null = null;
  erpImportError: string | null = null;
  erpImporting = false;

  openErpImport() {
    this.erpImportOpen = true;
    this.erpImportResult = null;
    this.erpImportError = null;
  }

  closeErpImport() {
    this.erpImportOpen = false;
  }

  /**
   * Parse the pasted CSV: one `sku,code` per line; tabs and semicolons work as
   * separators too, quotes are stripped, a header row (first cell "sku") and
   * blank lines are skipped. A line with only a SKU clears that SKU's code.
   */
  parseErpImport() {
    const rows: ErpCodeMapping[] = [];
    const skipped: string[] = [];
    const seen = new Map<string, number>();
    const lines = this.erpImportText.split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const cells = line.split(/[,;\t]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      const sku = cells[0] ?? '';
      const code = (cells[1] ?? '').toUpperCase();
      if (!sku) { skipped.push(`Line ${i + 1}: no SKU`); return; }
      if (i === 0 && sku.toLowerCase() === 'sku') return; // header row
      const key = sku.toLowerCase();
      if (seen.has(key)) {
        rows[seen.get(key)!] = { sku, erpMaterialCode: code }; // last mention wins
        skipped.push(`Line ${i + 1}: ${sku} repeated, later value kept`);
        return;
      }
      seen.set(key, rows.length);
      rows.push({ sku, erpMaterialCode: code });
    });
    this.erpImportRows = rows;
    this.erpImportSkipped = skipped;
    this.erpImportResult = null;
    this.erpImportError = null;
  }

  get erpImportClears(): number {
    return this.erpImportRows.filter(r => !r.erpMaterialCode).length;
  }

  applyErpImport() {
    if (this.erpImportRows.length === 0 || this.erpImporting) return;
    this.erpImporting = true;
    this.erpImportError = null;
    this.stockService.mapErpCodes(this.erpImportRows).subscribe({
      next: (result) => {
        this.erpImportResult = result;
        this.erpImporting = false;
        this.toastr.success(`ERP codes: ${result.updated} set, ${result.cleared} cleared, ${result.notFound} unknown SKU(s)`);
        this.loadProducts(this.searchQuery);
      },
      error: (err) => {
        this.erpImporting = false;
        this.erpImportError = apiErrorMessage(err, 'Could not apply the ERP codes.');
      }
    });
  }

  // ---------------------------------------------------------------------
  // Cost prices: paste `sku,cost` lines -> preview -> PUT /admin/inventory/cost-prices
  // ---------------------------------------------------------------------

  costImportOpen = false;
  costImportText = '';
  costImportRows: CostPriceRow[] = [];
  costImportSkipped: string[] = [];
  costImportResult: CostPriceImportResult | null = null;
  costImportError: string | null = null;
  costImporting = false;

  openCostImport() {
    this.costImportOpen = true;
    this.erpImportOpen = false;
    this.costImportResult = null;
    this.costImportError = null;
  }

  closeCostImport() {
    this.costImportOpen = false;
  }

  /** Same parser as the ERP import; the second cell is a rupee amount (commas inside quotes and a leading ₹ are tolerated). */
  parseCostImport() {
    const rows: CostPriceRow[] = [];
    const skipped: string[] = [];
    const seen = new Map<string, number>();
    const lines = this.costImportText.split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const cells = line.split(/[,;\t]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      const sku = cells[0] ?? '';
      const costText = (cells[1] ?? '').replace(/[₹\s]/g, '');
      if (!sku) { skipped.push(`Line ${i + 1}: no SKU`); return; }
      if (i === 0 && sku.toLowerCase() === 'sku') return; // header row
      let cost: number | null = null;
      if (costText !== '') {
        cost = Number(costText);
        if (!isFinite(cost) || cost < 0) { skipped.push(`Line ${i + 1}: "${cells[1]}" is not a cost`); return; }
      }
      const key = sku.toLowerCase();
      if (seen.has(key)) {
        rows[seen.get(key)!] = { sku, costPrice: cost };
        skipped.push(`Line ${i + 1}: ${sku} repeated, later value kept`);
        return;
      }
      seen.set(key, rows.length);
      rows.push({ sku, costPrice: cost });
    });
    this.costImportRows = rows;
    this.costImportSkipped = skipped;
    this.costImportResult = null;
    this.costImportError = null;
  }

  get costImportClears(): number {
    return this.costImportRows.filter(r => r.costPrice === null).length;
  }

  applyCostImport() {
    if (this.costImportRows.length === 0 || this.costImporting) return;
    this.costImporting = true;
    this.costImportError = null;
    this.productService.importCostPrices(this.costImportRows).subscribe({
      next: (result) => {
        this.costImportResult = result;
        this.costImporting = false;
        this.toastr.success(`Cost prices: ${result.updated} set, ${result.cleared} cleared, ${result.notFound} unknown SKU(s)`);
        this.loadProducts(this.searchQuery);
      },
      error: (err) => {
        this.costImporting = false;
        this.costImportError = apiErrorMessage(err, 'Could not apply the cost prices.');
      }
    });
  }

  erpStatusClass(status: string): string {
    switch (status) {
      case 'UPDATED': return 'bg-emerald-100 text-emerald-800';
      case 'CLEARED': return 'bg-slate-100 text-slate-700';
      case 'UNCHANGED': return 'bg-gray-100 text-gray-600';
      case 'NOT_FOUND': return 'bg-red-100 text-red-700';
      default: return 'bg-amber-100 text-amber-800';
    }
  }
}
