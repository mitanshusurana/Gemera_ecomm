import { Component, inject, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import jsPDF from 'jspdf';
import * as QRCode from 'qrcode';
import { QRCodeComponent } from 'angularx-qrcode';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, QRCodeComponent],
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

  async printSelectedQRCodes() {
    this.printQueueObjects = this.productService.getPrintQueue();
    if (this.printQueueObjects.length === 0) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // A4 size is 210 x 297 mm
    // To fit 60 items, we can use 5 columns and 12 rows
    // 5 * 12 = 60 items per page
    const marginX = 10;
    const marginY = 10;
    const itemWidth = 38; // 190mm usable width / 5
    const itemHeight = 23; // 277mm usable height / 12
    const itemsPerRow = 5;
    const itemsPerCol = 12;
    const maxItemsPerPage = itemsPerRow * itemsPerCol;

    for (let i = 0; i < this.printQueueObjects.length; i++) {
      const product = this.printQueueObjects[i];
      if (i > 0 && i % maxItemsPerPage === 0) {
        doc.addPage();
      }

      const indexOnPage = i % maxItemsPerPage;
      const row = Math.floor(indexOnPage / itemsPerRow);
      const col = indexOnPage % itemsPerRow;

      const x = marginX + col * itemWidth;
      const y = marginY + row * itemHeight;

      // Draw border box for label
      doc.setDrawColor(200);
      doc.rect(x, y, itemWidth - 2, itemHeight - 2);

      // Generate QR Code data URL using local qrcode library
      if (product.sku) {
        try {
          const qrDataUrl = await QRCode.toDataURL(product.sku, {
            errorCorrectionLevel: 'M',
            margin: 0,
            width: 150
          });
          doc.addImage(qrDataUrl, 'PNG', x + 1, y + 1, 15, 15);
        } catch (err) {
          console.error('Failed to generate QR for sku:', product.sku, err);
          doc.setFontSize(6);
          doc.text('QR Error', x + 2, y + 5);
        }
      }

      // Add product details (SKU & Name)
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text(product.sku || 'N/A', x + 17, y + 5);

      doc.setFontSize(6);
      doc.setTextColor(50, 50, 50);
      const nameLines = doc.splitTextToSize(product.name || '', itemWidth - 19);
      doc.text(nameLines.slice(0, 3), x + 17, y + 8);
    }

    doc.save('product-qr-codes.pdf');
  }

  clearPrintQueue() {
    this.productService.clearPrintQueue();
    this.printQueueObjects = [];
  }
}
