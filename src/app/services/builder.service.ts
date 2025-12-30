import { Injectable, signal, computed } from '@angular/core';
import { Product } from '../core/models';

@Injectable({
  providedIn: 'root'
})
export class BuilderService {
  currentStep = signal<1 | 2 | 3>(1);
  selectedSetting = signal<Product | null>(null);
  selectedStone = signal<Product | null>(null);

  totalPrice = computed(() => {
    const settingPrice = this.selectedSetting()?.price || 0;
    const stonePrice = this.selectedStone()?.price || 0;
    return settingPrice + stonePrice;
  });

  setSetting(product: Product) {
    this.selectedSetting.set(product);
    this.currentStep.set(2);
  }

  setStone(product: Product) {
    this.selectedStone.set(product);
    this.currentStep.set(3);
  }

  reset() {
    this.selectedSetting.set(null);
    this.selectedStone.set(null);
    this.currentStep.set(1);
  }

  goToStep(step: 1 | 2 | 3) {
      if (step === 2 && !this.selectedSetting()) return;
      if (step === 3 && (!this.selectedSetting() || !this.selectedStone())) return;
      this.currentStep.set(step);
  }
}
