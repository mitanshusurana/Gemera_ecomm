import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-product-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './product-add.component.html',
  styleUrl: './product-add.component.css'
})
export class ProductAddComponent {
  private fb = inject(FormBuilder);
  private productService = inject(ProductService);
  private router = inject(Router);

  productForm = this.fb.group({
    name: ['', Validators.required],
    description: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    category: ['', Validators.required],
    imageUrl: [''],
    videoUrl: ['']
  });

  loading = false;
  errorMessage = '';

  onSubmit() {
    if (this.productForm.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    const { imageUrl, ...rest } = this.productForm.value;
    const productData = {
      ...rest,
      images: imageUrl ? [imageUrl] : []
    };

    this.productService.createProduct(productData).subscribe({
      next: () => {
        this.router.navigate(['/products']);
      },
      error: (err) => {
        console.error('Failed to create product', err);
        this.errorMessage = 'Failed to create product.';
        this.loading = false;
      }
    });
  }
}
