import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../services/product.service';
import { Product } from '../../core/models';

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-900">Products</h1>
      <button class="btn-primary">
        + Add Product
      </button>
    </div>

    <div class="card p-6">
      <div class="mb-4 flex gap-4">
        <input type="text" placeholder="Search products..." class="input-field max-w-sm">
        <select class="input-field max-w-xs">
          <option>All Categories</option>
          <option>Rings</option>
          <option>Necklaces</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Product</th>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Category</th>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Price</th>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Stock</th>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr *ngFor="let product of products()" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                    <img *ngIf="product.imageUrl" [src]="product.imageUrl" class="w-full h-full object-cover">
                  </div>
                  <span class="font-medium text-gray-900">{{ product.name }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ product.category }}</td>
              <td class="px-4 py-3 font-semibold">{{ formatPrice(product.price) }}</td>
              <td class="px-4 py-3">
                <span [class]="getStockClass(product.stock)" class="px-2 py-1 rounded-full text-xs font-semibold">
                  {{ product.stock }} in stock
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <button class="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                <button class="text-red-600 hover:text-red-800">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination (Mock) -->
      <div class="flex justify-between items-center mt-4 text-sm text-gray-600">
        <span>Showing 1-10 of 50 products</span>
        <div class="flex gap-2">
          <button class="px-3 py-1 border rounded hover:bg-gray-50">Previous</button>
          <button class="px-3 py-1 border rounded hover:bg-gray-50">Next</button>
        </div>
      </div>
    </div>
  `
})
export class AdminProductListComponent implements OnInit {
  private productService = inject(ProductService);
  products = signal<Product[]>([]);

  ngOnInit() {
    this.productService.getProducts(0, 10).subscribe(res => {
      this.products.set(res.content);
    });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(price);
  }

  getStockClass(stock: number): string {
    if (stock <= 5) return 'bg-red-100 text-red-800';
    if (stock <= 20) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }
}
