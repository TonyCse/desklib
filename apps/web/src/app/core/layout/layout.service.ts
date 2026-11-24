import { Injectable, signal } from '@angular/core';

/**
 * État de mise en page partagé entre la coque et les pages. En mode « immersif », la page
 * occupe tout l'écran (pas de sidebar ni de barre de titre) et pose ses propres éléments flottants.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly immersive = signal(false);

  setImmersive(value: boolean): void {
    this.immersive.set(value);
  }
}
