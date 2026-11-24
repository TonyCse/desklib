import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../notifications/toast.service';

/**
 * Traduit les erreurs de l'API en messages lisibles (toasts).
 * Une 401 hors connexion signifie une session expirée : retour à l'écran de connexion.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const isSessionCheck =
          req.url.endsWith('/api/auth/me') || req.url.endsWith('/api/auth/login');
        if (error.status === 401 && !isSessionCheck) {
          auth.clear();
          toast.error('Votre session a expiré. Veuillez vous reconnecter.');
          void router.navigate(['/connexion']);
        } else if (error.status === 429) {
          toast.error('Trop de tentatives. Patientez une minute avant de réessayer.');
        } else if (error.status === 0) {
          toast.error('Le serveur ne répond pas. Vérifiez que l’API est lancée.');
        } else if (error.status >= 500) {
          toast.error('Une erreur inattendue est survenue. Réessayez dans un instant.');
        } else if (!isSessionCheck && error.status !== 401) {
          toast.error(messageFrom(error));
        }
      }
      return throwError(() => error);
    }),
  );
};

/** Le message de l'API peut être une chaîne ou une liste (erreurs de validation). */
export function messageFrom(error: HttpErrorResponse): string {
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = body.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(' · ');
  }
  return 'La demande n’a pas pu aboutir.';
}
