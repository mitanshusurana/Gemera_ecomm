import { Injectable } from '@angular/core';

/**
 * Centralized API configuration service
 * Provides the base URL for all API endpoints
 * 
 * To change the backend API URL, update the baseUrl property below
 */
@Injectable({
  providedIn: 'root'
})
export class ApiConfigService {
  /**
   * Base URL for all API endpoints
   * Change this to point to your backend server
   * 
   * Examples:
   * - Local development: '/api/v1'
   * - External API: 'https://api.yourdomain.com/api/v1'
   */
  readonly baseUrl = 'http://localhost:8080/api/v1';

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
