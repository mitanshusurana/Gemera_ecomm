import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, FormArray, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, Subject } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { StockService, ProductStockLocations, apiErrorMessage } from '../../services/stock.service';
import {
  BOARD_PURITIES,
  MakingChargeType,
  MetalCode,
  MetalPurity,
  MetalRateService,
  PriceBreakdown,
  PricePreviewRequest,
  PricingMode,
  rateLabel
} from '../../services/metal-rate.service';
import {
  ALLOWED_SALE_MODES,
  CRAFTS,
  DYNAMIC_REQUIRED_PATHS,
  FlatCategory,
  FormSection,
  GEM_GRADES,
  ITEM_TYPE_LABEL,
  ItemType,
  QuantityField,
  REQUIRED_RULES,
  SALE_MODE_LABEL,
  SaleMode,
  UNIT_PRICE_SUFFIX,
  ancestry,
  averagePieceWeight,
  buildAutoDescription,
  buildAutoName,
  defaultGemGrade,
  defaultSaleMode,
  derivePrice,
  flattenCategoryTree,
  indexById,
  isIdolBranch,
  missingRequired,
  quantityFieldFor,
  resolveItemType,
  sectionsFor
} from '../../core/item-types';

@Component({
  selector: 'app-product-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './product-add.component.html'
})
export class ProductAddComponent implements OnInit {
  productId: string | null = null;
  isEditMode = false;

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private stockService: StockService,
    private metalRateService: MetalRateService
  ) {}

  // ---- Pricing from the daily metal rate (metal-prices contract) ----

  /** Board purities the pricing section offers, grouped by metal in the select. */
  readonly pricingPurities = BOARD_PURITIES;
  readonly pricingMetals: Array<{ value: MetalCode; label: string }> = [
    { value: 'GOLD', label: 'Gold' },
    { value: 'SILVER', label: 'Silver' },
    { value: 'PLATINUM', label: 'Platinum' },
  ];
  readonly makingChargeTypes: Array<{ value: MakingChargeType; label: string; suffix: string }> = [
    { value: 'PER_GRAM', label: 'Per gram', suffix: '₹/g' },
    { value: 'PERCENT', label: '% of metal value', suffix: '%' },
    { value: 'FIXED', label: 'Fixed amount', suffix: '₹' },
  ];
  /** Controls whose change re-runs the price preview. */
  private readonly pricingPaths = ['pricingMetal', 'pricingPurity', 'pricingNetWeightGrams', 'makingChargeType', 'makingChargeValue', 'wastagePct', 'stoneValue', 'otherCharges'];

  pricePreview: PriceBreakdown | null = null;
  previewLoading = false;
  previewError: string | null = null;
  private previewRequests = new Subject<PricePreviewRequest | null>();

  get pricingMode(): PricingMode {
    return (this.productForm?.get('pricingMode')?.value as PricingMode) || 'FIXED';
  }

  get isMetalRatePricing(): boolean {
    return this.pricingMode === 'METAL_RATE';
  }

  /** Metal-rate pricing is offered for finished jewellery sold per piece. */
  get showPricingModeToggle(): boolean {
    return this.isPerPiece && this.has('JEWELLERY_DETAILS');
  }

  get makingChargeSuffix(): string {
    const type = this.productForm?.get('makingChargeType')?.value as MakingChargeType;
    return this.makingChargeTypes.find(t => t.value === type)?.suffix ?? '₹';
  }

  purityChoicesFor(metal: MetalCode): MetalPurity[] {
    return this.pricingPurities.filter(p => p.metal === metal).map(p => p.purity);
  }

  purityLabel(metal: MetalCode, purity: MetalPurity): string {
    return rateLabel({ metal, purity });
  }

  /** Sum of stone rows' rate per carat x row carats; null when no row carries a rate. */
  get stoneRowsValue(): number | null {
    let any = false;
    let sum = 0;
    for (let i = 0; i < this.stoneDetails.length; i++) {
      const rate = Number(this.stoneDetails.at(i)?.get('ratePerCarat')?.value);
      const carats = this.stoneRowTotal(i);
      if (isFinite(rate) && rate > 0 && carats !== null) {
        any = true;
        sum += rate * carats;
      }
    }
    return any ? Math.round(sum) : null;
  }

  /** Maps the metal-details vocabulary ('22K', '925 Sterling', ...) onto the board's metal and purity. */
  private boardPurityFromMetalDetails(): { metal: MetalCode; purity: MetalPurity } | null {
    const md = this.productForm.get('metalDetails')?.value ?? {};
    const type = String(md.metalType ?? '').toLowerCase();
    const purityText = String(md.metalPurity ?? '').toUpperCase();
    const metal: MetalCode = /silver/.test(type) ? 'SILVER' : /platinum/.test(type) ? 'PLATINUM' : 'GOLD';
    const match = this.pricingPurities.find(p => p.metal === metal && purityText.startsWith(p.purity));
    if (match) return match;
    if (purityText) return null;
    return { metal, purity: metal === 'GOLD' ? '22K' : metal === 'SILVER' ? '925' : '950' };
  }

  /** Fills empty pricing fields from the metal and stone sections when the mode switches to METAL_RATE. */
  private prefillPricingFromDetails() {
    const form = this.productForm;
    const empty = (path: string) => {
      const v = form.get(path)?.value;
      return v === null || v === undefined || v === '';
    };
    const board = this.boardPurityFromMetalDetails();
    if (board && (empty('pricingPurity') || empty('pricingMetal'))) {
      form.patchValue({ pricingMetal: board.metal, pricingPurity: board.purity }, { emitEvent: false });
    }
    if (empty('pricingNetWeightGrams')) {
      const net = Number(form.get('metalDetails.netWeight')?.value);
      if (isFinite(net) && net > 0) form.get('pricingNetWeightGrams')?.setValue(net, { emitEvent: false });
    }
    if (empty('stoneValue')) {
      const stones = this.stoneRowsValue;
      if (stones !== null) form.get('stoneValue')?.setValue(stones, { emitEvent: false });
    }
    if (empty('makingChargeType')) form.get('makingChargeType')?.setValue('PER_GRAM', { emitEvent: false });
    if (empty('wastagePct')) form.get('wastagePct')?.setValue(0, { emitEvent: false });
  }

  private onPricingModeChanged() {
    if (this.isMetalRatePricing) {
      this.prefillPricingFromDetails();
      this.requestPreview();
    } else {
      this.pricePreview = null;
      this.previewError = null;
      this.previewLoading = false;
      this.previewRequests.next(null);
    }
  }

  /** Copy the metal section's weight / purity and the stone rows' value over the pricing fields. */
  copyPricingFromDetails() {
    const form = this.productForm;
    const board = this.boardPurityFromMetalDetails();
    const net = Number(form.get('metalDetails.netWeight')?.value);
    form.patchValue({
      ...(board ? { pricingMetal: board.metal, pricingPurity: board.purity } : {}),
      ...(isFinite(net) && net > 0 ? { pricingNetWeightGrams: net } : {}),
      ...(this.stoneRowsValue !== null ? { stoneValue: this.stoneRowsValue } : {}),
    }, { emitEvent: false });
    this.requestPreview();
  }

  /** The preview body when the metal-rate fields are complete enough to price; null otherwise. */
  private previewBody(): PricePreviewRequest | null {
    if (!this.isMetalRatePricing) return null;
    const v = this.productForm.getRawValue();
    const weight = Number(v.pricingNetWeightGrams);
    if (!v.pricingMetal || !v.pricingPurity || !isFinite(weight) || weight <= 0) return null;
    const num = (x: unknown) => {
      const n = Number(x);
      return isFinite(n) ? n : 0;
    };
    return {
      pricingMetal: v.pricingMetal,
      pricingPurity: v.pricingPurity,
      pricingNetWeightGrams: weight,
      makingChargeType: v.makingChargeType || 'PER_GRAM',
      makingChargeValue: num(v.makingChargeValue),
      wastagePct: num(v.wastagePct),
      stoneValue: num(v.stoneValue),
      otherCharges: num(v.otherCharges),
    };
  }

  requestPreview() {
    const body = this.previewBody();
    this.previewLoading = !!body;
    if (!body) {
      this.pricePreview = null;
      this.previewError = null;
    }
    this.previewRequests.next(body);
  }

  /** Debounced POST /admin/products/price-preview; the resulting price is written into the read-only price field. */
  private wirePricePreview() {
    this.previewRequests.pipe(
      debounceTime(400),
      switchMap((body) => {
        if (!body) return of({ body: null as PricePreviewRequest | null, result: null as PriceBreakdown | null, error: null as string | null });
        return this.metalRateService.pricePreview(body).pipe(
          switchMap((result) => of({ body, result, error: null as string | null })),
          catchError((err) => of({ body, result: null as PriceBreakdown | null, error: apiErrorMessage(err, 'Could not preview the price.') }))
        );
      })
    ).subscribe(({ body, result, error }) => {
      this.previewLoading = false;
      if (!body) return;
      this.previewError = error;
      this.pricePreview = result;
      if (result && isFinite(Number(result.price))) {
        this.productForm.get('price')?.setValue(Math.round(Number(result.price) * 100) / 100, { emitEvent: false });
      }
    });
  }

  /** Edit mode: read-only quantities per location from GET /admin/stock/products/{id}. */
  stockByLocation: ProductStockLocations | null = null;
  stockByLocationError: string | null = null;

  /** Root categories as returned by the backend (kept for compatibility). */
  categoriesList: any[] = [];
  /** Whole tree flattened depth-first, for the indented select and parent walking. */
  flatCategories: FlatCategory[] = [];
  private categoryById = new Map<string, FlatCategory>();

  // --- Predefined Dropdown Options for Better UX ---
  metalTypes = ['Gold', 'White Gold', 'Rose Gold', 'Platinum', 'Silver'];
  stoneTypes = ['Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Pearl', 'Other'];
  designStyles = ['Modern', 'Classic', 'Vintage', 'Minimalist', 'Statement'];
  metalPurities = ['24K', '22K', '18K', '14K', '10K', '925 Sterling', '950 Platinum'];
  metalColors = ['Yellow', 'White', 'Rose', 'Two-Tone', 'PVD Plating', 'Black Antique'];
  crafts = CRAFTS;
  gemGrades = GEM_GRADES;
  saleModeLabel = SALE_MODE_LABEL;
  unitPriceSuffix = UNIT_PRICE_SUFFIX;
  itemTypeLabel = ITEM_TYPE_LABEL;

  species = ['Beryl', 'Corundum', 'Diamond', 'Tourmaline', 'Garnet', 'Spinel', 'Quartz', 'Topaz', 'Zircon', 'Chrysoberyl', 'Opal', 'Jadeite'];
  varieties = ['Emerald', 'Ruby', 'Sapphire', 'Aquamarine', 'Morganite', 'Padparadscha', 'Tsavorite', 'Demantoid', 'Paraiba Tourmaline', 'Rubellite', 'Amethyst', 'Citrine', 'Tanzanite', 'Alexandrite'];
  shapes = ['Round', 'Oval', 'Cushion', 'Pear', 'Emerald Shape', 'Radiant', 'Princess', 'Asscher', 'Marquise', 'Heart', 'Trillion', 'Baguette', 'Kite', 'Hexagon', 'Freeform'];
  cuts = ['Brilliant Cut', 'Step Cut', 'Mixed Cut', 'Cabochon', 'Sugarloaf', 'Rose Cut', 'Briolette', 'Fantasy Cut', 'Buff Top'];
  colorIntensities = ['Vivid', 'Intense', 'Deep', 'Medium', 'Light', 'Faint'];
  colorTradeTerms = ['Pigeon’s Blood', 'Royal Blue', 'Cornflower Blue', 'Muzo Green', 'Jedi Spinel', 'Padparadscha', 'Canary Yellow', 'None'];
  origins = ['Zambia', 'Colombia', 'Brazil', 'Ethiopia', 'Ceylon (Sri Lanka)', 'Burma (Myanmar)', 'Madagascar', 'Tanzania', 'Mozambique', 'Afghanistan', 'Pakistan', 'Kenya', 'Nigeria', 'Tajikistan', 'Russia', 'Australia', 'Unknown'];
  clarities = ['Flawless (FL)', 'Internally Flawless (IF)', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3', 'Eye Clean', 'Included', 'Opaque'];
  polishes = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
  symmetries = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
  beadStyles = ['Round', 'Faceted', 'Tumble', 'Rondelle', 'Drop', 'Chips', 'Cylinder', 'Rudraksha', 'Baroque'];
  manufacturingStages = ['Rough', 'Preform', 'Cut', 'Polished', 'Ready for Setting'];
  componentTypes = ['Clasp', 'Lobster Clasp', 'Hook', 'Jump Ring', 'Wire', 'Loose Beads', 'Setting', 'Mounting', 'Chain by Length', 'Other'];

  /** OPERATIONS-CONTRACT §2: offered via datalist; any other lab name is accepted. */
  certificateLabs = ['GIA', 'IGI', 'GRS', 'SSEF', 'Gubelin', 'GII', 'IGL', 'Other'];

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

  productForm!: FormGroup;

  loading = false;

  get stoneDetails(): FormArray {
    return this.productForm.get('stoneDetails') as FormArray;
  }

  // ---- Cost price and margin (staff only; the API returns costPrice for products.write) ----

  /** (price - cost) / price x 100, or null until both are entered. */
  get marginPercent(): number | null {
    const price = Number(this.productForm?.get('price')?.value);
    const cost = Number(this.productForm?.get('costPrice')?.value);
    const costRaw = this.productForm?.get('costPrice')?.value;
    if (!price || price <= 0 || costRaw === null || costRaw === undefined || costRaw === '' || !isFinite(cost)) return null;
    return (price - cost) / price * 100;
  }

  get marginAmount(): number | null {
    const price = Number(this.productForm?.get('price')?.value);
    const cost = Number(this.productForm?.get('costPrice')?.value);
    return this.marginPercent === null ? null : price - cost;
  }

  // ---- Per-stone grading vocabularies ----
  readonly stoneClarities = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3', 'Eye clean', 'Included', 'Opaque'];
  readonly diamondColours = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Fancy'];
  readonly cutGrades = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
  readonly stonePositions = ['Centre', 'Halo', 'Side', 'Shank', 'Accent', 'Pave', 'Drop', 'Bezel'];
  readonly stoneTreatments = ['None', 'Heated', 'Unheated', 'Oiled (minor)', 'Oiled (moderate)', 'Oiled (significant)', 'Fracture filled', 'Irradiated', 'Diffusion', 'Lab grown', 'Other'];

  /** Diamonds get the D-Z colour scale; coloured stones a free-text colour. */
  isDiamondRow(index: number): boolean {
    const type = String(this.stoneDetails.at(index)?.get('stoneType')?.value ?? '');
    return /diamond|cvd|hpht|lab.?grown diamond/i.test(type);
  }

  /** Row total = caratWeight x pieceCount, falling back to the row's total field. */
  stoneRowTotal(index: number): number | null {
    const g = this.stoneDetails.at(index);
    const per = Number(g?.get('caratWeight')?.value);
    const pieces = Number(g?.get('pieceCount')?.value) || 1;
    const total = Number(g?.get('totalCaratWeight')?.value);
    if (g?.get('caratWeight')?.value !== null && g?.get('caratWeight')?.value !== '' && isFinite(per) && per > 0) return per * pieces;
    if (g?.get('totalCaratWeight')?.value !== null && g?.get('totalCaratWeight')?.value !== '' && isFinite(total) && total > 0) return total;
    return null;
  }

  get stoneRowsTotal(): number | null {
    let any = false;
    let sum = 0;
    for (let i = 0; i < this.stoneDetails.length; i++) {
      const t = this.stoneRowTotal(i);
      if (t !== null) { any = true; sum += t; }
    }
    return any ? sum : null;
  }

  /**
   * Mirrors ProductRulesService.stoneWeightWarning: the product's total carat
   * weight should match the stone rows within 0.05 ct. Warning only; never
   * blocks the save.
   */
  get stoneWeightWarning(): string | null {
    const totalRaw = this.productForm?.get('totalCaratWeight')?.value;
    const rows = this.stoneRowsTotal;
    if (totalRaw === null || totalRaw === undefined || totalRaw === '' || rows === null) return null;
    const total = Number(totalRaw);
    if (!isFinite(total)) return null;
    if (Math.abs(total - rows) <= 0.05) return null;
    return `Total stone weight ${total.toFixed(3)} ct differs from the stone rows (${rows.toFixed(3)} ct) by more than 0.05 ct.`;
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
  // The last values this component wrote, so a value that differs from them
  // is recognised as a manual edit even if the (input) handler has not fired.
  private lastAutoName = '';
  private lastAutoDescription = '';
  // True while an existing product is being loaded into the form, so that
  // valueChanges handlers do not treat the load as a user edit.
  isPatchingForm = false;

  /**
   * FINISH-CONTRACT §1: set once an existing product has been patched in, so
   * `syncItemType` can snapshot the rules it fails as loaded (before any edit).
   */
  private productLoaded = false;
  /** Labels the loaded product was missing for its item type; empty for new or complete products. */
  loadedMissingFields: string[] = [];

  // --- Item-type driven state ---
  itemType: ItemType | null = null;
  visibleSections: ReadonlySet<FormSection> = new Set();
  allowedSaleModes: ReadonlyArray<SaleMode> = ['PER_PIECE'];
  quantityField: QuantityField | null = null;
  /** Names the control blocking price derivation, if any. */
  derivedPriceProblem: string | null = null;

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

  /** Selected node from the flattened tree (any level). */
  get selectedCategoryObject(): FlatCategory | null {
    const categoryName = this.selectedCategory;
    if (!categoryName) return null;
    return this.flatCategories.find(c => c.name === categoryName || c.displayName === categoryName) ?? null;
  }

  get selectedCategoryChain(): FlatCategory[] {
    return ancestry(this.selectedCategoryObject, this.categoryById);
  }

  get isIdolsBranch(): boolean {
    return isIdolBranch(this.selectedCategoryChain);
  }

  get showJewelryFields(): boolean {
    return this.visibleSections.has('JEWELLERY_DETAILS');
  }

  get showGemstoneFields(): boolean {
    return this.visibleSections.has('LOOSE_GEMSTONE_DETAILS');
  }

  has(section: FormSection): boolean {
    return this.visibleSections.has(section);
  }

  get saleMode(): SaleMode {
    return (this.productForm?.get('saleMode')?.value as SaleMode) || 'PER_PIECE';
  }

  get isPerPiece(): boolean {
    return this.saleMode === 'PER_PIECE';
  }

  /** Loose beads are the one component whose size is a bead diameter. */
  get isBeadComponent(): boolean {
    const t = (this.productForm?.get('componentType')?.value ?? '') as string;
    return /bead/i.test(t);
  }

  get showStoneTable(): boolean {
    return this.itemType === 'SET' || (this.itemType === 'JEWELLERY' && this.productForm.get('plainOrStudded')?.value === 'STUDDED');
  }

  scrollToRequiredSummary() {
    document.getElementById('required-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Labels of required fields that are still empty; drives the summary above Save. */
  get missingFields(): string[] {
    if (!this.productForm) return [];
    return missingRequired(this.itemType, this.saleMode, this.productForm.getRawValue());
  }

  get availableSubCategories(): any[] {
    return this.selectedCategoryObject?.subcategories ?? [];
  }

  /** Non-breaking indentation for <option> text, which cannot be padded with CSS. */
  indent(level: number): string {
    return '    '.repeat(level) + (level > 0 ? '↳ ' : '');
  }

  ngOnInit() {
    this.http.get<{categories: any[]}>(environment.apiUrl + '/admin/categories').subscribe(res => {
      this.categoriesList = res.categories.map(c => ({
        ...c,
        value: c.name // Map backend name to 'value' used by UI dropdowns
      }));
      this.flatCategories = flattenCategoryTree(res.categories);
      this.categoryById = indexById(this.flatCategories);
      // The product may already be patched in; resolve its type now that the tree is known.
      this.syncItemType({ userInitiated: false });
    });

    this.productId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.productId;
    const duplicateId = this.route.snapshot.queryParamMap.get('duplicateId');

    this.productForm = this.fb.group({
      name: ['', Validators.required],
      description: ['', Validators.required],
      price: [null, [Validators.required, Validators.min(0)]],
      originalPrice: [null],
      // Landed cost per unit including making; margin is shown live beside the price.
      costPrice: [null, [Validators.min(0)]],
      stockQuantity: [1, [Validators.required, Validators.min(0)]],
      category: ['', Validators.required],
      subCategory: [''],
      sku: [''], // Auto-generated if empty
      erpMaterialCode: [''], // Code in the ERP item master; stored trimmed upper-case
      isVerified: [false], // Admin verification step
      featured: [false], // Shown in the storefront home page "featured" section
      returnable: [true], // Off for made-to-order and final-sale pieces (blocks a return request)
      videoUrl: [''],

      // Sale & pricing (contract §3)
      saleMode: ['PER_PIECE'],
      unitPrice: [null],

      // Pricing from the daily metal rate (metal-prices contract)
      pricingMode: ['FIXED'],
      pricingMetal: ['GOLD'],
      pricingPurity: [''],
      pricingNetWeightGrams: [null, [Validators.min(0)]],
      makingChargeType: ['PER_GRAM'],
      makingChargeValue: [null, [Validators.min(0)]],
      wastagePct: [null, [Validators.min(0), Validators.max(100)]],
      stoneValue: [null, [Validators.min(0)]],
      otherCharges: [null, [Validators.min(0)]],
      pieceCount: [null],
      lotTotalCaratWeight: [null],
      averagePieceWeight: [null], // derived, read-only
      sizeRange: [''],
      calibrated: [false],
      beadSizeMm: [null],
      strandLengthInches: [null],
      strandCount: [null],
      heightInches: [null],
      craft: [''],
      plainOrStudded: [''],
      gemGrade: [''],

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
      // HSN per line item is required on an Indian tax invoice (CGST Rule 46).
      // 7113 jewellery, 7103 gemstones, 7102 rough diamonds.
      hsnCode: ['', [Validators.pattern(/^[0-9]{4}([0-9]{2}([0-9]{2})?)?$/)]],
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

      colorIntensity: [''],
      tradeColorTerm: [''],
      origin: [''],
      certificateUrl: [''],

      colorTone: [''],
      colorSaturation: [''],
      colorTradeTerm: [''],
      clarity: [''],
      measurements: [''],
      treatmentStatus: ['None (No Indications of Enhancement)'],
      certificateLab: [''],
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
    }, { validators: [this.requiredRulesValidator] });

    // Category drives item type, sections, validators and defaults.
    this.productForm.get('category')?.valueChanges.subscribe(() => {
      if (!this.isPatchingForm) {
        this.productForm.get('subCategory')?.setValue('', { emitEvent: false });
      }
      this.syncItemType({ userInitiated: !this.isPatchingForm });
    });

    // Auto-select variety based on subCategory for loose gemstones
    this.productForm.get('subCategory')?.valueChanges.subscribe((subCategoryVal) => {
      if (this.isPatchingForm) return;
      if (this.itemType === 'LOOSE_GEMSTONE' && subCategoryVal) {
        const label = this.subCategoryLabel(subCategoryVal);
        const match = this.varieties.find(v => v === subCategoryVal || v === label || (label && label.startsWith(v)));
        if (match) {
          this.productForm.get('variety')?.setValue(match, { emitEvent: false });
        }
      }
    });

    this.productForm.get('saleMode')?.valueChanges.subscribe(() => {
      if (this.isPatchingForm) return;
      this.onSaleModeChanged();
    });

    // Metal-rate pricing: the mode switch prefills from the metal and stone
    // sections; every pricing edit re-runs the debounced server preview.
    this.wirePricePreview();
    this.productForm.get('pricingMode')?.valueChanges.subscribe(() => {
      if (this.isPatchingForm) return;
      this.onPricingModeChanged();
    });
    for (const path of this.pricingPaths) {
      this.productForm.get(path)?.valueChanges.subscribe(() => {
        if (this.isPatchingForm || !this.isMetalRatePricing) return;
        this.requestPreview();
      });
    }

    // Auto-calculate Price Breakup Total.
    //
    // This must never silently rewrite the product's selling price. Two guards:
    //   1. isPatchingForm - suppressed while an existing product is loaded into
    //      the form, otherwise patching a stored partial breakup recomputed a
    //      total of 0 and overwrote a real price with zero.
    //   2. hasAnyComponent - a breakup with no components entered carries no
    //      information, so it must not drive the price down to zero.
    this.productForm.get('priceBreakup')?.valueChanges.subscribe((breakup) => {
      if (this.isPatchingForm) { return; }

      const metal = parseFloat(breakup.metal) || 0;
      const gemstone = parseFloat(breakup.gemstone) || 0;
      const makingCharges = parseFloat(breakup.makingCharges) || 0;
      const tax = parseFloat(breakup.tax) || 0;
      const total = metal + gemstone + makingCharges + tax;

      const hasAnyComponent =
        [breakup.metal, breakup.gemstone, breakup.makingCharges, breakup.tax]
          .some(v => v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v)));

      if (parseFloat(breakup.total) !== total) {
        this.productForm.get('priceBreakup.total')?.setValue(total, { emitEvent: false });
      }

      // The breakup only drives the price when it is typed directly (PER_PIECE).
      if (hasAnyComponent && total > 0 && this.isPerPiece) {
        this.productForm.get('price')?.setValue(total, { emitEvent: false });
      }
    });

    // Every edit re-derives price / average weight and refreshes the auto name.
    // Derived values are written with emitEvent:false, so this does not loop.
    this.productForm.valueChanges.subscribe(() => {
      if (this.isPatchingForm) return;
      this.recomputeDerived();
      this.generateNameAndDescription();
    });

    if (this.isEditMode && this.productId) {
      this.loading = true;
      this.productService.getProduct(this.productId).subscribe({
        next: (product) => {
          this.patchProductForm(product);
          this.loading = false;
          this.loadStockByLocation();
        },
        error: (err) => {
          console.error('Error fetching product for edit', err);
          this.errorMessage = 'Failed to load product details for editing.';
          this.loading = false;
        }
      });
    } else if (duplicateId) {
      this.loading = true;
      this.productService.getProduct(duplicateId).subscribe({
        next: (product) => {
          // Clear ID for duplicate to ensure it creates a new product
          product.id = null;
          this.patchProductForm(product);
          // Modify name slightly to indicate it's a copy
          this.productForm.patchValue({
             name: product.name ? product.name + ' (Copy)' : '',
             sku: '', // Clear SKU so a new one is generated
             erpMaterialCode: '' // An ERP code identifies one item; the copy gets its own
          }, { emitEvent: false });
          this.loading = false;
        },
        error: (err) => {
          console.error('Error fetching product for duplicate', err);
          this.errorMessage = 'Failed to load product details for duplication.';
          this.loading = false;
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Item type, sections, validators
  // ---------------------------------------------------------------------------

  /** Group-level validator: any §4 rule still unmet makes the whole form invalid. */
  private requiredRulesValidator = (group: AbstractControl): ValidationErrors | null => {
    const missing = missingRequired(this.itemType, this.saleModeOf(group), (group as FormGroup).getRawValue());
    return missing.length ? { missingRequired: missing } : null;
  };

  private saleModeOf(group: AbstractControl): SaleMode {
    return (group.get('saleMode')?.value as SaleMode) || 'PER_PIECE';
  }

  /**
   * Resolve the item type from the selected category and bring sections,
   * allowed sale modes, validators and defaults in line with it.
   * `userInitiated` is false during patching and on the initial category load,
   * when stored values must not be overwritten by defaults.
   */
  private syncItemType(opts: { userInitiated: boolean }) {
    if (!this.productForm) return;
    const node = this.selectedCategoryObject;
    const previousType = this.itemType;
    this.itemType = resolveItemType(node, this.categoryById);
    this.visibleSections = sectionsFor(this.itemType);
    this.allowedSaleModes = this.itemType ? ALLOWED_SALE_MODES[this.itemType] : ['PER_PIECE'];

    const saleModeCtrl = this.productForm.get('saleMode');
    const current = saleModeCtrl?.value as SaleMode;
    if (!current || !this.allowedSaleModes.includes(current)) {
      saleModeCtrl?.setValue(defaultSaleMode(this.itemType), { emitEvent: false });
    }

    if (opts.userInitiated || (this.itemType && this.itemType !== previousType && !this.isEditMode)) {
      this.applyBranchDefaults();
    }

    this.applyDynamicValidators();
    this.recomputeDerived();
    if (opts.userInitiated) this.generateNameAndDescription();

    // Legacy products may fail rules added after they were saved. Snapshot the
    // list as loaded (whichever of product / categories arrived last) so the
    // form flags it immediately rather than waiting for a keystroke.
    if (!opts.userInitiated && this.productLoaded) {
      this.loadedMissingFields = this.missingFields;
      if (this.loadedMissingFields.length) {
        this.productForm.markAllAsTouched();
      }
    }
  }

  /** Defaults derived from the category branch, only filled when empty. */
  private applyBranchDefaults() {
    const chain = this.selectedCategoryChain;
    const gemGradeCtrl = this.productForm.get('gemGrade');
    if (gemGradeCtrl && !gemGradeCtrl.value &&
        (this.itemType === 'LOOSE_GEMSTONE' || this.itemType === 'GEMSTONE_LOT' || this.itemType === 'STRAND_BEADS')) {
      const grade = defaultGemGrade(chain);
      if (grade) gemGradeCtrl.setValue(grade, { emitEvent: false });
    }

    const plainCtrl = this.productForm.get('plainOrStudded');
    if (plainCtrl && this.itemType === 'JEWELLERY' && !plainCtrl.value) {
      const text = chain.map(c => `${c.displayName} ${c.name}`).join(' ').toLowerCase();
      const studded = /studded|diamond|polki|kundan|jadau|cvd/.test(text) || this.stoneDetails.length > 0;
      plainCtrl.setValue(studded ? 'STUDDED' : 'PLAIN', { emitEvent: false });
    }
  }

  private onSaleModeChanged() {
    if (this.isPerPiece) {
      // A stale unit price would make the server overwrite the typed price.
      this.productForm.get('unitPrice')?.setValue(null, { emitEvent: false });
    }
    this.applyDynamicValidators();
    this.recomputeDerived();
  }

  /**
   * Clear `required` on every dynamically-validated control, then re-apply it
   * for the current item type and sale mode (§4). Multi-field "either/or"
   * rules and the studded stone rule are enforced by requiredRulesValidator.
   */
  private applyDynamicValidators() {
    const form = this.productForm;
    const touched: AbstractControl[] = [];

    for (const path of DYNAMIC_REQUIRED_PATHS) {
      const ctrl = form.get(path);
      if (!ctrl) continue;
      ctrl.clearValidators();
      touched.push(ctrl);
    }

    const setRequired = (path: string, extra: any[] = []) => {
      const ctrl = form.get(path);
      if (!ctrl) return;
      ctrl.setValidators([Validators.required, ...extra]);
      if (!touched.includes(ctrl)) touched.push(ctrl);
    };

    if (this.itemType) {
      for (const rule of REQUIRED_RULES[this.itemType]) {
        if (rule.fields.length === 1 && rule.fields[0] !== 'stoneDetails' && !rule.when) {
          setRequired(rule.fields[0]);
        }
      }
    }

    const mode = this.saleMode;
    this.quantityField = quantityFieldFor(this.itemType, mode);
    if (mode !== 'PER_PIECE') {
      setRequired('unitPrice', [Validators.min(0)]);
      if (this.quantityField?.requiredForPrice) {
        setRequired(this.quantityField.path, [Validators.min(0)]);
      }
    }

    // Weight and count fields are never negative.
    for (const path of ['grossWeight', 'caratWeight', 'lotTotalCaratWeight', 'roughWeight', 'totalWeight']) {
      const ctrl = form.get(path);
      if (ctrl && !ctrl.validator) {
        ctrl.setValidators([Validators.min(0)]);
      }
    }

    for (const ctrl of touched) ctrl.updateValueAndValidity({ emitEvent: false });
    form.updateValueAndValidity({ emitEvent: false });
  }

  /** §4 derived price and average piece weight, written without emitting. */
  private recomputeDerived() {
    const form = this.productForm;
    const values = form.getRawValue();

    const avg = averagePieceWeight(values);
    const avgCtrl = form.get('averagePieceWeight');
    if (avgCtrl && avgCtrl.value !== avg) avgCtrl.setValue(avg, { emitEvent: false });

    const mode = this.saleMode;
    if (mode === 'PER_PIECE') {
      this.derivedPriceProblem = null;
    } else {
      const derived = derivePrice(mode, values);
      this.derivedPriceProblem = derived.missingField ?? null;
      const priceCtrl = form.get('price');
      if (priceCtrl && priceCtrl.value !== derived.price) {
        priceCtrl.setValue(derived.price, { emitEvent: false });
      }
    }
    form.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  }

  quantityUnitLabel(): string {
    const unit = this.quantityField?.unit;
    return unit === 'pieces' ? 'pcs' : (unit ?? '');
  }

  private subCategoryLabel(subCategoryName: string): string {
    const sub = this.availableSubCategories.find((s: any) => s.name === subCategoryName);
    return sub?.displayName ?? subCategoryName ?? '';
  }

  onNameInput() {
    this.isNameManuallyEdited = true;
  }

  onDescriptionInput() {
    this.isDescriptionManuallyEdited = true;
  }

  // ---------------------------------------------------------------------------
  // Loading an existing product
  // ---------------------------------------------------------------------------

  patchProductForm(product: any) {
    this.isPatchingForm = true;
    try {
      this.patchProductFormInner(product);
    } finally {
      this.isPatchingForm = false;
    }
    // A stored name/description is the owner's choice; never regenerate over it.
    this.isNameManuallyEdited = !!product.name;
    this.isDescriptionManuallyEdited = !!product.description;
    this.productLoaded = true;
    this.syncItemType({ userInitiated: false });
  }

  private patchProductFormInner(product: any) {
    // Media
    this.existingImages = product.images || [];
    this.existingVideoUrl = product.videoUrl || null;

    // Basic fields
    this.productForm.patchValue({
      name: product.name || '',
      description: product.description || '',
      price: product.price ?? null,
      originalPrice: product.originalPrice ?? null,
      costPrice: product.costPrice ?? null,
      stockQuantity: product.stockQuantity ?? product.stock ?? 1,
      category: product.category || '',
      subCategory: product.subCategory || '',
      sku: product.sku || '',
      erpMaterialCode: product.erpMaterialCode || '',
      isVerified: product.isVerified || false,
      featured: product.featured === true,
      returnable: product.returnable !== false,
      videoUrl: product.videoUrl || '',
      inventoryOwnership: product.inventoryOwnership || 'Owned Stock',
      seoQualifiersStr: product.seoQualifiers ? product.seoQualifiers.join(', ') : '',
      occasionKeywordsStr: product.occasionKeywords ? product.occasionKeywords.join(', ') : '',

      // Sale & pricing (§3)
      saleMode: product.saleMode || 'PER_PIECE',
      unitPrice: product.unitPrice ?? null,

      // Metal-rate pricing
      pricingMode: product.pricingMode === 'METAL_RATE' ? 'METAL_RATE' : 'FIXED',
      pricingMetal: product.pricingMetal || 'GOLD',
      pricingPurity: product.pricingPurity || '',
      pricingNetWeightGrams: product.pricingNetWeightGrams ?? null,
      makingChargeType: product.makingChargeType || 'PER_GRAM',
      makingChargeValue: product.makingChargeValue ?? null,
      wastagePct: product.wastagePct ?? null,
      stoneValue: product.stoneValue ?? null,
      otherCharges: product.otherCharges ?? null,
      pieceCount: product.pieceCount ?? null,
      lotTotalCaratWeight: product.lotTotalCaratWeight ?? null,
      averagePieceWeight: product.averagePieceWeight ?? null,
      sizeRange: product.sizeRange || '',
      calibrated: product.calibrated === true,
      beadSizeMm: product.beadSizeMm ?? null,
      strandLengthInches: product.strandLengthInches ?? null,
      strandCount: product.strandCount ?? null,
      heightInches: product.heightInches ?? null,
      craft: product.craft || '',
      plainOrStudded: product.plainOrStudded || '',
      gemGrade: product.gemGrade || '',

      // Category Specific (Will just patch everything, non-matching fields are ignored safely if not in UI or just kept in memory)
      grossWeight: product.grossWeight ?? null,
      totalCaratWeight: product.totalCaratWeight ?? null,
      dimensions: product.dimensions || '',
      currentLocation: product.currentLocation || '',
      hsnCode: product.hsnCode || '',
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
      certificateLab: product.certificateLab || '',
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

    // The stored breakdown is shown until the operator edits a pricing field,
    // which then fetches a fresh preview from today's board.
    this.pricePreview = product.pricingMode === 'METAL_RATE' && product.priceBreakdown ? product.priceBreakdown : null;
    this.previewError = null;

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

  addCustomizationOption(opt?: any) {
    this.customizationOptions.push(this.fb.group({
      type: [opt?.type || '', Validators.required],
      name: [opt?.name || '', Validators.required],
      priceModifier: [opt?.priceModifier ?? 0, Validators.required]
    }));
  }

  addStandardMetals() {
    const standard = [
      { type: 'metal', name: '18K Yellow Gold', priceModifier: 0 },
      { type: 'metal', name: '18K Rose Gold', priceModifier: 3500 },
      { type: 'metal', name: '18K White Gold', priceModifier: 0 },
      { type: 'metal', name: 'Platinum 950', priceModifier: 12000 }
    ];
    standard.forEach(opt => this.addCustomizationOption(opt));
  }

  addStandardDiamondQualities() {
    const standard = [
      { type: 'diamond', name: 'IJ / SI Grade', priceModifier: 0 },
      { type: 'diamond', name: 'GH / VS Grade (High Luster)', priceModifier: 15000 },
      { type: 'diamond', name: 'EF / VVS Grade (Museum Solitaire)', priceModifier: 28000 }
    ];
    standard.forEach(opt => this.addCustomizationOption(opt));
  }

  removeCustomizationOption(index: number) {
    this.customizationOptions.removeAt(index);
  }

  addStoneDetail(stone?: any) {
    // Control names match StoneDetailDTO (backend dto/StoneDetailDTO.java).
    const stoneGroup = this.fb.group({
      stoneType: [stone ? stone.stoneType : ''],
      position: [stone?.position ?? ''],
      shape: [stone ? stone.shape : ''],
      pieceCount: [stone ? stone.pieceCount : null],
      caratWeight: [stone?.caratWeight ?? null, [Validators.min(0)]],
      totalCaratWeight: [stone ? stone.totalCaratWeight : null],
      colour: [stone?.colour ?? ''],
      clarity: [stone?.clarity ?? ''],
      cut: [stone?.cut ?? ''],
      certificateLab: [stone?.certificateLab ?? ''],
      certificateNumber: [stone?.certificateNumber ?? ''],
      ratePerCarat: [stone?.ratePerCarat ?? null, [Validators.min(0)]],
      origin: [stone?.origin ?? ''],
      treatment: [stone?.treatment ?? ''],
      settingType: [stone ? stone.settingType : '']
    });
    this.stoneDetails.push(stoneGroup);
  }

  removeStoneDetail(index: number) {
    this.stoneDetails.removeAt(index);
  }

  /**
   * §5 auto name and description for the resolved item type. Stops as soon as
   * the user edits either field: the (input) handlers set the flags, and as a
   * second line of defence a current value that differs from what this method
   * last wrote is treated as a manual edit too.
   */
  generateNameAndDescription() {
    if (this.isPatchingForm || !this.selectedCategory) return;

    const nameCtrl = this.productForm.get('name');
    const descCtrl = this.productForm.get('description');
    if (!nameCtrl || !descCtrl) return;

    const currentName = (nameCtrl.value ?? '') as string;
    const currentDesc = (descCtrl.value ?? '') as string;
    if (currentName && currentName !== this.lastAutoName) this.isNameManuallyEdited = true;
    if (currentDesc && currentDesc !== this.lastAutoDescription) this.isDescriptionManuallyEdited = true;
    if (this.isNameManuallyEdited && this.isDescriptionManuallyEdited) return;

    const node = this.selectedCategoryObject;
    const subName = this.productForm.get('subCategory')?.value;
    const ctx = {
      ...this.productForm.getRawValue(),
      categoryLabel: node?.displayName ?? node?.name ?? this.selectedCategory,
      subCategoryLabel: subName ? this.subCategoryLabel(subName) : ''
    };

    const generatedName = buildAutoName(this.itemType, ctx);
    const generatedDesc = buildAutoDescription(this.itemType, ctx, generatedName);

    if (!this.isNameManuallyEdited && generatedName && generatedName !== currentName) {
      nameCtrl.setValue(generatedName, { emitEvent: false });
      this.lastAutoName = generatedName;
    } else if (!this.isNameManuallyEdited && generatedName) {
      this.lastAutoName = generatedName;
    }

    if (!this.isDescriptionManuallyEdited && generatedDesc && generatedDesc !== currentDesc) {
      descCtrl.setValue(generatedDesc, { emitEvent: false });
      this.lastAutoDescription = generatedDesc;
    } else if (!this.isDescriptionManuallyEdited && generatedDesc) {
      this.lastAutoDescription = generatedDesc;
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

  // Removed unused step navigation methods
  updatePriceBreakupTotal() {
    const breakup = this.productForm.get('priceBreakup');
    if (breakup) {
      const metal = breakup.get('metal')?.value || 0;
      const gemstone = breakup.get('gemstone')?.value || 0;
      const making = breakup.get('makingCharges')?.value || 0;
      const tax = breakup.get('tax')?.value || 0;

      const total = metal + gemstone + making + tax;
      breakup.get('total')?.setValue(total, { emitEvent: false });

      // Keep price in step only when the breakup actually carries a value and
      // the price is typed directly rather than derived from a unit price.
      if (total > 0 && this.isPerPiece) {
        this.productForm.get('price')?.setValue(total, { emitEvent: false });
      }
    }
  }

  onSubmit() {
    if (this.productForm.invalid || this.uploadingMedia) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.createProductRecord();
  }

  /** Stock by location block (edit mode only). Never blocks the form. */
  loadStockByLocation() {
    if (!this.productId) return;
    this.stockByLocationError = null;
    this.stockService.getProductStock(this.productId).subscribe({
      next: (loc) => this.stockByLocation = loc,
      error: (err) => {
        this.stockByLocation = null;
        this.stockByLocationError = err?.status === 404 ? null : 'Stock by location is unavailable right now.';
      }
    });
  }

  private createProductRecord() {
    const formValue = this.productForm.getRawValue();

    // Parse comma separated strings to arrays
    const seoQualifiers = formValue.seoQualifiersStr ? (formValue.seoQualifiersStr as string).split(',').map(s => s.trim()).filter(s => s) : [];
    const occasionKeywords = formValue.occasionKeywordsStr ? (formValue.occasionKeywordsStr as string).split(',').map(s => s.trim()).filter(s => s) : [];
    const stoneDetailIds = formValue.stoneDetailIds ? (formValue.stoneDetailIds as string).split(',').map(s => s.trim()).filter(s => s) : [];

    const productData = {
      ...formValue,
      stock: formValue.stockQuantity,
      seoQualifiers,
      occasionKeywords,
      stoneDetailIds,
      images: this.existingImages,
      videoUrl: formValue.videoUrl || this.existingVideoUrl,
      specifications: null,
      // §3/§4: normalise the type-scoped fields the server validates.
      saleMode: formValue.saleMode || 'PER_PIECE',
      // Metal-rate pricing only applies to per-piece finished jewellery; the
      // server keeps the typed price for FIXED products.
      pricingMode: (this.showPricingModeToggle && formValue.pricingMode === 'METAL_RATE') ? 'METAL_RATE' : 'FIXED',
      pricingPurity: formValue.pricingPurity || null,
      plainOrStudded: this.itemType === 'JEWELLERY' ? (formValue.plainOrStudded || null) : null,
      craft: (this.itemType === 'JEWELLERY' || this.itemType === 'SET') ? (formValue.craft || null) : null,
      gemGrade: formValue.gemGrade || null,
      // The server recomputes these; sending our derivation keeps list views consistent meanwhile.
      averagePieceWeight: formValue.averagePieceWeight ?? null
    };

    if (this.isEditMode && this.productId) {
      this.productService.updateProduct(this.productId, productData).subscribe({
        next: () => {
          this.router.navigate(['/products']);
        },
        error: (err) => {
          console.error('Failed to update product', err);
          this.errorMessage = err?.error?.message || 'Failed to update product.';
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
          this.errorMessage = err?.error?.message || 'Failed to create product.';
          this.loading = false;
        }
      });
    }
  }
}
