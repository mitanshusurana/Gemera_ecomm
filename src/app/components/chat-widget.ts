import { Component, ChangeDetectionStrategy, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { WhatsappEnquiryService } from '../services/whatsapp-enquiry.service';

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed bottom-3 right-3 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-4 pointer-events-none font-sans">

      <!-- Chat Window -->
      <div *ngIf="isOpen()" class="bg-white rounded-[18px] shadow-2xl w-[calc(100vw-2rem)] max-w-80 sm:max-w-sm overflow-hidden border border-[#e0e0e0] pointer-events-auto animate-fade-in-up">
        <div class="bg-[#1d1d1f] p-4 text-white flex justify-between items-center">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🤖</span>
            <div>
              <h3 class="font-sans font-semibold text-sm text-white">Caratloop Concierge</h3>
              <p class="text-xs font-medium text-[#D4AF37]">Always here to help</p>
            </div>
          </div>
          <button (click)="toggleChat()" aria-label="Close chat" class="text-white/70 hover:text-white text-2xl leading-none active-press">&times;</button>
        </div>

        <div class="h-80 bg-[#f5f5f7] p-4 overflow-y-auto custom-scrollbar space-y-4">
          <!-- Bot Message -->
          <div class="flex gap-2">
            <div class="w-8 h-8 rounded-full bg-[#D4AF37] flex items-center justify-center text-lg">💎</div>
            <div class="bg-white border border-[#e0e0e0] p-3 rounded-[12px] rounded-tl-sm max-w-[80%] text-sm text-[#1d1d1f]">
              Hello! Welcome to Caratloop. How can I assist you today?
            </div>
          </div>

          <!-- User Messages (Simulated History) -->
          <div *ngFor="let msg of messages()" class="flex gap-2" [ngClass]="{'flex-row-reverse': msg.isUser}">
            <div *ngIf="!msg.isUser" class="w-8 h-8 rounded-full bg-[#D4AF37] flex items-center justify-center text-lg">💎</div>
            <div class="p-3 rounded-[12px] max-w-[80%] text-sm"
                 [ngClass]="msg.isUser ? 'bg-[#D4AF37] text-black rounded-tr-sm' : 'bg-white border border-[#e0e0e0] text-[#1d1d1f] rounded-tl-sm'">
              {{ msg.text }}
            </div>
          </div>

          <!-- Typing Indicator -->
          <div *ngIf="isTyping()" class="flex gap-2">
             <div class="w-8 h-8 rounded-full bg-[#D4AF37] flex items-center justify-center text-lg">💎</div>
             <div class="bg-white border border-[#e0e0e0] p-3 rounded-[12px] rounded-tl-sm flex gap-1">
               <div class="w-2 h-2 bg-[#a1a1a6] rounded-full animate-bounce"></div>
               <div class="w-2 h-2 bg-[#a1a1a6] rounded-full animate-bounce delay-100"></div>
               <div class="w-2 h-2 bg-[#a1a1a6] rounded-full animate-bounce delay-200"></div>
             </div>
          </div>
        </div>

        <!-- Quick Replies -->
        <div class="p-4 bg-white border-t border-[#e0e0e0]">
          <div class="flex flex-wrap gap-2 justify-end" *ngIf="!showInput()">
            <button *ngFor="let option of currentOptions()"
                    (click)="handleOption(option)"
                    class="btn-apple-pill-secondary text-xs !py-1.5 !px-3">
              {{ option.label }}
            </button>
          </div>
          <div *ngIf="showInput()" class="relative">
             <input #chatInput type="text" placeholder="Type a message..."
                    aria-label="Type a message"
                    (keyup.enter)="sendMessage(chatInput.value); chatInput.value=''"
                    class="input-field !rounded-full !py-2 !pr-10 text-sm">
             <button (click)="sendMessage(chatInput.value); chatInput.value=''"
                     aria-label="Send message"
                     class="absolute right-3 top-1/2 -translate-y-1/2 text-[#D4AF37] hover:text-[#B5952F] active-press">➤</button>
          </div>
        </div>
      </div>

      <!-- Phone: the one launcher opens a two-item dial, WhatsApp and the
           concierge, instead of two bubbles stacked over the page. -->
      <div *ngIf="dialOpen() && !isOpen()" class="md:hidden flex flex-col items-end gap-2 pointer-events-auto animate-fade-in-up">
        <a [href]="whatsappLink" target="_blank" rel="noopener noreferrer" (click)="dialOpen.set(false)"
           class="flex items-center gap-2 active-press" aria-label="Contact us on WhatsApp">
          <span class="text-xs font-medium text-[#1d1d1f] bg-white border border-[#e0e0e0] rounded-full px-3 py-1">WhatsApp</span>
          <span class="w-11 h-11 rounded-full bg-[#25D366] flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.031 0C5.385 0 .002 5.38.002 12.025c0 2.124.553 4.195 1.604 6.014L.012 24l6.113-1.603c1.748.966 3.738 1.477 5.904 1.477h.005c6.643 0 12.028-5.38 12.028-12.023C24.062 5.222 18.679 0 12.031 0zm0 21.85c-1.802 0-3.564-.484-5.11-1.401l-.367-.217-3.793.996.993-3.696-.237-.378c-.999-1.583-1.527-3.414-1.527-5.312 0-5.525 4.5-10.024 10.038-10.024 5.524 0 10.022 4.498 10.022 10.024 0 5.527-4.498 10.025-10.022 10.025l.003-.017zm5.504-7.519c-.302-.152-1.785-.88-2.062-.981-.277-.101-.48-.152-.682.152-.202.302-.782.981-.958 1.183-.176.202-.353.227-.655.076-1.554-.783-2.668-1.503-3.673-3.235-.177-.303.176-.282.474-.877.102-.202.051-.379-.025-.53-.076-.152-.682-1.643-.933-2.249-.245-.591-.493-.51-.682-.519-.176-.008-.378-.01-.58-.01-.202 0-.528.076-.805.379-.277.303-1.057 1.034-1.057 2.519s1.082 2.915 1.233 3.117c.152.202 2.127 3.243 5.153 4.544 2.039.878 2.809.845 3.328.71.581-.151 1.785-.731 2.037-1.439.252-.708.252-1.314.177-1.442-.075-.126-.277-.202-.58-.353z"/></svg>
          </span>
        </a>
        <button (click)="dialOpen.set(false); toggleChat()" class="flex items-center gap-2 active-press" aria-label="Open concierge chat">
          <span class="text-xs font-medium text-[#1d1d1f] bg-white border border-[#e0e0e0] rounded-full px-3 py-1">Concierge</span>
          <span class="w-11 h-11 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center text-lg">💬</span>
        </button>
      </div>

      <!-- Chat Bubble: opens the chat on desktop, the dial on a phone -->
      <button (click)="launcherClick()"
              [class.scale-0]="isOpen()"
              [attr.aria-label]="dialOpen() ? 'Close contact options' : 'Open chat'"
              [attr.aria-expanded]="dialOpen()"
              class="pointer-events-auto w-12 h-12 md:w-14 md:h-14 bg-[#D4AF37] hover:bg-[#B5952F] text-black rounded-full shadow-2xl flex items-center justify-center text-xl md:text-2xl transition-all hover:scale-110 mb-16 md:mb-0">
        {{ dialOpen() ? '×' : '💬' }}
      </button>
    </div>
  `
})
export class ChatWidgetComponent {
  isOpen = signal(false);
  isTyping = signal(false);
  showInput = signal(false);
  messages = signal<{ text: string, isUser: boolean }[]>([]);

  currentOptions = signal([
    { label: 'Engagement Rings', action: 'rings' },
    { label: 'Gift Ideas', action: 'gifts' },
    { label: 'Track Order', action: 'track' },
    { label: 'Speak to Human', action: 'human' }
  ]);

  // Phone only: the launcher shows WhatsApp + concierge instead of opening the chat.
  dialOpen = signal(false);
  private wa = inject(WhatsappEnquiryService);
  private platformId = inject(PLATFORM_ID);

  constructor(private router: Router) {}

  get whatsappLink(): string {
    return this.wa.currentLink();
  }

  launcherClick() {
    const phone = isPlatformBrowser(this.platformId) && window.matchMedia('(max-width: 767px)').matches;
    if (phone && !this.isOpen()) {
      this.dialOpen.update(v => !v);
      return;
    }
    this.dialOpen.set(false);
    this.toggleChat();
  }

  toggleChat() {
    this.isOpen.update(v => !v);
  }

  handleOption(option: { label: string, action: string }) {
    this.addMessage(option.label, true);
    this.currentOptions.set([]); // Clear options
    this.isTyping.set(true);

    setTimeout(() => {
      this.isTyping.set(false);
      this.processAction(option.action);
    }, 1000);
  }

  addMessage(text: string, isUser: boolean) {
    this.messages.update(m => [...m, { text, isUser }]);
  }

  sendMessage(text: string) {
    if (!text.trim()) return;
    this.addMessage(text, true);
    this.isTyping.set(true);

    setTimeout(() => {
      this.isTyping.set(false);
      this.addMessage("I'm a generic bot. I'll be connected to an AI engine later!", false);
    }, 1500);
  }

  processAction(action: string) {
    switch (action) {
      case 'rings':
        this.addMessage("Excellent choice! Are you looking for a classic solitaire or something more modern?", false);
        this.currentOptions.set([
          { label: 'Classic Solitaire', action: 'nav_solitaire' },
          { label: 'Modern/Halo', action: 'nav_halo' }
        ]);
        break;
      case 'gifts':
        this.addMessage("How thoughtful! What is your budget range?", false);
        this.currentOptions.set([
          { label: 'Under $500', action: 'nav_gift_low' },
          { label: '$500 - $2000', action: 'nav_gift_mid' },
          { label: '$2000+', action: 'nav_gift_high' }
        ]);
        break;
      case 'track':
        this.addMessage("You can track your order in your account dashboard. Would you like me to take you there?", false);
        this.currentOptions.set([
          { label: 'Yes, go to Account', action: 'nav_account' },
          { label: 'No, thanks', action: 'reset' }
        ]);
        break;
      case 'nav_account':
        this.router.navigate(['/account']);
        this.isOpen.set(false);
        break;
      case 'nav_solitaire':
      case 'nav_halo':
        this.addMessage("Navigating you to our exclusive collection...", false);
        setTimeout(() => {
            this.router.navigate(['/products'], { queryParams: { category: 'ring' } });
            this.isOpen.set(false);
        }, 1500);
        break;
      case 'reset':
        this.addMessage("Is there anything else I can help you with?", false);
        this.currentOptions.set([
            { label: 'Engagement Rings', action: 'rings' },
            { label: 'Gift Ideas', action: 'gifts' }
        ]);
        break;
      default:
        this.addMessage("Connecting you with a specialist...", false);
        this.showInput.set(true);
    }
  }
}
