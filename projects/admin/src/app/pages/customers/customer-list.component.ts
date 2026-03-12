import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.css'
})
export class CustomerListComponent {
  customers = [
    { name: 'Alex Johnson', tier: 'VIP', lastActive: '2 hours ago', totalSpend: 12450.00, planProgress: 85, avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg' },
    { name: 'Sarah Williams', tier: 'Gold', lastActive: '1 day ago', totalSpend: 8210.50, planProgress: 42, avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg' },
    { name: 'Marcus Chen', tier: 'Gold', lastActive: '3 hours ago', totalSpend: 5400.00, planProgress: 15, avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg' }
  ];
}
