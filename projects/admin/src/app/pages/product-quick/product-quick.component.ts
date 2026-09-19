import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../../environments/environment';
import { ProductService, QuickCaptureRequest } from '../../services/product.service';
import {
  ALLOWED_SALE_MODES,
  FlatCategory,
  ITEM_TYPE_LABEL,
  ItemType,
  QuantityField,
  SALE_MODE_LABEL,
  SaleMode,
  UNIT_PRICE_SUFFIX,
  defaultSaleMode,
  flattenCategoryTree,
  indexById,
  primaryWeightFieldFor,
  resolveItemType
} from '../../core/item-types';

/** One photo in the strip: previewed at once, uploaded in the background. */
interface Photo {
  /** Object URL until the upload finishes, then the server URL. */
  preview: string;
  url: string | null;
  state: 'uploading' | 'done' | 'failed';
  file: File;
}

const STORAGE_KEY = 'caratloop.admin.quickCapture';

/**
 * Quick capture (GROWTH-CONTRACT §1): photo + category + price + weight from a
 * phone at the counter. Creates a draft through POST /products/quick; the
 * full form finishes it later.
 */
@Component({
  selector: 'app-product-quick',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './product-quick.component.html'
})
export class ProductQuickComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private productService = inject(ProductService);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  readonly saleModeLabel = SALE_MODE_LABEL;
  readonly unitPriceSuffix = UNIT_PRICE_SUFFIX;
  readonly itemTypeLabel = ITEM_TYPE_LABEL;

  flatCategories: FlatCategory[] = [];
  private categoryById = new Map<string, FlatCategory>();
  categoriesFailed = false;

  photos: Photo[] = [];

  // Form state (template-driven: the page is five fields).
  category = '';
  subCategory = '';
  saleMode: SaleMode = 'PER_PIECE';
  price: number | null = null;
  unitPrice: number | null = null;
  primaryWeight: number | null = null;
  stock: number | null = 1;
  name = '';
  notes = '';

  saving = false;
  error = '';
  /** Drafts created in this visit, newest first, so the counter can see what went in. */
  saved: Array<{ id: string; name: string; sku?: string }> = [];

  ngOnInit() {
    this.restoreLast();
    this.http.get<{ categories: any[] }>(environment.apiUrl + '/admin/categories').subscribe({
      next: (res) => {
        this.flatCategories = flattenCategoryTree(res?.categories ?? []);
        this.categoryById = indexById(this.flatCategories);
        this.onCategoryChange({ keepSaleMode: true });
      },
      error: (err) => {
        console.error('Failed to load categories', err);
        this.categoriesFailed = true;
      }
    });
  }

  ngOnDestroy() {
    this.revokePreviews();
  }

  // ---------------------------------------------------------------------
  // Category / item type
  // ---------------------------------------------------------------------

  get selectedNode(): FlatCategory | null {
    if (!this.category) return null;
    return this.flatCategories.find(c => c.name === this.category || c.displayName === this.category) ?? null;
  }

  get itemType(): ItemType | null {
    return resolveItemType(this.selectedNode, this.categoryById);
  }

  get allowedSaleModes(): ReadonlyArray<SaleMode> {
    const t = this.itemType;
    return t ? ALLOWED_SALE_MODES[t] : ['PER_PIECE'];
  }

  get subCategories(): any[] {
    return this.selectedNode?.subcategories ?? [];
  }

  get weightField(): QuantityField | null {
    return primaryWeightFieldFor(this.itemType);
  }

  get isPerPiece(): boolean {
    return this.saleMode === 'PER_PIECE';
  }

  /** Non-breaking indentation for <option> text, which cannot be padded with CSS. */
  indent(level: number): string {
    return '    '.repeat(level) + (level > 0 ? '↳ ' : '');
  }

  onCategoryChange(opts: { keepSaleMode?: boolean } = {}) {
    if (!opts.keepSaleMode) this.subCategory = '';
    const allowed = this.allowedSaleModes;
    if (!allowed.includes(this.saleMode)) {
      this.saleMode = defaultSaleMode(this.itemType);
    }
    this.persistLast();
  }

  onSaleModeChange() {
    if (this.isPerPiece) this.unitPrice = null;
    else this.price = null;
    this.persistLast();
  }

  // ---------------------------------------------------------------------
  // Photos
  // ---------------------------------------------------------------------

  onFilesPicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) this.addPhoto(file);
  }

  private addPhoto(file: File) {
    const photo: Photo = { preview: URL.createObjectURL(file), url: null, state: 'uploading', file };
    this.photos = [...this.photos, photo];
    this.productService.uploadImage(file).subscribe({
      next: (res: any) => {
        photo.url = res?.url ?? null;
        photo.state = photo.url ? 'done' : 'failed';
      },
      error: (err) => {
        console.error('Photo upload failed', err);
        photo.state = 'failed';
      }
    });
  }

  retryPhoto(photo: Photo) {
    photo.state = 'uploading';
    this.productService.uploadImage(photo.file).subscribe({
      next: (res: any) => {
        photo.url = res?.url ?? null;
        photo.state = photo.url ? 'done' : 'failed';
      },
      error: () => { photo.state = 'failed'; }
    });
  }

  removePhoto(index: number) {
    const [removed] = this.photos.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.preview);
    this.photos = [...this.photos];
  }

  makePrimary(index: number) {
    if (index <= 0) return;
    const next = [...this.photos];
    const [p] = next.splice(index, 1);
    next.unshift(p);
    this.photos = next;
  }

  get uploading(): boolean {
    return this.photos.some(p => p.state === 'uploading');
  }

  get failedUploads(): number {
    return this.photos.filter(p => p.state === 'failed').length;
  }

  get uploadedUrls(): string[] {
    return this.photos.filter(p => p.state === 'done' && p.url).map(p => p.url as string);
  }

  private revokePreviews() {
    for (const p of this.photos) URL.revokeObjectURL(p.preview);
  }

  // ---------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------

  get canSave(): boolean {
    return !!this.category && !this.saving && !this.uploading;
  }

  private buildBody(): QuickCaptureRequest {
    const num = (v: unknown): number | undefined => {
      if (v === null || v === undefined || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const body: QuickCaptureRequest = {
      category: this.category,
      images: this.uploadedUrls,
      saleMode: this.saleMode,
      stock: num(this.stock) ?? 1
    };
    if (this.subCategory) body.subCategory = this.subCategory;
    if (this.name.trim()) body.name = this.name.trim();
    if (this.notes.trim()) body.notes = this.notes.trim();
    if (this.isPerPiece) {
      const p = num(this.price);
      if (p !== undefined) body.price = p;
    } else {
      const u = num(this.unitPrice);
      if (u !== undefined) body.unitPrice = u;
    }
    const w = num(this.primaryWeight);
    if (w !== undefined && this.weightField) body.primaryWeight = w;
    return body;
  }

  private validate(): string | null {
    if (!this.category) return 'Pick a category first.';
    if (this.uploading) return 'Wait for the photos to finish uploading.';
    const negative = [this.price, this.unitPrice, this.primaryWeight, this.stock]
      .some(v => v !== null && v !== undefined && Number(v) < 0);
    if (negative) return 'Prices, weights and stock cannot be negative.';
    return null;
  }

  saveAndAddAnother() {
    this.save(created => {
      this.toastr.success(`Draft saved${created?.sku ? ` (${created.sku})` : ''}. Ready for the next one.`);
      this.resetForNext();
    });
  }

  saveAndComplete() {
    this.save(created => {
      if (created?.id) {
        this.router.navigate(['/products/edit', created.id]);
      } else {
        this.toastr.success('Draft saved.');
        this.resetForNext();
      }
    });
  }

  private save(onDone: (created: any) => void) {
    const problem = this.validate();
    if (problem) {
      this.error = problem;
      return;
    }
    this.error = '';
    this.saving = true;
    this.persistLast();
    this.productService.quickCreate(this.buildBody()).subscribe({
      next: (created: any) => {
        this.saving = false;
        if (created?.id) {
          this.saved = [{ id: created.id, name: created.name || this.name || 'Draft', sku: created.sku }, ...this.saved].slice(0, 20);
        }
        onDone(created);
      },
      error: (err) => {
        this.saving = false;
        console.error('Quick capture failed', err);
        this.error = err?.status === 404
          ? 'Quick capture is not available on this server yet. Use the full Add Product form.'
          : (err?.error?.message || 'The draft could not be saved.');
      }
    });
  }

  /** Keep category, sub-category and sale mode; clear photos and everything that identifies the piece. */
  private resetForNext() {
    this.revokePreviews();
    this.photos = [];
    this.price = null;
    this.unitPrice = null;
    this.primaryWeight = null;
    this.stock = 1;
    this.name = '';
    this.notes = '';
    this.error = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------------
  // Last-used defaults (localStorage)
  // ---------------------------------------------------------------------

  private persistLast() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        category: this.category,
        subCategory: this.subCategory,
        saleMode: this.saleMode
      }));
    } catch { /* storage may be unavailable; defaults are a convenience */ }
  }

  private restoreLast() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const last = JSON.parse(raw);
      if (typeof last?.category === 'string') this.category = last.category;
      if (typeof last?.subCategory === 'string') this.subCategory = last.subCategory;
      if (typeof last?.saleMode === 'string' && last.saleMode in SALE_MODE_LABEL) this.saleMode = last.saleMode as SaleMode;
    } catch { /* ignore a corrupt entry */ }
  }
}
