import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { environment } from "../../environments/environment";

@Component({
  selector: "app-whatsapp-button",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Floating WhatsApp Button -->
    <a
      [href]="whatsappLink"
      target="_blank"
      rel="noopener noreferrer"
      class="fixed bottom-6 right-6 md:bottom-24 z-40 group"
      [attr.aria-label]="'Contact us on WhatsApp'"
    >
      <!-- Main Button -->
      <button
        class="w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 rounded-full shadow-2xl hover:shadow-green-500/50 transition-all duration-300 flex items-center justify-center transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-green-300"
      >
        <svg class="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M12.031 0C5.385 0 .002 5.38.002 12.025c0 2.124.553 4.195 1.604 6.014L.012 24l6.113-1.603c1.748.966 3.738 1.477 5.904 1.477h.005c6.643 0 12.028-5.38 12.028-12.023C24.062 5.222 18.679 0 12.031 0zm0 21.85c-1.802 0-3.564-.484-5.11-1.401l-.367-.217-3.793.996.993-3.696-.237-.378c-.999-1.583-1.527-3.414-1.527-5.312 0-5.525 4.5-10.024 10.038-10.024 5.524 0 10.022 4.498 10.022 10.024 0 5.527-4.498 10.025-10.022 10.025l.003-.017zm5.504-7.519c-.302-.152-1.785-.88-2.062-.981-.277-.101-.48-.152-.682.152-.202.302-.782.981-.958 1.183-.176.202-.353.227-.655.076-1.554-.783-2.668-1.503-3.673-3.235-.177-.303.176-.282.474-.877.102-.202.051-.379-.025-.53-.076-.152-.682-1.643-.933-2.249-.245-.591-.493-.51-.682-.519-.176-.008-.378-.01-.58-.01-.202 0-.528.076-.805.379-.277.303-1.057 1.034-1.057 2.519s1.082 2.915 1.233 3.117c.152.202 2.127 3.243 5.153 4.544 2.039.878 2.809.845 3.328.71.581-.151 1.785-.731 2.037-1.439.252-.708.252-1.314.177-1.442-.075-.126-.277-.202-.58-.353z"
          />
        </svg>
      </button>

      <!-- Tooltip -->
      <div
        class="absolute right-0 bottom-20 bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-2 rounded-lg whitespace-normal max-w-[200px] shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
      >
        <p class="text-sm font-semibold">Chat with us!</p>
        <p class="text-xs text-green-100">{{ phoneNumber }}</p>
        <div
          class="absolute bottom-0 right-4 w-2 h-2 bg-green-700 transform rotate-45 translate-y-1"
        ></div>
      </div>
    </a>

    <!-- Alternative: Contact Section in Footer/Page -->
    <div
      *ngIf="showContactCard"
      class="card p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200"
    >
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0"
        >
          <svg
            class="w-6 h-6 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.272-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-9.746 9.798c0 2.734.732 5.41 2.122 7.734L2.505 23.5l8.227-2.16c2.215 1.21 4.71 1.849 7.267 1.849h.006c5.385 0 9.748-4.363 9.748-9.748 0-2.605-.635-5.074-1.845-7.262C19.557 5.2 16.087 2.98 12.051 2.98z"
            />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-900 mb-1">
            Chat with us on WhatsApp
          </h3>
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
  @Input() phoneNumber: string = environment.whatsappNumber;
  @Input() message: string =
    "Hello! I would like to inquire about your products.";
  @Input() showContactCard: boolean = false;

  get whatsappLink(): string {
    const cleanNumber = this.phoneNumber.replace(/\D/g, "");
    const encodedMessage = encodeURIComponent(this.message);
    return `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
  }
}
