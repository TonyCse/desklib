import { HttpClient } from '@angular/common/http';
import type {
  ElementRef,
  OnInit} from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';
import { forkJoin } from 'rxjs';
import type { FloorDetail } from '../../core/models';
import { ToastService } from '../../core/notifications/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';

type ZoneKind = 'openspace' | 'room' | 'kitchen';
type ZoneNumberField = 'x' | 'y' | 'width' | 'height' | 'capacity';
type DeskNumberField = 'x' | 'y' | 'width' | 'height';

interface DraftZone {
  key: string;
  name: string;
  kind: ZoneKind;
  x: number;
  y: number;
  width: number;
  height: number;
  capacity: number | null;
}

interface DraftDesk {
  key: string;
  /** null = poste à créer. */
  id: string | null;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isActive: boolean;
}

interface DraftLayout {
  width: number;
  height: number;
  zones: DraftZone[];
  desks: DraftDesk[];
}

const GRID = 10;
const ZONE_LABEL: Record<ZoneKind, string> = {
  openspace: 'Espace ouvert',
  room: 'Salle de réunion',
  kitchen: 'Cuisine',
};
const ZONE_SIZE: Record<ZoneKind, { width: number; height: number }> = {
  openspace: { width: 300, height: 240 },
  room: { width: 200, height: 160 },
  kitchen: { width: 240, height: 160 },
};
const DESK_SIZE = { width: 60, height: 40 };

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

function fromDetail(detail: FloorDetail): DraftLayout {
  return {
    width: detail.width,
    height: detail.height,
    zones: detail.zones.map((z) => ({
      key: `zone:${z.name}`,
      name: z.name,
      kind: z.kind as ZoneKind,
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      capacity: (z as { capacity?: number }).capacity ?? null,
    })),
    desks: detail.desks.map((d) => ({
      key: d.id,
      id: d.id,
      label: d.label,
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      isActive: d.isActive,
    })),
  };
}

/**
 * Mode édition du plan (administrateur) : déplacer et dimensionner les zones et les postes,
 * ajouter des postes et des salles. Les modifications sont enregistrées d'un coup.
 */
