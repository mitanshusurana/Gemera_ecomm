import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastrService } from 'ngx-toastr';

interface Category {
  id: string;
  name: string;
  displayName: string;
  isActive: boolean;
  showJewelryFields: boolean;
  showGemstoneFields: boolean;
  showComponentFields: boolean;
  showIdolFields: boolean;
  showRoughFields: boolean;
  parentId?: string | null;
  subcategories: Category[];
}

interface FlattenedCategory extends Category {
  level: number;
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

  categoryForm: FormGroup;

  constructor(private fb: FormBuilder, private http: HttpClient, private toastr: ToastrService) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required],
      displayName: ['', Validators.required],
      isActive: [true],
      showJewelryFields: [false],
      showGemstoneFields: [false],
      showComponentFields: [false],
      showIdolFields: [false],
      showRoughFields: [false]
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
    const flattened: FlattenedCategory[] = [];
    const traverse = (cats: Category[], level: number) => {
      for (const cat of cats) {
        flattened.push({ ...cat, level });
        if (cat.subcategories && cat.subcategories.length > 0) {
          traverse(cat.subcategories, level + 1);
        }
      }
    };
    traverse(categories, 0);
    this.flattenedCategories.set(flattened);
  }

  openAddCategoryModal(parentId: string | null = null) {
    this.isEditing.set(false);
    this.currentParentId.set(parentId);
    this.categoryForm.reset({
      isActive: true,
      showJewelryFields: false,
      showGemstoneFields: false,
      showComponentFields: false,
      showIdolFields: false,
      showRoughFields: false
    });
    this.showModal.set(true);
  }

  openEditCategoryModal(category: Category) {
    this.isEditing.set(true);
    this.editingId.set(category.id);
    this.currentParentId.set(category.parentId || null);
    this.categoryForm.patchValue({
      name: category.name,
      displayName: category.displayName,
      isActive: category.isActive,
      showJewelryFields: category.showJewelryFields,
      showGemstoneFields: category.showGemstoneFields,
      showComponentFields: category.showComponentFields,
      showIdolFields: category.showIdolFields,
      showRoughFields: category.showRoughFields
    });
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveCategory() {
    if (this.categoryForm.invalid) return;

    const payload = {
      ...this.categoryForm.value,
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
