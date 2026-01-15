import { TestBed } from '@angular/core/testing';
import { CompareService } from './compare.service';
import { Product } from '../core/models';

describe('CompareService', () => {
  let service: CompareService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CompareService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should add product to compare list', () => {
    const product: Product = { id: '1', name: 'P1' } as any;
    // mock alert to avoid jsdom error or annoyance
    spyOn(window, 'alert');
    service.addToCompare(product);
    expect(service.compareList().length).toBe(1);
    expect(service.compareList()[0].id).toBe('1');
  });

  it('should not add duplicate product', () => {
    const product: Product = { id: '1', name: 'P1' } as any;
    spyOn(window, 'alert');
    service.addToCompare(product);
    service.addToCompare(product);
    expect(service.compareList().length).toBe(1);
  });

  it('should not add more than 3 products', () => {
    const p1: Product = { id: '1', name: 'P1' } as any;
    const p2: Product = { id: '2', name: 'P2' } as any;
    const p3: Product = { id: '3', name: 'P3' } as any;
    const p4: Product = { id: '4', name: 'P4' } as any;

    spyOn(window, 'alert');
    service.addToCompare(p1);
    service.addToCompare(p2);
    service.addToCompare(p3);
    service.addToCompare(p4);

    expect(service.compareList().length).toBe(3);
    expect(service.compareList().map(p => p.id)).toEqual(['1', '2', '3']);
  });

  it('should remove product from compare list', () => {
    const p1: Product = { id: '1', name: 'P1' } as any;
    spyOn(window, 'alert');
    service.addToCompare(p1);
    service.removeFromCompare('1');
    expect(service.compareList().length).toBe(0);
  });
});
