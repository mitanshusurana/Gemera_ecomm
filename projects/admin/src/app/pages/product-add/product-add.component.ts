import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-product-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './product-add.component.html'
})
export class ProductAddComponent implements OnInit {
  constructor(private fb: FormBuilder, private productService: ProductService, private router: Router) {}

  categoriesList = [
    { id: '1', name: 'finished-jewelry', displayName: 'Finished Jewelry', value: 'Finished Jewelry' },
    { id: '2', name: 'loose-gemstones', displayName: 'Loose Gemstones', value: 'Loose Gemstone' },
    { id: '3', name: 'spiritual-idols', displayName: 'Religious Idols & Gemstone Carvings', value: 'Spiritual Idol' },
    { id: '4', name: 'rough-materials', displayName: 'Manufacturing & Rough Materials', value: 'Precious Metal' },
    { id: '5', name: 'components-materials', displayName: 'Components & Materials', value: 'Component' },
    { id: '6', name: 'bespoke-custom', displayName: 'Bespoke Custom', value: 'Custom' },
    { id: '7', name: 'ring-settings', displayName: 'Ring Settings', value: 'Ring Setting' }
  ];

  subCategoriesMap: { [key: string]: string[] } = {
    'Finished Jewelry': [
      'Rings (Engagement, Wedding, Cocktail, Signet, Eternity, Birthstone)',
      'Necklaces (Choker, Pendant, Statement, Chain, Lariat, Bar Necklace)',
      'Earrings (Studs, Hoops, Drops, Dangles, Jackets, Bali, Ear Cuffs)',
      'Bracelets (Bangles, Cuffs, Tennis, Beaded, Bolo, Bajuband)',
      'Pendants/Other (Brooches, Watches)'
    ],
    'Loose Gemstone': [
      'Diamonds',
      'Colored Gemstones',
      'Melee'
    ],
    'Spiritual Idol': [
      'Murtis (Ganesh, Krishna, Shiva, Lakshmi)'
    ],
    'Precious Metal': [
      'Rough Parcels',
      'Single Rough Crystals'
    ],
    'Component': [
      'Findings (Clasps, Hooks)',
      'Beads',
      'Silver Wire'
    ]
  };

  occasionsList = ['Engagement', 'Wedding', 'Anniversary', 'Daily Wear'];
  stylesList = ['Modern', 'Vintage', 'Classic Solitaire', 'Halo'];

  // --- Predefined Dropdown Options for Better UX ---
  metalTypes = ['Gold', 'Silver', 'Platinum', 'Palladium', 'Titanium'];
  metalPurities = ['24K', '22K', '18K', '14K', '10K', '925 Sterling', '950 Platinum'];
  metalColors = ['Yellow', 'White', 'Rose', 'Two-Tone', 'PVD Plating', 'Black Antique'];
  manufacturingTerms = ['Jadau', 'Kundan', 'Meenakari', 'Polki', 'Cast', 'Handmade'];

  shapes = ['Round', 'Princess', 'Cushion', 'Emerald', 'Oval', 'Radiant', 'Pear', 'Marquise', 'Asscher', 'Heart'];
  cuts = ['Faceted', 'Cabochon', 'Brilliant', 'Step Cut', 'Mixed Cut', 'Rose Cut'];
  clarities = ['Flawless (FL)', 'Internally Flawless (IF)', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3', 'Clean', 'Slight Inclusions', 'Heavy Inclusions', 'Opaque'];
  treatmentStatuses = ['None / Unheated', 'Heated', 'Beryllium Treated', 'Fracture Filled', 'Irradiated', 'Dyed'];
  polishOptions = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Abr (Abrasion)', 'Brn (Burn mark)'];
  symmetryOptions = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'T/oc (Table Off-Center)', 'OR (Out-of-Round)'];
  fluorescences = ['None', 'Faint', 'Medium', 'Strong', 'Very Strong'];
  girdles = ['Extremely Thin', 'Very Thin', 'Thin', 'Medium', 'Slightly Thick', 'Thick', 'Very Thick', 'Extremely Thick'];
  culets = ['None', 'Very Small', 'Small', 'Medium', 'Slightly Large', 'Large', 'Very Large'];

  carvingStyles = ['Intaglio', 'Cameo', 'Relief Carving', 'Hardstone Carving', 'Freeform'];
  carvingTechniques = ['Diamond-tipped', 'Laser engraving', 'Hand carved', 'Ultrasonic drilling'];

  manufacturingStages = ['Planning', 'Sawing', 'Bruting', 'Faceting', 'Polishing', 'Grading'];

  componentTypes = ['Findings', 'Clasps', 'Hooks', 'Jump Rings', 'Bails', 'Posts', 'Beads', 'Silver Wire'];
  beadStyles = ['Faceted', 'Round', 'Rondelle', 'Briolette', 'Tube', 'Chip'];

  productForm!: FormGroup;

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

  get availableSubCategories(): string[] {
    const category = this.selectedCategory;
    return category ? (this.subCategoriesMap[category] || []) : [];
  }

  ngOnInit() {
    this.productForm = this.fb.group({
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
      shape: [''],
      cut: [''],
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

    // Reset subCategory when category changes
    this.productForm.get('category')?.valueChanges.subscribe(() => {
      this.productForm.get('subCategory')?.setValue('');
    });
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
