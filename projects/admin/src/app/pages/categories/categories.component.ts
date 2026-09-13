import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastrService } from 'ngx-toastr';
import {
  CategoryNode,
  FlatCategory,
  ITEM_TYPES,
  ITEM_TYPE_LABEL,
  ItemType,
  flattenCategoryTree,
  indexById,
  isInheritedItemType,
  resolveItemType
} from '../../core/item-types';

interface Category extends CategoryNode {
  isActive: boolean;
  showJewelryFields: boolean;
  showGemstoneFields: boolean;
  showComponentFields: boolean;
  showIdolFields: boolean;
  showRoughFields: boolean;
  subcategories: Category[];
}

interface FlattenedCategory extends FlatCategory {
  /** Effective type, resolved through parents. */
  effectiveItemType: ItemType | null;
  /** True when the effective type comes from an ancestor rather than this row. */
  inherited: boolean;
}

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './categories.component.html'
})
export class CategoriesComponent implements OnInit {
  categories = signal<Category[]>([]);
  flattenedCategories = signal<FlattenedCategory[]>([]);
  showModal = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  currentParentId = signal<string | null>(null);
  editingId = signal<string | null>(null);

  itemTypes = ITEM_TYPES;
  itemTypeLabel = ITEM_TYPE_LABEL;

  categoryForm: FormGroup;

  private byId = new Map<string, FlatCategory>();

  constructor(private fb: FormBuilder, private http: HttpClient, private toastr: ToastrService) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required],
      displayName: ['', Validators.required],
      isActive: [true],
      // '' means "Inherit from parent" and is sent as null.
      itemType: ['']
    });
  }

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.http.get<{categories: Category[]}>(`${environment.apiUrl}/admin/categories`).subscribe({
      next: (res) => {
        this.categories.set(res.categories);
        this.flattenCategories(res.categories);
      },
      error: () => this.toastr.error('Failed to load categories')
    });
  }

  flattenCategories(categories: Category[]) {
    const flat = flattenCategoryTree(categories);
    this.byId = indexById(flat);
    this.flattenedCategories.set(flat.map(c => ({
      ...c,
      effectiveItemType: resolveItemType(c, this.byId),
      inherited: isInheritedItemType(c, this.byId)
    })));
  }

  /** What the parent would pass down, shown next to the "Inherit" option. */
  get parentEffectiveType(): ItemType | null {
    const parentId = this.currentParentId();
    if (!parentId) return null;
    return resolveItemType(this.byId.get(parentId), this.byId);
  }

  openAddCategoryModal(parentId: string | null = null) {
    this.isEditing.set(false);
    this.editingId.set(null);
    this.currentParentId.set(parentId);
    this.categoryForm.reset({
      isActive: true,
      itemType: ''
    });
    this.showModal.set(true);
  }

  openEditCategoryModal(category: FlattenedCategory) {
    this.isEditing.set(true);
    this.editingId.set(category.id);
    this.currentParentId.set(category.parentId || null);
    // The DTO carries the effective type. A value equal to the parent's is
    // shown as "Inherit from parent"; saving it as null changes nothing.
    const own = category.inherited ? '' : (category.effectiveItemType ?? '');
    this.categoryForm.patchValue({
      name: category.name,
      displayName: category.displayName,
      isActive: category.isActive,
      itemType: own
    });
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveCategory() {
    if (this.categoryForm.invalid) return;

    const value = this.categoryForm.value;
    const payload = {
      name: value.name,
      displayName: value.displayName,
      isActive: value.isActive,
      itemType: value.itemType || null,
      parentId: this.currentParentId()
    };

    if (this.isEditing() && this.editingId()) {
      this.http.put(`${environment.apiUrl}/admin/categories/${this.editingId()}`, payload).subscribe({
        next: () => {
          this.toastr.success('Category updated');
          this.closeModal();
          this.loadCategories();
        },
        error: () => this.toastr.error('Failed to update category')
      });
    } else {
      this.http.post(`${environment.apiUrl}/admin/categories`, payload).subscribe({
        next: () => {
          this.toastr.success('Category added');
          this.closeModal();
          this.loadCategories();
        },
        error: () => this.toastr.error('Failed to add category')
      });
    }
  }

  deleteCategory(id: string) {
    if (confirm('Are you sure you want to delete this category? This might affect products.')) {
      this.http.delete(`${environment.apiUrl}/admin/categories/${id}`).subscribe({
        next: () => {
          this.toastr.success('Category deleted');
          this.loadCategories();
        },
        error: () => this.toastr.error('Failed to delete category')
      });
    }
  }
}
