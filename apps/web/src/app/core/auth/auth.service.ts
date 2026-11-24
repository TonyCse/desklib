import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { firstValueFrom, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import type { Role } from '@ilot/shared';
import type { PublicUser } from '../models';

/**
 * Session côté front. Le vrai contrôle d'accès est côté API ; ce service ne fait que
 * piloter l'interface (quels liens afficher, où rediriger). Aucun jeton n'est stocké :
 * le cookie httpOnly est géré par le navigateur.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly user = signal<PublicUser | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly role = computed<Role | null>(() => this.user()?.role ?? null);

  private sessionCheck: Promise<void> | null = null;

  /** Vérifie la session une seule fois (au premier passage par une route protégée). */
  ensureSession(): Promise<void> {
    this.sessionCheck ??= firstValueFrom(this.fetchMe()).then(() => undefined);
    return this.sessionCheck;
  }

  login(email: string, password: string): Observable<PublicUser> {
    return this.http.post<PublicUser>('/api/auth/login', { email, password }).pipe(
      tap((user) => {
        this.user.set(user);
        this.sessionCheck = Promise.resolve();
      }),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      tap(() => this.clear()),
      catchError(() => {
        this.clear();
        return of(undefined);
      }),
    );
  }

  /** Remet la session à zéro (déconnexion ou session expirée). */
  clear(): void {
    this.user.set(null);
    this.sessionCheck = Promise.resolve();
  }

  private fetchMe(): Observable<PublicUser | null> {
    return this.http.get<PublicUser>('/api/auth/me').pipe(
      map((user) => {
        this.user.set(user);
        return user;
      }),
      catchError(() => {
        this.user.set(null);
        return of(null);
      }),
    );
  }
}
