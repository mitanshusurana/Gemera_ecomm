import { Directive, ElementRef, OnInit, OnDestroy, inject } from '@angular/core';

@Directive({
  selector: '[appFocusTrap]',
  standalone: true
})
export class FocusTrapDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private firstFocusable: HTMLElement | null = null;
  private lastFocusable: HTMLElement | null = null;

  ngOnInit() {
    const focusableElements = this.el.nativeElement.querySelectorAll(
      'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
    );

    if (focusableElements.length) {
      this.firstFocusable = focusableElements[0] as HTMLElement;
      this.lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;
      this.firstFocusable.focus();
    }

    this.el.nativeElement.addEventListener('keydown', this.handleTab);
  }

  ngOnDestroy() {
    this.el.nativeElement.removeEventListener('keydown', this.handleTab);
  }

  handleTab = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) { // Shift + Tab
        if (document.activeElement === this.firstFocusable) {
          e.preventDefault();
          this.lastFocusable?.focus();
        }
      } else { // Tab
        if (document.activeElement === this.lastFocusable) {
          e.preventDefault();
          this.firstFocusable?.focus();
        }
      }
    }
  }
}
