import { Injectable, signal, computed } from '@angular/core';
import { Product } from '../core/models';

export type JewelryCategoryType = 'rings' | 'necklaces' | 'pendants' | 'earrings' | 'bracelets';

export interface JewelryCategoryOption {
  id: JewelryCategoryType;
  name: string;
  subtitle: string;
  icon: string;
  defaultSettingCategory: string;
}

@Injectable({
  providedIn: 'root'
})
export class BuilderService {
  currentStep = signal<1 | 2 | 3 | 4>(1);

  // Configuration Choices
  selectedCategory = signal<JewelryCategoryType>('rings');
  selectedSetting = signal<Product | null>(null);
  selectedStone = signal<Product | null>(null);
  selectedMetal = signal<'18k-yellow' | '18k-white' | '18k-rose' | 'platinum'>('18k-yellow');
  selectedMetalName = signal<string>('18K Solid Yellow Gold');
  selectedSizeOrLength = signal<string>('Size 7 (US)');
  customEngraving = signal<string>('');

  categoryOptions: JewelryCategoryOption[] = [
    { id: 'rings', name: 'Solitaire & Engagement Rings', subtitle: 'Bespoke band mounts & center solitaire gems', icon: '💍', defaultSettingCategory: 'Ring Setting' },
    { id: 'pendants', name: 'Pendants & Solitaire Drops', subtitle: 'Precious bails, chains & focal gemstones', icon: '✨', defaultSettingCategory: 'Pendant' },
    { id: 'necklaces', name: 'Fine Necklaces & Chokers', subtitle: 'Collier mountings & graduated stones', icon: '📿', defaultSettingCategory: 'Necklace' },
    { id: 'earrings', name: 'Studs & Chandelier Drops', subtitle: 'Matched gemstone pairs & basket mounts', icon: '💎', defaultSettingCategory: 'Earrings' },
    { id: 'bracelets', name: 'Tennis Bracelets & Bangles', subtitle: 'Articulated links & precision channel settings', icon: '👑', defaultSettingCategory: 'Bracelet' }
  ];

  totalPrice = computed(() => {
    const settingPrice = this.selectedSetting()?.price || 0;
    const stonePrice = this.selectedStone()?.price || 0;
    let metalModifier = 0;
    if (this.selectedMetal() === '18k-rose') metalModifier = 3500;
    if (this.selectedMetal() === 'platinum') metalModifier = 12000;
    const engravingPrice = this.customEngraving().trim() ? 1500 : 0;
    return settingPrice + stonePrice + metalModifier + engravingPrice;
  });

  setCategory(category: JewelryCategoryType) {
    this.selectedCategory.set(category);
    this.selectedSetting.set(null);
    this.currentStep.set(2);
  }

  setSetting(product: Product) {
    this.selectedSetting.set(product);
    this.currentStep.set(3);
  }

  setStone(product: Product) {
    this.selectedStone.set(product);
    this.currentStep.set(4);
  }

  reset() {
    this.selectedCategory.set('rings');
    this.selectedSetting.set(null);
    this.selectedStone.set(null);
    this.customEngraving.set('');
    this.currentStep.set(1);
  }

  goToStep(step: 1 | 2 | 3 | 4) {
    if (step === 2 && !this.selectedCategory()) return;
    if (step === 3 && !this.selectedSetting()) return;
    if (step === 4 && (!this.selectedSetting() || !this.selectedStone())) return;
    this.currentStep.set(step);
  }
}
