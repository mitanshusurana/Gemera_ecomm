import { Component, inject, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../services/product.service';

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

  ngOnInit() {
    this.loadProducts();
  }

  ngAfterViewInit() {
    // Focus search input automatically so a barcode scanner can type immediately
    setTimeout(() => this.searchInput?.nativeElement?.focus(), 100);
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
}
