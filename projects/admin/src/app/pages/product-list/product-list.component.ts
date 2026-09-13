import { environment } from '../../../environments/environment';
import { Component, inject, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { BrowserMultiFormatReader } from '@zxing/library';
import { QRCodeComponent } from 'angularx-qrcode';
import { ToastrService } from 'ngx-toastr';
import { extractSku, isLowStock, productQrUrl } from '../../core/labels';

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
}
