import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Centralized API configuration service
 * Provides the base URL for all API endpoints
 */
@Injectable({
  providedIn: 'root'
})
export class ApiConfigService {
  /**
   * Base URL for all API endpoints
   */
  readonly baseUrl = environment.apiUrl;

  /**
   * Get the full endpoint URL
   * @param endpoint The specific endpoint (e.g., 'auth', 'products')
   * @returns Complete URL for the endpoint
   */
  getEndpoint(endpoint: string): string {
    // Remove leading slash from endpoint if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    // Simply concatenate, don't normalize slashes (preserves http://)
    return `${this.baseUrl}/${cleanEndpoint}`;
  }
}
