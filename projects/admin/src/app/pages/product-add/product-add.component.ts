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
    category: ['', Validators.required]
  });

  loading = false;
  errorMessage = '';
  selectedFile: File | null = null;
  selectedVideoFile: File | null = null;

  onFileChange(event: any) {
    if (event.target.files.length > 0) {
      this.selectedFile = event.target.files[0];
    }
  }

  onVideoFileChange(event: any) {
    if (event.target.files.length > 0) {
      this.selectedVideoFile = event.target.files[0];
    }
  }

  onSubmit() {
    if (this.productForm.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    let uploadedImageUrl: string | undefined = undefined;
    let uploadedVideoUrl: string | undefined = undefined;

    const finalizeCreation = () => {
      this.createProductRecord(uploadedImageUrl, uploadedVideoUrl);
    };

    const uploadVideo = () => {
      if (this.selectedVideoFile) {
        this.productService.uploadImage(this.selectedVideoFile).subscribe({
          next: (res) => {
            uploadedVideoUrl = res.url;
            finalizeCreation();
          },
          error: (err) => {
            console.error('Failed to upload video', err);
            this.errorMessage = 'Failed to upload video.';
            this.loading = false;
          }
        });
      } else {
        finalizeCreation();
      }
    };

    if (this.selectedFile) {
      this.productService.uploadImage(this.selectedFile).subscribe({
        next: (res) => {
          uploadedImageUrl = res.url;
          uploadVideo();
        },
        error: (err) => {
          console.error('Failed to upload image', err);
          this.errorMessage = 'Failed to upload image. Check your Cloudflare R2 configuration.';
          this.loading = false;
        }
      });
    } else {
      uploadVideo();
    }
  }

  private createProductRecord(uploadedImageUrl?: string, uploadedVideoUrl?: string) {
    const formValue = this.productForm.value;
    const productData = {
      ...formValue,
      images: uploadedImageUrl ? [uploadedImageUrl] : [],
      videoUrl: uploadedVideoUrl || ''
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
