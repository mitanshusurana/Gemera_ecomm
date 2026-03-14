import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormArray } from '@angular/forms';
import { Router } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

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

  categories = [
    { id: '1', name: 'engagement-rings', displayName: 'Engagement Rings', value: 'Engagement Ring' },
    { id: '2', name: 'loose-gemstones', displayName: 'Loose Gemstones', value: 'Loose Gemstone' },
    { id: '3', name: 'spiritual-idols', displayName: 'Spiritual Idols', value: 'Spiritual Idol' },
    { id: '4', name: 'gemstone-jewelry', displayName: 'Gemstone Jewelry', value: 'Gemstone Jewelry' },
    { id: '5', name: 'precious-metals', displayName: 'Precious Metals', value: 'Precious Metal' },
    { id: '6', name: 'bespoke-custom', displayName: 'Bespoke Custom', value: 'Custom' },
    { id: '7', name: 'ring-settings', displayName: 'Ring Settings', value: 'Ring Setting' }
  ];

  occasionsList = ['Engagement', 'Wedding', 'Anniversary', 'Daily Wear'];
  stylesList = ['Modern', 'Vintage', 'Classic Solitaire', 'Halo'];

  productForm = this.fb.group({
    name: ['', Validators.required],
    description: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    category: ['', Validators.required],
    occasions: this.fb.array([]),
    styles: this.fb.array([]),
    customizationOptions: this.fb.array([])
  });

  loading = false;
  errorMessage = '';
  selectedFiles: File[] = [];
  selectedVideoFile: File | null = null;

  get occasions() {
    return this.productForm.get('occasions') as FormArray;
  }

  get styles() {
    return this.productForm.get('styles') as FormArray;
  }

  get customizationOptions() {
    return this.productForm.get('customizationOptions') as FormArray;
  }

  onCheckboxChange(e: any, formArrayName: string) {
    const checkArray: FormArray = this.productForm.get(formArrayName) as FormArray;
    if (e.target.checked) {
      checkArray.push(this.fb.control(e.target.value));
    } else {
      let i: number = 0;
      checkArray.controls.forEach((item: any) => {
        if (item.value == e.target.value) {
          checkArray.removeAt(i);
          return;
        }
        i++;
      });
    }
  }

  addCustomizationOption() {
    this.customizationOptions.push(this.fb.group({
      type: ['', Validators.required],
      name: ['', Validators.required],
      priceModifier: [0, Validators.required]
    }));
  }

  removeCustomizationOption(index: number) {
    this.customizationOptions.removeAt(index);
  }

  onFileChange(event: any) {
    if (event.target.files.length > 0) {
      this.selectedFiles = Array.from(event.target.files);
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

    let uploadedImageUrls: string[] = [];
    let uploadedVideoUrl: string | undefined = undefined;

    const finalizeCreation = () => {
      this.createProductRecord(uploadedImageUrls, uploadedVideoUrl);
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

    if (this.selectedFiles.length > 0) {
      const uploadRequests = this.selectedFiles.map(file =>
        this.productService.uploadImage(file).pipe(
          catchError(err => {
            console.error('Failed to upload image', err);
            throw err;
          })
        )
      );

      forkJoin(uploadRequests).subscribe({
        next: (responses) => {
          uploadedImageUrls = responses.map(res => res.url);
          uploadVideo();
        },
        error: (err) => {
           this.errorMessage = 'Failed to upload images. Check your Cloudflare R2 configuration.';
           this.loading = false;
        }
      });
    } else {
      uploadVideo();
    }
  }

  private createProductRecord(uploadedImageUrls: string[], uploadedVideoUrl?: string) {
    const formValue = this.productForm.value;
    const productData = {
      ...formValue,
      images: uploadedImageUrls,
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
