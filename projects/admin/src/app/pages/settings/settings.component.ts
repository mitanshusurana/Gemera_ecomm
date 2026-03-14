import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingService } from '../../services/setting.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settingService = inject(SettingService);

  settingsForm = this.fb.group({
    companyAddress: ['', Validators.required],
    companyPhone: ['', Validators.required],
    companyEmail: ['', [Validators.required, Validators.email]],
    whatsappNumber: ['', Validators.required],
    companyInstagram: [''],
    companyFacebook: ['']
  });

  saving = false;
  successMessage = '';

  ngOnInit() {
    this.settingService.getSettings().subscribe({
      next: (settings) => {
        if (settings) {
          this.settingsForm.patchValue(settings);
        }
      },
      error: (err) => console.error('Error loading settings', err)
    });
  }

  onSubmit() {
    if (this.settingsForm.invalid) return;

    this.saving = true;
    this.successMessage = '';

    this.settingService.updateSettings(this.settingsForm.value).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = 'Settings saved successfully!';
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err) => {
        console.error('Failed to save settings', err);
        this.saving = false;
      }
    });
  }
}