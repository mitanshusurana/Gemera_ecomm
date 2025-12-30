import { Pipe, PipeTransform, inject } from '@angular/core';
import { CurrencyService } from '../services/currency.service';

@Pipe({
  name: 'currencyConvert',
  standalone: true,
  pure: false // Impure to react to signal changes
})
export class CurrencyConvertPipe implements PipeTransform {
  currencyService = inject(CurrencyService);

  transform(value: number): string {
    return this.currencyService.format(value);
  }
}
