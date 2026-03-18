import { Component, inject, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent implements OnInit, AfterViewInit {
  private productService = inject(ProductService);

  @ViewChild('searchInput') searchInput!: ElementRef;

  products: any[] = [];
  loading = true;
  searchQuery: string = '';
  searchTimeout: any;

  // Bulk Print Queue full objects (resolved from IDs before printing)
  printQueueObjects: any[] = [];
  get printQueueCount() {
    return this.productService.getPrintQueue().length;
  }

  // QR Scanner logic
  isScannerOpen = false;
  codeReader = new BrowserMultiFormatReader();
  @ViewChild('scannerVideo') scannerVideo!: ElementRef<HTMLVideoElement>;

  ngOnInit() {
    this.loadProducts();
  }

  ngOnDestroy() {
    this.stopScanner();
  }

  ngAfterViewInit() {
    // Focus search input automatically so a barcode scanner can type immediately
    setTimeout(() => this.searchInput?.nativeElement?.focus(), 100);
  }

  toggleScanner() {
    this.isScannerOpen = !this.isScannerOpen;
    if (this.isScannerOpen) {
      this.startScanner();
    } else {
      this.stopScanner();
    }
  }

  startScanner() {
    setTimeout(() => {
      if (this.scannerVideo && this.scannerVideo.nativeElement) {
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

              this.codeReader.decodeFromVideoDevice(selectedDeviceId, this.scannerVideo.nativeElement, (result, err) => {
                if (result) {
                  // We got a successful scan
                  this.searchQuery = result.getText();
                  this.stopScanner();
                  this.isScannerOpen = false;
                  this.loadProducts(this.searchQuery);
                }
              }).catch(console.error);
            } else {
              alert('No camera devices found.');
              this.isScannerOpen = false;
            }
          })
          .catch((err) => {
            console.error('Error accessing camera devices:', err);
            alert('Could not access the camera. Please ensure permissions are granted.');
            this.isScannerOpen = false;
          });
      }
    }, 100);
  }

  stopScanner() {
    this.codeReader.reset();
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
    this.loading = true;
    this.productService.getProducts(search).subscribe({
      next: (data) => {
        this.products = data.content;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load products', err);
        this.loading = false;
      }
    });
  }

  deleteProduct(id: string) {
    if (confirm('Are you sure you want to delete this product?')) {
      this.productService.deleteProduct(id).subscribe({
        next: () => {
          this.loadProducts();
        },
        error: (err) => {
          console.error('Failed to delete product', err);
          alert('Failed to delete product');
        }
      });
    }
  }

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

  printSelectedQRCodes() {
    this.printQueueObjects = this.productService.getPrintQueue();
    if (this.printQueueObjects.length === 0) return;

    // In many browsers, just calling window.print() will use our @media print CSS rules to format the page correctly
    setTimeout(() => {
        window.print();
    }, 100);
  }

  clearPrintQueue() {
    this.productService.clearPrintQueue();
    this.printQueueObjects = [];
  }
}
