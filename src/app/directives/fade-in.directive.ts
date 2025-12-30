import { Directive, ElementRef, OnInit, inject } from '@angular/core';

@Directive({
  selector: '[appFadeIn]',
  standalone: true
})
export class FadeInDirective implements OnInit {
  private el = inject(ElementRef);

  ngOnInit() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('opacity-100', 'translate-y-0');
          entry.target.classList.remove('opacity-0', 'translate-y-8');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    // Initial styles
    this.el.nativeElement.classList.add('transition-all', 'duration-700', 'ease-out', 'opacity-0', 'translate-y-8');
    observer.observe(this.el.nativeElement);
  }
}
