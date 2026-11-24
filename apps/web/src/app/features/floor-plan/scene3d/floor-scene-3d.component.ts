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
import type { FloorDetail, FloorSummary } from '../../../core/models';
import { EmptyStateComponent } from '../../../shared/ui/feedback.components';
import type { OfficeScene, SceneDesk, SceneRoom, SceneVehicle, ScenePick } from './office-scene';

/**
 * Vue 3D de l'étage. Three.js est chargé à la demande (import dynamique). Glisser fait tourner la scène,
 * la molette zoome, et un clic (sans glisser) sur un poste, un véhicule ou une salle l'émet.
 * Le choix d'étage et la bascule « Vue du dessus » sont dans les contrôles de la scène.
 */
@Component({
  selector: 'app-floor-scene-3d',
  imports: [EmptyStateComponent],
  template: `
    <div
      #host
      [attr.data-status]="status()"
      class="relative h-full w-full overflow-hidden bg-[#eaf1fa]"
    >
      <canvas
        #canvas
        class="block h-full w-full touch-none"
        role="img"
        [attr.aria-label]="
          'Vue 3D de l’étage : ' +
          detail().name +
          ', ' +
          desks().length +
          ' postes, ' +
          vehicles().length +
          ' véhicules, ' +
          rooms().length +
          ' salles. Cliquez sur un élément pour le réserver, ou utilisez la vue plan ou liste au clavier.'
        "
        (pointerdown)="onPointerDown($event)"
        (pointerup)="onPointerUp($event)"
        (pointermove)="onPointerMove($event)"
        (wheel)="onWheel($event)"
      ></canvas>

      @if (status() === 'ready') {
        <div
          class="absolute bottom-40 left-4 z-10 flex flex-col gap-2"
          role="group"
          aria-label="Contrôles de la vue 3D"
        >
          <select
            #floorSelect
            class="rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-sm font-medium shadow-pop backdrop-blur-md hover:bg-white"
            aria-label="Étage"
            [value]="floorId()"
            (change)="floorChange.emit(floorSelect.value)"
          >
            @for (floor of floors(); track floor.id) {
              <option [value]="floor.id">{{ floor.name }}</option>
            }
          </select>
          <button
            type="button"
            class="rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-sm font-medium shadow-pop backdrop-blur-md hover:bg-white"
            [attr.aria-pressed]="topView()"
            (click)="toggleTopView()"
          >
            {{ topView() ? 'Vue 3D' : 'Vue du dessus' }}
          </button>
          <div class="flex gap-2">
            <button
              type="button"
              class="h-9 w-9 rounded-xl border border-white/70 bg-white/85 text-lg font-semibold shadow-pop backdrop-blur-md hover:bg-white"
              aria-label="Zoomer"
              (click)="zoom(1.25)"
            >
              +
            </button>
            <button
              type="button"
              class="h-9 w-9 rounded-xl border border-white/70 bg-white/85 text-lg font-semibold shadow-pop backdrop-blur-md hover:bg-white"
              aria-label="Dézoomer"
              (click)="zoom(0.8)"
            >
              −
            </button>
          </div>
        </div>
      }

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
  readonly vehicles = input<readonly SceneVehicle[]>([]);
  readonly rooms = input<readonly SceneRoom[]>([]);
  readonly floors = input<readonly FloorSummary[]>([]);
  readonly floorId = input('');
  /** Élément choisi (clic sans glisser). */
  readonly picked = output<ScenePick>();
  /** Étage choisi dans les contrôles de la scène. */
  readonly floorChange = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly topView = signal(false);

  private scene: OfficeScene | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private downAt: { x: number; y: number } | null = null;
  private destroyed = false;

  constructor() {
    // Une seule synchronisation : la scène décide seule entre transition d'étage, reconstruction et mise à jour.
    effect(() => {
      const detail = this.detail();
      const desks = this.desks();
      const vehicles = this.vehicles();
      const rooms = this.rooms();
      untracked(() => {
        this.scene?.update(detail, desks, vehicles, rooms);
        // Un nouvel étage repart de la vue 3/4 par défaut.
        this.topView.set(false);
      });
    });
  }

  ngAfterViewInit(): void {
    void this.init();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.scene?.dispose();
  }

  protected toggleTopView(): void {
    this.topView.update((v) => !v);
    this.scene?.setView(this.topView() ? 'top' : 'iso');
  }

  protected zoom(factor: number): void {
    this.scene?.zoomBy(factor);
  }

  protected onWheel(event: WheelEvent): void {
    // La molette zoome la scène (et non la page) lorsqu'elle est au-dessus du canevas.
    event.preventDefault();
    this.scene?.zoomBy(event.deltaY < 0 ? 1.08 : 0.92);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.downAt = { x: event.clientX, y: event.clientY };
  }

  protected onPointerUp(event: PointerEvent): void {
    // Un clic est un appui et un relâché au même endroit ; un glisser fait tourner la scène.
    const start = this.downAt;
    this.downAt = null;
    if (!this.scene || !start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const pick = this.scene.pick(event.clientX, event.clientY);
    if (pick) this.picked.emit(pick);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.scene) return;
    if (this.scene.hover(event.clientX, event.clientY)) {
      this.canvas().nativeElement.style.cursor = this.scene.pick(event.clientX, event.clientY)
        ? 'pointer'
        : 'grab';
    }
  }

  private async init(): Promise<void> {
    try {
      const { OfficeScene: SceneClass } = await import('./office-scene');
      if (this.destroyed) return;
      const scene = await SceneClass.create(this.canvas().nativeElement);
      if (this.destroyed) {
        scene.dispose();
        return;
      }
      this.scene = scene;
      const host = this.host().nativeElement;
      scene.resize(host.clientWidth, host.clientHeight);
      scene.update(this.detail(), this.desks(), this.vehicles(), this.rooms());
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
