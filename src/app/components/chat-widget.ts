import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-4 pointer-events-none">

      <!-- Chat Window -->
      <div *ngIf="isOpen()" class="bg-surface rounded-2xl shadow-2xl w-[calc(100vw-2rem)] max-w-80 sm:max-w-sm overflow-hidden border border-ink pointer-events-auto animate-fade-in-up">
        <div class="bg-primary p-4 text-surface flex justify-between items-center">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🤖</span>
            <div>
              <h3 class="font-bold text-sm">Caratloop Concierge</h3>
              <p class="text-xs font-extrabold text-accent">Always here to help</p>
            </div>
          </div>
          <button (click)="toggleChat()" class="text-surface hover:text-accent">&times;</button>
        </div>

        <div class="h-80 bg-surface p-4 overflow-y-auto custom-scrollbar space-y-4">
          <!-- Bot Message -->
          <div class="flex gap-2">
            <div class="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-lg">💎</div>
            <div class="bg-surface p-3 rounded-tr-lg rounded-br-lg rounded-bl-lg shadow-sm max-w-[80%] text-sm text-ink">
              Hello! Welcome to Caratloop. How can I assist you today?
            </div>
          </div>

          <!-- User Messages (Simulated History) -->
          <div *ngFor="let msg of messages()" class="flex gap-2" [ngClass]="{'flex-row-reverse': msg.isUser}">
            <div *ngIf="!msg.isUser" class="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-lg">💎</div>
            <div class="p-3 rounded-lg shadow-sm max-w-[80%] text-sm"
                 [ngClass]="msg.isUser ? 'bg-accent text-surface rounded-tl-lg rounded-bl-lg rounded-br-lg' : 'bg-surface text-ink rounded-tr-lg rounded-br-lg rounded-bl-lg'">
              {{ msg.text }}
            </div>
          </div>

          <!-- Typing Indicator -->
          <div *ngIf="isTyping()" class="flex gap-2">
             <div class="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-lg">💎</div>
             <div class="bg-surface p-3 rounded-lg shadow-sm flex gap-1">
               <div class="w-2 h-2 bg-surface rounded-full animate-bounce"></div>
               <div class="w-2 h-2 bg-surface rounded-full animate-bounce delay-100"></div>
               <div class="w-2 h-2 bg-surface rounded-full animate-bounce delay-200"></div>
             </div>
          </div>
        </div>

        <!-- Quick Replies -->
        <div class="p-4 bg-surface border-t border-ink">
          <div class="flex flex-wrap gap-2 justify-end" *ngIf="!showInput()">
            <button *ngFor="let option of currentOptions()"
                    (click)="handleOption(option)"
                    class="px-3 py-2 bg-secondary-50 hover:bg-accent text-accent text-xs font-extrabold rounded-full border border-secondary-200 transition-colors">
              {{ option.label }}
            </button>
          </div>
          <div *ngIf="showInput()" class="relative">
             <input #chatInput type="text" placeholder="Type a message..."
                    (keyup.enter)="sendMessage(chatInput.value); chatInput.value=''"
                    class="w-full pl-4 pr-10 py-2 border rounded-full text-sm focus:outline-none focus:border-secondary-500">
             <button (click)="sendMessage(chatInput.value); chatInput.value=''"
                     class="absolute right-2 top-1/2 -translate-y-1/2 text-accent hover:text-accent">➤</button>
          </div>
        </div>
      </div>

      <!-- Chat Bubble -->
      <button (click)="toggleChat()"
              [class.scale-0]="isOpen()"
              class="pointer-events-auto w-12 h-12 md:w-14 md:h-14 bg-primary hover:bg-primary text-surface rounded-full shadow-2xl flex items-center justify-center text-xl md:text-2xl transition-all hover:scale-110 mb-16 md:mb-0">
        💬
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

  constructor(private router: Router) {}

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
