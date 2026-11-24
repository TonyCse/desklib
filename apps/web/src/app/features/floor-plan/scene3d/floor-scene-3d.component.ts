import type { AfterViewInit, OnDestroy, ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { FloorDetail } from '../../../core/models';
import { EmptyStateComponent } from '../../../shared/ui/feedback.components';
import type { OfficeScene, SceneDesk } from './office-scene';

/**
 * Vue 3D de l'étage. Three.js est chargé à la demande (import dynamique) : tant que la vue
 * n'est pas ouverte, ce code n'est pas téléchargé. Un clic sur un poste émet son identifiant,
 * avec un point d'ancrage à l'écran pour la popover de réservation.
 */
@Component({
  selector: 'app-floor-scene-3d',
  imports: [EmptyStateComponent],
  template: `
    <div
      #host
      [attr.data-status]="status()"
      class="relative h-[62vh] min-h-80 max-h-[620px] w-full overflow-hidden rounded-xl bg-[#f4f7fb]"
    >
      <canvas
        #canvas
        class="block h-full w-full"
        role="img"
        [attr.aria-label]="
          'Vue 3D de l’étage : ' +
          detail().name +
          ', ' +
          desks().length +
          ' postes. Cliquez sur un poste pour le réserver, ou utilisez la vue liste au clavier.'
        "
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
      ></canvas>

      @if (status() === 'loading') {
        <div
          class="absolute inset-0 flex items-center justify-center text-sm text-ink-muted"
          role="status"
        >
          Chargement de la scène 3D…
        </div>
      } @else if (status() === 'error') {
        <div class="absolute inset-0 flex items-center justify-center p-6">
          <app-empty-state
            title="La vue 3D n’a pas pu se charger"
            description="Utilisez la vue Plan ou Liste pour réserver."
          />
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloorScene3dComponent implements AfterViewInit, OnDestroy {
  readonly detail = input.required<FloorDetail>();
  readonly desks = input.required<readonly SceneDesk[]>();
  /** Poste choisi, avec un élément d'ancrage placé à l'écran à l'endroit du poste. */
  readonly deskPicked = output<{ deskId: string; anchor: HTMLElement }>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');

  private scene: OfficeScene | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private anchor: HTMLElement | null = null;
  private destroyed = false;

  constructor() {
    // Changement d'étage : reconstruction. Changement d'état des postes : simple mise à jour.
    effect(() => {
      const detail = this.detail();
      const desks = this.desks();
      untracked(() => this.scene?.setFloor(detail, desks));
    });
    effect(() => {
      const desks = this.desks();
      untracked(() => this.scene?.setStates(desks));
    });
  }

  ngAfterViewInit(): void {
    void this.init();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.scene?.dispose();
    this.anchor?.remove();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.scene) return;
    const deskId = this.scene.pick(event.clientX, event.clientY);
    if (!deskId) return;
    const point = this.scene.screenPointOf(deskId);
    if (!point) return;

    this.anchor?.remove();
    const anchor = document.createElement('span');
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.position = 'absolute';
    anchor.style.left = `${point.x}px`;
    anchor.style.top = `${point.y}px`;
    anchor.style.width = '1px';
    anchor.style.height = '1px';
    this.host().nativeElement.appendChild(anchor);
    this.anchor = anchor;
    this.deskPicked.emit({ deskId, anchor });
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.scene) return;
    if (this.scene.hover(event.clientX, event.clientY)) {
      this.canvas().nativeElement.style.cursor = this.scene.pick(event.clientX, event.clientY)
        ? 'pointer'
        : 'default';
    }
  }

  private async init(): Promise<void> {
    try {
      const { OfficeScene: SceneClass } = await import('./office-scene');
      if (this.destroyed) return;
      this.scene = await SceneClass.create(this.canvas().nativeElement, () => undefined);
      if (this.destroyed) {
        this.scene.dispose();
        return;
      }
      this.scene.setFloor(this.detail(), this.desks());
      const host = this.host().nativeElement;
      this.scene.resize(host.clientWidth, host.clientHeight);
      this.resizeObserver = new ResizeObserver(() => {
        this.scene?.resize(host.clientWidth, host.clientHeight);
      });
      this.resizeObserver.observe(host);
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }
}
