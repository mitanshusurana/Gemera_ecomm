import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { Router, ActivatedRoute } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { OCCASIONS_LIST, STYLES_LIST, ProductCategory } from '../../core/constants';

@Component({
  selector: 'app-product-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './product-add.component.html'
})
export class ProductAddComponent implements OnInit {
  productId: string | null = null;
  isEditMode = false;

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  categoriesList: any[] = [];
  subCategoriesMap: any = {};
  occasionsList = OCCASIONS_LIST;
  stylesList = STYLES_LIST;

  // --- Predefined Dropdown Options for Better UX ---
  metalTypes = ['Gold', 'Silver', 'Platinum', 'Palladium', 'Titanium'];
  metalPurities = ['24K', '22K', '18K', '14K', '10K', '925 Sterling', '950 Platinum'];
  metalColors = ['Yellow', 'White', 'Rose', 'Two-Tone', 'PVD Plating', 'Black Antique'];
  manufacturingTerms = ['Jadau', 'Kundan', 'Meenakari', 'Polki', 'Cast', 'Handmade'];

  species = ['Beryl', 'Corundum', 'Diamond', 'Tourmaline', 'Garnet', 'Spinel', 'Quartz', 'Topaz', 'Zircon', 'Chrysoberyl', 'Opal', 'Jadeite'];
  varieties = ['Emerald', 'Ruby', 'Sapphire', 'Aquamarine', 'Morganite', 'Padparadscha', 'Tsavorite', 'Demantoid', 'Paraiba Tourmaline', 'Rubellite', 'Amethyst', 'Citrine', 'Tanzanite', 'Alexandrite'];
  shapes = ['Round', 'Oval', 'Cushion', 'Pear', 'Emerald Shape', 'Radiant', 'Princess', 'Asscher', 'Marquise', 'Heart', 'Trillion', 'Baguette', 'Kite', 'Hexagon', 'Freeform'];
  cuts = ['Brilliant Cut', 'Step Cut', 'Mixed Cut', 'Cabochon', 'Sugarloaf', 'Rose Cut', 'Briolette', 'Fantasy Cut', 'Buff Top'];
  colorIntensities = ['Vivid', 'Intense', 'Deep', 'Medium', 'Light', 'Faint'];
  colorTradeTerms = ['Pigeon’s Blood', 'Royal Blue', 'Cornflower Blue', 'Muzo Green', 'Jedi Spinel', 'Padparadscha', 'Canary Yellow', 'None'];
  origins = ['Zambia', 'Colombia', 'Brazil', 'Ethiopia', 'Ceylon (Sri Lanka)', 'Burma (Myanmar)', 'Madagascar', 'Tanzania', 'Mozambique', 'Afghanistan', 'Pakistan', 'Kenya', 'Nigeria', 'Tajikistan', 'Russia', 'Australia', 'Unknown'];
  clarities = ['Flawless (FL)', 'Internally Flawless (IF)', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3', 'Eye Clean', 'Included', 'Opaque'];
  treatmentStatuses = [
    'None (No Indications of Enhancement)',
    'F1 (Minor Clarity Enhancement)',
    'F2 (Moderate Clarity Enhancement)',
    'F3 (Significant Clarity Enhancement)',
    'CE(O) (Clarity Enhanced with Oil)',
    'H (Heated)',
    'H(a) (Heated - Minor Residue)',
    'H(b) (Heated - Moderate Residue)',
    'H(c) (Heated - Significant Residue)',
    'TE (Thermal Enhancement)',
    'Irradiated',
    'Dyed',
    'Diffusion Treated'
  ];
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

  get stoneDetails(): FormArray {
    return this.productForm.get('stoneDetails') as FormArray;
  }
  errorMessage = '';
  selectedFiles: File[] = [];
  selectedVideoFile: File | null = null;

  existingImages: string[] = [];
  existingVideoUrl: string | null = null;

  // Background Upload States
  uploadingMedia = false;
  uploadProgressMessage = '';

  // Auto-generation flags
  isNameManuallyEdited = false;
  isDescriptionManuallyEdited = false;

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

  get availableSubCategories(): any[] {
    const categoryName = this.selectedCategory;
    if (!categoryName) return [];
    const category = this.categoriesList.find((c: any) => c.name === categoryName);
    return category && category.subcategories ? category.subcategories : [];
  }

  get availableChildCategories(): any[] {
     const subCategoryName = this.productForm.get('subCategory')?.value;
     if (!subCategoryName) return [];
     const subCategory = this.availableSubCategories.find((c: any) => c.name === subCategoryName);
     return subCategory && subCategory.subcategories ? subCategory.subcategories : [];
  }

  ngOnInit() {
    this.productService.getCategories().subscribe((res: any) => {
      this.categoriesList = res.categories;
    });

    this.productId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.productId;

    this.productForm = this.fb.group({
      name: ['', Validators.required],
      description: ['', Validators.required],
      price: [null, [Validators.required, Validators.min(0)]],
      stock: [null, [Validators.required, Validators.min(0)]],
      category: ['', Validators.required],
      subCategory: [''],
      sku: [''], // Auto-generated if empty
      isVerified: [false], // Admin verification step

      // Global e-commerce / inventory ownership
      inventoryOwnership: ['Owned Stock'],
      seoQualifiersStr: [''], // Comma separated, we will parse before submit
      occasionKeywordsStr: [''], // Comma separated, we will parse before submit

      occasions: this.fb.array([]),
      styles: this.fb.array([]),
      customizationOptions: this.fb.array([]),

      // 1. Finished Jewelry
      grossWeight: [null],
      totalCaratWeight: [null],
      dimensions: [''],
      currentLocation: [''],
      huid: [''],
      bisHallmark: [false],
      hallmarkingDate: [''],
      designStyle: [''],
      metalColor: [''],
      manufacturingTerminology: [''],
      metalDetails: this.fb.group({
        metalType: [''],
        metalPurity: [''],
        netWeight: [null]
      }),
      stoneDetails: this.fb.array([]),
      stoneDetailIds: [''], // Legacy

      // 2. Loose Gemstones
      stoneSku: [''],
      species: [''],
      variety: [''],
      shape: [''],
      cut: [''],
      caratWeight: [null],
      colorHue: [''],
      colorTone: [''],
      colorSaturation: [''],
      colorTradeTerm: [''],
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
      tablePercentage: [null],
      depthPercentage: [null],
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
      roughWeight: [null],
      purchaseDate: [''],
      supplierCode: [''],
      acquisitionCost: [null],
      matrixParentRock: [''],
      crystalMorphology: [''],
      yieldEstimate: [null],
      wastageLog: [''],
      manufacturingStage: [''],

      // 5. Components & Materials
      componentType: [''],
      material: [''],
      purity: [''],
      quantityPcs: [null],
      weightPerPiece: [null],
      totalWeight: [null],
      reorderPointAlert: [null],
      beadStyle: [''],
      layoutPattern: [''],
      vendorInformation: [''],
      minOrderQuantity: [null],

      priceBreakup: this.fb.group({
        metal: [null],
        gemstone: [null],
        makingCharges: [null],
        tax: [null],
        total: [null],
        discount: [null],
        grandTotal: [null]
      })
    });

    // Reset subCategory when category changes
    this.productForm.get('category')?.valueChanges.subscribe(() => {
      this.productForm.get('subCategory')?.setValue('');
    });

    // Auto-select variety based on subCategory for Loose Gemstones
    this.productForm.get('subCategory')?.valueChanges.subscribe((subCategoryVal) => {
      if (this.selectedCategory === 'Gemstones' && subCategoryVal) {
        if (this.varieties.includes(subCategoryVal)) {
          this.productForm.get('variety')?.setValue(subCategoryVal);
        }
      }
      this.generateNameAndDescription();
    });

    // Auto-generate triggers
    ['caratWeight', 'cut', 'colorHue', 'colorTradeTerm', 'variety'].forEach(field => {
      this.productForm.get(field)?.valueChanges.subscribe(() => {
        this.generateNameAndDescription();
      });
    });

    if (this.isEditMode && this.productId) {
      this.loading = true;
      this.productService.getProduct(this.productId).subscribe({
        next: (product) => {
          this.patchProductForm(product);
          this.loading = false;
        },
        error: (err) => {
          console.error('Error fetching product for edit', err);
          this.errorMessage = 'Failed to load product details for editing.';
          this.loading = false;
        }
      });
    }
  }

  patchProductForm(product: any) {
    // Media
    this.existingImages = product.images || [];
    this.existingVideoUrl = product.videoUrl || null;

    // Basic fields
    this.productForm.patchValue({
      name: product.name || '',
      description: product.description || '',
      price: product.price ?? null,
      stock: product.stock ?? null,
      category: product.category || '',
      subCategory: product.subCategory || '',
      sku: product.sku || '',
      isVerified: product.isVerified || false,
      inventoryOwnership: product.inventoryOwnership || 'Owned Stock',
      seoQualifiersStr: product.seoQualifiers ? product.seoQualifiers.join(', ') : '',
      occasionKeywordsStr: product.occasionKeywords ? product.occasionKeywords.join(', ') : '',

      // Category Specific (Will just patch everything, non-matching fields are ignored safely if not in UI or just kept in memory)
      grossWeight: product.grossWeight ?? null,
      totalCaratWeight: product.totalCaratWeight ?? null,
      dimensions: product.dimensions || '',
      currentLocation: product.currentLocation || '',
      huid: product.huid || '',
      bisHallmark: product.bisHallmark || false,
      hallmarkingDate: product.hallmarkingDate || '',
      designStyle: product.designStyle || '',
      metalColor: product.metalColor || '',
      manufacturingTerminology: product.manufacturingTerminology || '',
      stoneDetailIds: product.stoneDetailIds ? product.stoneDetailIds.join(', ') : '',

      metalDetails: product.metalDetails ? {
        metalType: product.metalDetails.metalType || '',
        metalPurity: product.metalDetails.metalPurity || '',
        netWeight: product.metalDetails.netWeight ?? null
      } : { metalType: '', metalPurity: '', netWeight: null },

      stoneSku: product.stoneSku || '',
      species: product.species || '',
      variety: product.variety || '',
      shape: product.shape || '',
      cut: product.cut || '',
      caratWeight: product.caratWeight ?? null,
      colorHue: product.colorHue || '',
      colorTone: product.colorTone || '',
      colorSaturation: product.colorSaturation || '',
      colorTradeTerm: product.colorTradeTerm || '',
      clarity: product.clarity || '',
      measurements: product.measurements || '',
      treatmentStatus: product.treatmentStatus || '',
      labReportNumber: product.labReportNumber || '',
      certificateImage: product.certificateImage || '',
      polish: product.polish || '',
      symmetry: product.symmetry || '',
      fluorescence: product.fluorescence || '',
      girdle: product.girdle || '',
      culet: product.culet || '',
      tablePercentage: product.tablePercentage ?? null,
      depthPercentage: product.depthPercentage ?? null,
      originProvenance: product.originProvenance || '',
      stockStatus: product.stockStatus || 'Real',

      subjectDeityName: product.subjectDeityName || '',
      gemstoneMaterial: product.gemstoneMaterial || '',
      carvingStyle: product.carvingStyle || '',
      qualityDescription: product.qualityDescription || '',
      asana: product.asana || '',
      mudra: product.mudra || '',
      ayudha: product.ayudha || '',
      vahana: product.vahana || '',
      artistName: product.artistName || '',
      historicalContext: product.historicalContext || '',
      carvingTechnique: product.carvingTechnique || '',

      lotNumber: product.lotNumber || '',
      mineOrigin: product.mineOrigin || '',
      roughMaterial: product.roughMaterial || '',
      roughWeight: product.roughWeight ?? null,
      purchaseDate: product.purchaseDate || '',
      supplierCode: product.supplierCode || '',
      acquisitionCost: product.acquisitionCost ?? null,
      matrixParentRock: product.matrixParentRock || '',
      crystalMorphology: product.crystalMorphology || '',
      yieldEstimate: product.yieldEstimate ?? null,
      wastageLog: product.wastageLog || '',
      manufacturingStage: product.manufacturingStage || '',

      componentType: product.componentType || '',
      material: product.material || '',
      purity: product.purity || '',
      quantityPcs: product.quantityPcs ?? null,
      weightPerPiece: product.weightPerPiece ?? null,
      totalWeight: product.totalWeight ?? null,
      reorderPointAlert: product.reorderPointAlert ?? null,
      beadStyle: product.beadStyle || '',
      layoutPattern: product.layoutPattern || '',
      vendorInformation: product.vendorInformation || '',
      minOrderQuantity: product.minOrderQuantity ?? null
    });

    if (product.priceBreakup) {
      this.productForm.patchValue({
        priceBreakup: product.priceBreakup
      });
    }

    if (product.customizationOptions) {
      product.customizationOptions.forEach((opt: any) => {
        this.customizationOptions.push(this.fb.group({
          type: [opt.type, Validators.required],
          name: [opt.name, Validators.required],
          priceModifier: [opt.priceModifier, Validators.required]
        }));
      });
    }

    if (product.stoneDetails) {
      product.stoneDetails.forEach((stone: any) => {
        this.addStoneDetail(stone);
      });
    }

    if (product.occasions) {
      product.occasions.forEach((occ: string) => {
        this.occasions.push(this.fb.control(occ));
      });
    }

    if (product.styles) {
      product.styles.forEach((style: string) => {
        this.styles.push(this.fb.control(style));
      });
    }
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
      priceModifier: [null, Validators.required]
    }));
  }

  removeCustomizationOption(index: number) {
    this.customizationOptions.removeAt(index);
  }

  addStoneDetail(stone?: any) {
    const stoneGroup = this.fb.group({
      stoneType: [stone ? stone.stoneType : ''],
      shape: [stone ? stone.shape : ''],
      pieceCount: [stone ? stone.pieceCount : null],
      totalCaratWeight: [stone ? stone.totalCaratWeight : null],
      settingType: [stone ? stone.settingType : '']
    });
    this.stoneDetails.push(stoneGroup);
  }

  removeStoneDetail(index: number) {
    this.stoneDetails.removeAt(index);
  }

  markNameAsEdited() {
    this.isNameManuallyEdited = true;
  }

  markDescriptionAsEdited() {
    this.isDescriptionManuallyEdited = true;
  }

  generateNameAndDescription() {
    if (this.selectedCategory !== 'Gemstones') return;

    const v = this.productForm.value;
    const carat = v.caratWeight ? `${v.caratWeight} ct` : '';
    const cut = v.cut || '';
    const color = v.colorTradeTerm && v.colorTradeTerm !== 'None' ? v.colorTradeTerm : v.colorHue || '';
    const variety = v.variety || v.subCategory || '';

    // E.g. "1.5 ct Brilliant Cut Royal Blue Sapphire"
    const parts = [carat, cut, color, variety].filter(p => p.trim() !== '');
    const generatedName = parts.join(' ');

    const generatedDesc = `This is a beautiful ${generatedName}. Perfect for custom jewelry designs or as an investment piece.`;

    if (!this.isNameManuallyEdited && generatedName) {
      this.productForm.get('name')?.setValue(generatedName, { emitEvent: false });
    }

    if (!this.isDescriptionManuallyEdited && generatedName) {
      this.productForm.get('description')?.setValue(generatedDesc, { emitEvent: false });
    }
  }

  onFileChange(event: any) {
    if (event.target.files.length > 0) {
      this.selectedFiles = Array.from(event.target.files);
      this.uploadImages();
    }
  }

  onVideoFileChange(event: any) {
    if (event.target.files.length > 0) {
      this.selectedVideoFile = event.target.files[0];
      this.uploadVideo();
    }
  }

  uploadImages() {
    const uploadRequests = [];

    this.uploadingMedia = true;
    this.uploadProgressMessage = 'Uploading images...';
    this.errorMessage = '';

    const currentFilesCount = this.selectedFiles.length;

    if (currentFilesCount > 0) {
      uploadRequests.push(...this.selectedFiles.map(file =>
        this.productService.uploadImage(file).pipe(
          catchError(err => {
            console.error('Failed to upload image', err);
            throw err;
          })
        )
      ));

      // Clear selected files after queueing to prevent re-upload on subsequent actions
      this.selectedFiles = [];
    }

    if (uploadRequests.length > 0) {
      forkJoin(uploadRequests).subscribe({
        next: (responses) => {
          if (responses.length > 0) {
            const newUrls = responses.map(res => res.url);
            this.existingImages = [...this.existingImages, ...newUrls];
          }

          this.uploadingMedia = false;
          this.uploadProgressMessage = 'Image upload complete.';
        },
        error: (err) => {
          this.errorMessage = 'Failed to upload one or more image files.';
          this.uploadingMedia = false;
          this.uploadProgressMessage = '';
        }
      });
    } else {
      this.uploadingMedia = false;
      this.uploadProgressMessage = '';
    }
  }

  uploadVideo() {
    this.uploadingMedia = true;
    this.uploadProgressMessage = 'Uploading video...';
    this.errorMessage = '';

    if (this.selectedVideoFile) {
      this.productService.uploadVideo(this.selectedVideoFile).pipe(
        catchError(err => {
          console.error('Failed to upload video', err);
          throw err;
        })
      ).subscribe({
        next: (response) => {
          if (response) {
            this.existingVideoUrl = response.url;
          }
          this.selectedVideoFile = null;

          this.uploadingMedia = false;
          this.uploadProgressMessage = 'Video upload complete.';
        },
        error: (err) => {
          this.errorMessage = 'Failed to upload video.';
          this.uploadingMedia = false;
          this.uploadProgressMessage = '';
          this.selectedVideoFile = null;
        }
      });
    } else {
      this.uploadingMedia = false;
      this.uploadProgressMessage = '';
    }
  }

  removeExistingImage(index: number) {
    this.existingImages.splice(index, 1);
  }

  removeExistingVideo() {
    this.existingVideoUrl = null;
  }

  onSubmit() {
    if (this.productForm.invalid || this.uploadingMedia) return;

    this.loading = true;
    this.errorMessage = '';

    this.createProductRecord();
  }

  private createProductRecord() {
    const formValue = this.productForm.value;

    // Parse comma separated strings to arrays
    const seoQualifiers = formValue.seoQualifiersStr ? (formValue.seoQualifiersStr as string).split(',').map(s => s.trim()).filter(s => s) : [];
    const occasionKeywords = formValue.occasionKeywordsStr ? (formValue.occasionKeywordsStr as string).split(',').map(s => s.trim()).filter(s => s) : [];
    const stoneDetailIds = formValue.stoneDetailIds ? (formValue.stoneDetailIds as string).split(',').map(s => s.trim()).filter(s => s) : [];

    const productData = {
      ...formValue,
      seoQualifiers,
      occasionKeywords,
      stoneDetailIds,
      images: this.existingImages,
      videoUrl: this.existingVideoUrl,
      specifications: null
    };

    if (this.isEditMode && this.productId) {
      this.productService.updateProduct(this.productId, productData).subscribe({
        next: () => {
          this.router.navigate(['/products']);
        },
        error: (err) => {
          console.error('Failed to update product', err);
          this.errorMessage = 'Failed to update product.';
          this.loading = false;
        }
      });
    } else {
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
}
