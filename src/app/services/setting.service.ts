import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SettingService {
  private apiUrl = environment.apiUrl + '/settings';

  private settingsSubject = new BehaviorSubject<any>({
    companyAddress: environment.companyAddress,
    companyPhone: environment.companyPhone,
    companyEmail: environment.companyEmail,
    whatsappNumber: environment.whatsappNumber,
    companyInstagram: environment.companyInstagram,
    companyFacebook: environment.companyFacebook
  });

  public settings$ = this.settingsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadSettings();
  }

  loadSettings() {
    this.http.get<any>(this.apiUrl).pipe(
      catchError(err => {
        console.warn('Failed to load settings from API, using defaults');
        return of({});
      })
    ).subscribe(settings => {
      if (Object.keys(settings).length > 0) {
        this.settingsSubject.next({ ...this.settingsSubject.value, ...settings });
      }
    });
  }

  getSettings(): any {
    return this.settingsSubject.value;
  }
}
