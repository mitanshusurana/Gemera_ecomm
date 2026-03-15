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
    { id: '1', name: 'finished-jewelry', displayName: 'Finished Jewelry', value: 'Finished Jewelry' },
    { id: '2', name: 'loose-gemstones', displayName: 'Loose Gemstones', value: 'Loose Gemstone' },
    { id: '3', name: 'religious-idols', displayName: 'Religious Idols & Carvings', value: 'Spiritual Idol' },
    { id: '4', name: 'manufacturing-rough', displayName: 'Manufacturing & Rough Materials', value: 'Rough Material' },
    { id: '5', name: 'components-materials', displayName: 'Components & Materials', value: 'Component' },
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
    subCategory: [''],
    sku: [''], // Auto-generated if empty

    // Global e-commerce / inventory ownership
    inventoryOwnership: ['Owned Stock'],
    seoQualifiersStr: [''], // Comma separated, we will parse before submit
    occasionKeywordsStr: [''], // Comma separated, we will parse before submit

    occasions: this.fb.array([]),
    styles: this.fb.array([]),
    customizationOptions: this.fb.array([]),

    // 1. Finished Jewelry
    metalType: [''],
    metalPurity: [''],
    grossWeight: [0],
    netWeight: [0],
    totalCaratWeight: [0],
    dimensions: [''],
    currentLocation: [''],
    huid: [''],
    bisHallmark: [false],
    hallmarkingDate: [''],
    designStyle: [''],
    metalColor: [''],
    manufacturingTerminology: [''],

    // 2. Loose Gemstones
    stoneSku: [''],
    variety: [''],
    shapeCut: [''],
    caratWeight: [0],
    colorHue: [''],
    colorTone: [''],
    colorSaturation: [''],
    clarity: [''],
    measurements: [''],
    treatmentStatus: [''],
    labReportNumber: [''],
    certificateImage: [''],
    polish: [''],
    symmetry: [''],
    fluorescence: [''],
    girdle: [''],
    culet: [''],
    tablePercentage: [0],
    depthPercentage: [0],
    originProvenance: [''],
    stockStatus: ['Real'],

    // 3. Religious Idols & Gemstone Carvings
    subjectDeityName: [''],
    gemstoneMaterial: [''],
    carvingStyle: [''],
    qualityDescription: [''],
    asana: [''],
    mudra: [''],
    ayudha: [''],
    vahana: [''],
    artistName: [''],
    historicalContext: [''],
    carvingTechnique: [''],

    // 4. Manufacturing & Rough Materials
    lotNumber: [''],
    mineOrigin: [''],
    roughMaterial: [''],
    roughWeight: [0],
    purchaseDate: [''],
    supplierCode: [''],
    acquisitionCost: [0],
    matrixParentRock: [''],
    crystalMorphology: [''],
    yieldEstimate: [0],
    wastageLog: [''],
    manufacturingStage: [''],

    // 5. Components & Materials
    componentType: [''],
    material: [''],
    purity: [''],
    quantityPcs: [0],
    weightPerPiece: [0],
    totalWeight: [0],
    reorderPointAlert: [0],
    beadStyle: [''],
    layoutPattern: [''],
    vendorInformation: [''],
    minOrderQuantity: [0]
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

  get selectedCategory() {
    return this.productForm.get('category')?.value;
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

    // Parse comma separated strings to arrays
    const seoQualifiers = formValue.seoQualifiersStr ? (formValue.seoQualifiersStr as string).split(',').map(s => s.trim()).filter(s => s) : [];
    const occasionKeywords = formValue.occasionKeywordsStr ? (formValue.occasionKeywordsStr as string).split(',').map(s => s.trim()).filter(s => s) : [];

    const productData = {
      ...formValue,
      seoQualifiers,
      occasionKeywords,
      images: uploadedImageUrls,
      videoUrl: uploadedVideoUrl || null,
      specifications: null
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
