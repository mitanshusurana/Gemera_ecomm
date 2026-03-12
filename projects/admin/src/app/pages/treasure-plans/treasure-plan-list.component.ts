import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-treasure-plan-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './treasure-plan-list.component.html',
  styleUrl: './treasure-plan-list.component.css'
})
export class TreasurePlanListComponent {
  isModalOpen = false;

  openModal() {
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }
}
