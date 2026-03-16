import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminMaintenanceService } from '../../services/admin-maintenance.service';

@Component({
  selector: 'app-system-maintenance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './system-maintenance.component.html',
  styleUrl: './system-maintenance.component.css'
})
export class SystemMaintenanceComponent implements OnInit {
  private maintenanceService = inject(AdminMaintenanceService);

  health: any = { status: 'UNKNOWN', cpuUsagePercent: 0, memoryUsagePercent: 0, uptimeHours: 0 };
  loadingHealth = true;
  triggeringBackup = false;
  backupResult: any = null;

  ngOnInit() {
    this.loadHealth();
  }

  loadHealth() {
    this.loadingHealth = true;
    this.maintenanceService.getHealth().subscribe({
      next: (data) => {
        this.health = data;
        this.loadingHealth = false;
      },
      error: (err) => {
        console.error('Failed to load system health', err);
        this.loadingHealth = false;
      }
    });
  }

  triggerBackup() {
    this.triggeringBackup = true;
    this.backupResult = null;
    this.maintenanceService.triggerBackup().subscribe({
      next: (data) => {
        this.backupResult = data;
        this.triggeringBackup = false;
      },
      error: (err) => {
        console.error('Failed to trigger backup', err);
        this.triggeringBackup = false;
      }
    });
  }
}