import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-whatsapp-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Floating WhatsApp Button -->
    <a
      [href]="whatsappLink"
      target="_blank"
      rel="noopener noreferrer"
      class="fixed bottom-6 right-6 z-40 group"
      [attr.aria-label]="'Contact us on WhatsApp'"
    >
      <!-- Main Button -->
      <button
        class="w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 rounded-full shadow-2xl hover:shadow-green-500/50 transition-all duration-300 flex items-center justify-center transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-green-300"
      >
        <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.272-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-9.746 9.798c0 2.734.732 5.41 2.122 7.734L2.505 23.5l8.227-2.16c2.215 1.21 4.71 1.849 7.267 1.849h.006c5.385 0 9.748-4.363 9.748-9.748 0-2.605-.635-5.074-1.845-7.262C19.557 5.2 16.087 2.98 12.051 2.98z"
          />
        </svg>
      </button>

      <!-- Tooltip -->
      <div
        class="absolute right-0 bottom-20 bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-2 rounded-lg whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
      >
        <p class="text-sm font-semibold">Chat with us!</p>
        <p class="text-xs text-green-100">{{ phoneNumber }}</p>
        <div class="absolute bottom-0 right-4 w-2 h-2 bg-green-700 transform rotate-45 translate-y-1"></div>
      </div>
    </a>

    <!-- Alternative: Contact Section in Footer/Page -->
    <div
      *ngIf="showContactCard"
      class="card p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200"
    >
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
          <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.272-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-9.746 9.798c0 2.734.732 5.41 2.122 7.734L2.505 23.5l8.227-2.16c2.215 1.21 4.71 1.849 7.267 1.849h.006c5.385 0 9.748-4.363 9.748-9.748 0-2.605-.635-5.074-1.845-7.262C19.557 5.2 16.087 2.98 12.051 2.98z"
            />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-900 mb-1">Chat with us on WhatsApp</h3>
          <p class="text-sm text-gray-700 mb-4">
            Have questions? Get instant responses from our team available 24/7.
          </p>
          <a
            [href]="whatsappLink"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-all duration-300 hover:shadow-lg"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path
                d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.272-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-9.746 9.798c0 2.734.732 5.41 2.122 7.734L2.505 23.5l8.227-2.16c2.215 1.21 4.71 1.849 7.267 1.849h.006c5.385 0 9.748-4.363 9.748-9.748 0-2.605-.635-5.074-1.845-7.262C19.557 5.2 16.087 2.98 12.051 2.98z"
              />
            </svg>
            Start Chat
          </a>
        </div>
      </div>
    </div>
  `,
})
export class WhatsappButtonComponent {
  @Input() phoneNumber: string = '+91 7976091951';
  @Input() message: string = 'Hello! I would like to inquire about your products.';
  @Input() showContactCard: boolean = false;

  get whatsappLink(): string {
    const cleanNumber = this.phoneNumber.replace(/\D/g, '');
    const encodedMessage = encodeURIComponent(this.message);
    return `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
  }
}