@Component({
  selector: 'app-floor-layout-editor',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="absolute inset-0 overflow-auto bg-[#eef3f9] pb-6 pt-40 md:pt-52" aria-label="Édition du plan">
      <div class="flex min-h-full min-w-full items-center justify-center p-10">
        <svg
          #svg
          class="w-auto max-w-none touch-none select-none drop-shadow-sm"
          [style.height]="'calc(100dvh - 20rem)'"
          [attr.viewBox]="'-24 -24 ' + (draft().width + 48) + ' ' + (draft().height + 48)"
          role="group"
          aria-label="Plan en édition"
          (pointermove)="onPointerMove($event)"
          (pointerup)="endDrag()"
          (pointercancel)="endDrag()"
        >
          <rect x="-24" y="-24" [attr.width]="draft().width + 48" [attr.height]="draft().height + 48" rx="28" class="fill-[#f7f9fc]" />
          <rect x="0" y="0" [attr.width]="draft().width" [attr.height]="draft().height" rx="10" class="fill-none stroke-accent" stroke-dasharray="8 6" stroke-width="2" />

          @for (zone of draft().zones; track zone.key) {
            <g class="cursor-move" (pointerdown)="startDrag($event, 'zone', zone.key)">
              <rect
                [attr.x]="zone.x"
                [attr.y]="zone.y"
                [attr.width]="zone.width"
                [attr.height]="zone.height"
                rx="14"
                [class]="zone.kind === 'openspace' ? 'fill-white stroke-line' : zone.kind === 'kitchen' ? 'fill-[#f1f5f9] stroke-line-strong' : 'fill-[#e4ecf7] stroke-line-strong'"
                stroke-width="1.5"
              />
              @if (selected()?.key === zone.key) {
                <rect [attr.x]="zone.x - 3" [attr.y]="zone.y - 3" [attr.width]="zone.width + 6" [attr.height]="zone.height + 6" rx="16" class="fill-none stroke-accent" stroke-width="3" />
              }
              <text [attr.x]="zone.x + 16" [attr.y]="zone.y + 26" font-size="11" font-weight="700" letter-spacing="0.4" class="fill-ink-subtle">
                {{ zone.name.toUpperCase() }}
              </text>
            </g>
          }

          @for (desk of draft().desks; track desk.key) {
            <g class="cursor-move" (pointerdown)="startDrag($event, 'desk', desk.key)">
              <rect
                [attr.x]="desk.x"
                [attr.y]="desk.y"
                [attr.width]="desk.width"
                [attr.height]="desk.height"
                rx="8"
                [class]="desk.isActive ? 'fill-surface stroke-ink-muted' : 'fill-canvas stroke-line-strong'"
                [attr.stroke-dasharray]="desk.isActive ? null : '4 3'"
                stroke-width="1.5"
              />
              @if (selected()?.key === desk.key) {
                <rect [attr.x]="desk.x - 4" [attr.y]="desk.y - 4" [attr.width]="desk.width + 8" [attr.height]="desk.height + 8" rx="11" class="fill-none stroke-accent" stroke-width="3" />
              }
              <text [attr.x]="desk.x + desk.width / 2" [attr.y]="desk.y + desk.height / 2 + 4" text-anchor="middle" font-size="12" font-weight="700" class="fill-ink">
                {{ desk.label }}
              </text>
            </g>
          }
        </svg>
      </div>
    </div>

    <!-- Outils et enregistrement -->
    <div class="absolute left-4 top-28 z-10 flex w-72 flex-col gap-3 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-pop backdrop-blur-md" role="region" aria-label="Outils d’édition">
      <div>
        <p class="text-sm font-semibold">Édition du plan</p>
        <p class="text-xs text-ink-subtle">Glissez les éléments sur le plan. Pas de {{ grid }} unités.</p>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-xs font-medium">
          Largeur
          <input class="field" type="number" min="100" max="5000" step="10" [value]="draft().width" (change)="onPlanSize('width', $event)" />
        </label>
        <label class="flex flex-col gap-1 text-xs font-medium">
          Hauteur
          <input class="field" type="number" min="100" max="5000" step="10" [value]="draft().height" (change)="onPlanSize('height', $event)" />
        </label>
      </div>

      <div class="flex flex-wrap gap-2">
        <button ui-button variant="secondary" size="sm" type="button" (click)="addDesk()">+ Poste</button>
        <button ui-button variant="secondary" size="sm" type="button" (click)="addZone('room')">+ Salle</button>
        <button ui-button variant="secondary" size="sm" type="button" (click)="addZone('kitchen')">+ Cuisine</button>
        <button ui-button variant="secondary" size="sm" type="button" (click)="addZone('openspace')">+ Espace ouvert</button>
      </div>

      @if (issues().length) {
        <ul class="flex flex-col gap-1 text-xs text-danger" role="alert">
          @for (issue of issues(); track issue) {
            <li>{{ issue }}</li>
          }
        </ul>
      }

      <div class="flex items-center justify-end gap-2">
        <button ui-button variant="secondary" type="button" (click)="cancelled.emit()" [disabled]="saving()">Annuler</button>
        <button ui-button type="button" (click)="save()" [disabled]="!dirty() || issues().length > 0 || saving()">
          {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </div>

    <!-- Propriétés de l'élément sélectionné -->
    @if (selectedZone(); as zone) {
      <aside class="absolute right-4 top-40 z-10 flex w-72 flex-col gap-3 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-pop backdrop-blur-md" aria-label="Propriétés de la zone">
        <p class="text-sm font-semibold">{{ kindLabel[zone.kind] }}</p>
        <label class="flex flex-col gap-1 text-xs font-medium">
          Nom
          <input class="field" maxlength="40" [value]="zone.name" (change)="onZoneName(zone.key, $event)" />
        </label>
        <label class="flex flex-col gap-1 text-xs font-medium">
          Type
          <select class="field" [value]="zone.kind" (change)="onZoneKind(zone.key, $event)">
            <option value="openspace">{{ kindLabel['openspace'] }}</option>
            <option value="room">{{ kindLabel['room'] }}</option>
            <option value="kitchen">{{ kindLabel['kitchen'] }}</option>
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-xs font-medium">
            X
            <input class="field" type="number" step="10" [value]="zone.x" (change)="onZoneNumber(zone.key, 'x', $event)" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium">
            Y
            <input class="field" type="number" step="10" [value]="zone.y" (change)="onZoneNumber(zone.key, 'y', $event)" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium">
            Largeur
            <input class="field" type="number" min="20" step="10" [value]="zone.width" (change)="onZoneNumber(zone.key, 'width', $event)" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium">
            Hauteur
            <input class="field" type="number" min="20" step="10" [value]="zone.height" (change)="onZoneNumber(zone.key, 'height', $event)" />
          </label>
        </div>
        @if (zone.kind !== 'openspace') {
          <label class="flex flex-col gap-1 text-xs font-medium">
            Capacité (personnes)
            <input class="field" type="number" min="1" max="40" [value]="zone.capacity ?? ''" (change)="onZoneNumber(zone.key, 'capacity', $event)" />
          </label>
        }
        <div class="flex justify-end">
          <button ui-button variant="secondary" size="sm" type="button" (click)="removeZone(zone.key)">Supprimer la zone</button>
        </div>
      </aside>
    } @else if (selectedDesk(); as desk) {
      <aside class="absolute right-4 top-40 z-10 flex w-72 flex-col gap-3 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-pop backdrop-blur-md" aria-label="Propriétés du poste">
        <p class="text-sm font-semibold">Poste</p>
        <label class="flex flex-col gap-1 text-xs font-medium">
          Libellé
          <input class="field" maxlength="16" [value]="desk.label" (change)="onDeskLabel(desk.key, $event)" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-xs font-medium">
            X
            <input class="field" type="number" step="10" [value]="desk.x" (change)="onDeskNumber(desk.key, 'x', $event)" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium">
            Y
            <input class="field" type="number" step="10" [value]="desk.y" (change)="onDeskNumber(desk.key, 'y', $event)" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium">
            Largeur
            <input class="field" type="number" min="10" step="10" [value]="desk.width" (change)="onDeskNumber(desk.key, 'width', $event)" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium">
            Hauteur
            <input class="field" type="number" min="10" step="10" [value]="desk.height" (change)="onDeskNumber(desk.key, 'height', $event)" />
          </label>
        </div>
        <label class="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" class="h-4 w-4 accent-accent" [checked]="desk.isActive" (change)="onDeskActive(desk.key, $event)" />
          Poste réservable
        </label>
      </aside>
    }
  `,
})
export class FloorLayoutEditorComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly detail = input.required<FloorDetail>();
  readonly floorId = input.required<string>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly grid = GRID;
  protected readonly kindLabel = ZONE_LABEL;
  protected readonly draft = signal<DraftLayout>({ width: 0, height: 0, zones: [], desks: [] });
  protected readonly selected = signal<{ kind: 'zone' | 'desk'; key: string } | null>(null);
  protected readonly saving = signal(false);

  private baseline: DraftLayout = { width: 0, height: 0, zones: [], desks: [] };
  private counter = 0;
  private dragging: { kind: 'zone' | 'desk'; key: string; offsetX: number; offsetY: number } | null =
    null;

  protected readonly selectedZone = computed(() => {
    const sel = this.selected();
    if (sel?.kind !== 'zone') return null;
    return this.draft().zones.find((z) => z.key === sel.key) ?? null;
  });

  protected readonly selectedDesk = computed(() => {
    const sel = this.selected();
    if (sel?.kind !== 'desk') return null;
    return this.draft().desks.find((d) => d.key === sel.key) ?? null;
  });

  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.baseline));

  /** Problèmes bloquants : affichés et empêchent l'enregistrement. */
  protected readonly issues = computed(() => {
    const d = this.draft();
    const list: string[] = [];
    const zoneNames = d.zones.map((z) => z.name.trim());
    if (zoneNames.some((n) => !n)) list.push('Chaque zone doit avoir un nom.');
    if (new Set(zoneNames).size !== zoneNames.length) list.push('Deux zones portent le même nom.');
    for (const z of d.zones) {
      if (z.x < 0 || z.y < 0 || z.x + z.width > d.width || z.y + z.height > d.height) {
        list.push(`« ${z.name} » sort du plan.`);
      }
    }
    const labels = d.desks.map((x) => x.label.trim());
    if (labels.some((l) => !l)) list.push('Chaque poste doit avoir un libellé.');
    if (new Set(labels).size !== labels.length) list.push('Deux postes portent le même libellé.');
    for (const k of d.desks) {
      if (k.x < 0 || k.y < 0 || k.x + k.width > d.width || k.y + k.height > d.height) {
        list.push(`Le poste ${k.label} sort du plan.`);
      }
    }
    return list;
  });

  ngOnInit(): void {
    this.baseline = fromDetail(this.detail());
    this.draft.set(structuredClone(this.baseline));
  }

  // ----- Ajouts et modifications --------------------------------------------

  protected addDesk(): void {
    const d = this.draft();
    const key = `new:${++this.counter}`;
    const desk: DraftDesk = {
      key,
      id: null,
      label: this.nextDeskLabel(d),
      x: snap((d.width - DESK_SIZE.width) / 2),
      y: snap((d.height - DESK_SIZE.height) / 2),
      width: DESK_SIZE.width,
      height: DESK_SIZE.height,
      isActive: true,
    };
    this.draft.set({ ...d, desks: [...d.desks, desk] });
    this.selected.set({ kind: 'desk', key });
  }

  protected addZone(kind: ZoneKind): void {
    const d = this.draft();
    const size = ZONE_SIZE[kind];
    const key = `new:${++this.counter}`;
    const zone: DraftZone = {
      key,
      name: this.nextZoneName(d, kind),
      kind,
      x: snap((d.width - size.width) / 2),
      y: snap((d.height - size.height) / 2),
      width: size.width,
      height: size.height,
      capacity: kind === 'openspace' ? null : kind === 'kitchen' ? 8 : 4,
    };
    this.draft.set({ ...d, zones: [...d.zones, zone] });
    this.selected.set({ kind: 'zone', key });
  }

  protected removeZone(key: string): void {
    const d = this.draft();
    this.draft.set({ ...d, zones: d.zones.filter((z) => z.key !== key) });
    this.selected.set(null);
  }

  protected onPlanSize(field: 'width' | 'height', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.draft.update((d) => ({ ...d, [field]: Math.min(5000, Math.max(100, Math.round(value))) }));
  }

  protected onZoneName(key: string, event: Event): void {
    this.patchZone(key, { name: (event.target as HTMLInputElement).value });
  }

  protected onZoneKind(key: string, event: Event): void {
    const kind = (event.target as HTMLSelectElement).value as ZoneKind;
    this.patchZone(key, {
      kind,
      capacity: kind === 'openspace' ? null : (this.draft().zones.find((z) => z.key === key)?.capacity ?? 4),
    });
  }

  protected onZoneNumber(key: string, field: ZoneNumberField, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.patchZone(key, { [field]: Math.round(value) });
  }

  protected onDeskLabel(key: string, event: Event): void {
    this.patchDesk(key, { label: (event.target as HTMLInputElement).value });
  }

  protected onDeskNumber(key: string, field: DeskNumberField, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.patchDesk(key, { [field]: Math.round(value) });
  }

  protected onDeskActive(key: string, event: Event): void {
    this.patchDesk(key, { isActive: (event.target as HTMLInputElement).checked });
  }

  // ----- Glisser-déposer ------------------------------------------------------

  protected startDrag(event: PointerEvent, kind: 'zone' | 'desk', key: string): void {
    event.preventDefault();
    const point = this.toPlan(event);
    const item = kind === 'zone' ? this.draft().zones.find((z) => z.key === key) : this.draft().desks.find((d) => d.key === key);
    if (!item) return;
    this.dragging = { kind, key, offsetX: point.x - item.x, offsetY: point.y - item.y };
    this.selected.set({ kind, key });
    this.svg().nativeElement.setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.dragging;
    if (!drag) return;
    const point = this.toPlan(event);
    const d = this.draft();
    if (drag.kind === 'zone') {
      const zone = d.zones.find((z) => z.key === drag.key);
      if (!zone) return;
      const x = this.clamp(snap(point.x - drag.offsetX), 0, d.width - zone.width);
      const y = this.clamp(snap(point.y - drag.offsetY), 0, d.height - zone.height);
      this.patchZone(drag.key, { x, y });
    } else {
      const desk = d.desks.find((k) => k.key === drag.key);
      if (!desk) return;
      const x = this.clamp(snap(point.x - drag.offsetX), 0, d.width - desk.width);
      const y = this.clamp(snap(point.y - drag.offsetY), 0, d.height - desk.height);
      this.patchDesk(drag.key, { x, y });
    }
  }

  protected endDrag(): void {
    this.dragging = null;
  }

  // ----- Enregistrement -------------------------------------------------------

  protected save(): void {
    if (!this.dirty() || this.issues().length > 0 || this.saving()) return;
    const d = this.draft();
    const base = this.baseline;
    const requests: Observable<unknown>[] = [];
    const floorId = this.floorId();

    const layoutChanged =
      d.width !== base.width || d.height !== base.height || JSON.stringify(d.zones) !== JSON.stringify(base.zones);
    if (layoutChanged) {
      requests.push(
        this.http.put(`/api/admin/floors/${floorId}/layout`, {
          width: d.width,
          height: d.height,
          zones: d.zones.map((z) => ({
            name: z.name.trim(),
            kind: z.kind,
            x: z.x,
            y: z.y,
            width: z.width,
            height: z.height,
            ...(z.kind !== 'openspace' && z.capacity !== null ? { capacity: z.capacity } : {}),
          })),
        }),
      );
    }

    for (const desk of d.desks) {
      const body = {
        label: desk.label.trim(),
        x: desk.x,
        y: desk.y,
        width: desk.width,
        height: desk.height,
        isActive: desk.isActive,
      };
      if (desk.id === null) {
        requests.push(
          this.http.post('/api/admin/desks', { ...body, floorId, features: [], reservedTeamId: null }),
        );
        continue;
      }
      const before = base.desks.find((k) => k.id === desk.id);
      if (before && JSON.stringify(before) !== JSON.stringify(desk)) {
        requests.push(this.http.patch(`/api/admin/desks/${desk.id}`, body));
      }
    }

    if (requests.length === 0) {
      this.saved.emit();
      return;
    }
    this.saving.set(true);
    forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('Plan enregistré.');
          this.saved.emit();
        },
        // L'intercepteur affiche le motif (nom en double, salle réservée…). On reste en édition.
        error: () => this.saving.set(false),
      });
  }

  // ----- Outils internes ------------------------------------------------------

  private patchZone(key: string, patch: Partial<DraftZone>): void {
    this.draft.update((d) => ({
      ...d,
      zones: d.zones.map((z) => (z.key === key ? { ...z, ...patch } : z)),
    }));
  }

  private patchDesk(key: string, patch: Partial<DraftDesk>): void {
    this.draft.update((d) => ({
      ...d,
      desks: d.desks.map((k) => (k.key === key ? { ...k, ...patch } : k)),
    }));
  }

  private toPlan(event: PointerEvent): { x: number; y: number } {
    const svg = this.svg().nativeElement;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private nextDeskLabel(d: DraftLayout): string {
    const used = new Set(d.desks.map((k) => k.label.trim()));
    for (let n = 1; ; n++) {
      const label = `P${String(n).padStart(2, '0')}`;
      if (!used.has(label)) return label;
    }
  }

  private nextZoneName(d: DraftLayout, kind: ZoneKind): string {
    const used = new Set(d.zones.map((z) => z.name.trim()));
    for (let n = 1; ; n++) {
      const name = `${ZONE_LABEL[kind]} ${n}`;
      if (!used.has(name)) return name;
    }
  }
}
