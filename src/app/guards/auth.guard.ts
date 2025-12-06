import { Injectable } from "@angular/core";
import { Router, CanActivateFn } from "@angular/router";
import { inject } from "@angular/core";
import { ApiService } from "../services/api.service";

@Injectable({
  providedIn: "root",
})
export class AuthGuard {
  constructor(
    private apiService: ApiService,
    private router: Router,
  ) {}

  canActivate(): boolean {
    if (this.apiService.isAuthenticated()) {
      return true;
    }

    this.router.navigate(["/login"]);
    return false;
  }
}

export const authGuard: CanActivateFn = (route, state) => {
  const apiService = inject(ApiService);
  const router = inject(Router);

  if (apiService.isAuthenticated()) {
    return true;
  }

  router.navigate(["/login"], { queryParams: { returnUrl: state.url } });
  return false;
};
