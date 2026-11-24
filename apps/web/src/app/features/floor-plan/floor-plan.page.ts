import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { EMPTY, catchError, combineLatest, filter, forkJoin, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { formatDayFr, formatShortDayFr, todayIso, workdaysFrom } from '../../core/dates';
import type {
  Availability,
  FloorDetail,
  FloorSummary,
  HalfAvailability,
  HalfInput,
  HalfKey,
  Settings,
} from '../../core/models';
import { LayoutService } from '../../core/layout/layout.service';
import { navItemsFor } from '../../core/layout/nav';
import { ToastService } from '../../core/notifications/toast.service';
import { EmptyStateComponent } from '../../shared/ui/feedback.components';
import { ButtonComponent } from '../../shared/ui/button.component';
import type { BadgeTone } from '../../shared/ui/badge.component';
import { BadgeComponent } from '../../shared/ui/badge.component';
import type { DeskState } from './desk-status';
import { DESK_STATE_META } from './desk-status';
import { DeskPopoverComponent } from './desk-popover.component';
import type { DeskView } from './desk-view';
import { buildDeskView } from './desk-view';
import type {
  ResourceState,
  SceneDesk,
  ScenePick,
  SceneRoom,
  SceneVehicle,
} from './scene3d/office-scene';
import { ResourcePanelComponent } from './resource-panel.component';
import { FloorScene3dComponent } from './scene3d/floor-scene-3d.component';

type ViewMode = 'plan' | '3d' | 'list';

/** Disponibilité des véhicules de fonction (tous étages : parc unique). */
interface VehiclesResponse {
  date: string;
  viewer: Record<HalfKey, boolean>;
  vehicles: {
    id: string;
    name: string;
    plate: string;
    halves: Record<HalfKey, HalfAvailability>;
  }[];
}

/** Disponibilité des salles de réunion d'un étage. */
interface RoomsResponse {
  date: string;
  viewer: Record<HalfKey, boolean>;
  rooms: {
    id: string;
    name: string;
    zoneName: string;
    capacity: number;
    halves: Record<HalfKey, HalfAvailability>;
  }[];
}

type ResourceSelection = { kind: 'vehicle' | 'room'; id: string };

/** Résumé d'une ressource pour la scène : libre, partielle, à moi, ou réservée. */
function summaryState(halves: Record<HalfKey, HalfAvailability>): ResourceState {
  const am = halves.AM.status;
  const pm = halves.PM.status;
  if (am === 'MINE' || pm === 'MINE') return 'MINE';
  if (am === 'FREE' && pm === 'FREE') return 'FREE';
  if (am === 'FREE' || pm === 'FREE') return 'PARTIAL';
  return 'BOOKED';
}

const MOBILE_QUERY = '(max-width: 767px)';

/** Couleurs de remplissage par état pour la vue plan. L'état est aussi porté par le symbole et le motif. */
const DESK_CLASS: Record<DeskState, string> = {
  FREE: 'fill-surface stroke-ink-muted',
  PARTIAL: 'fill-surface stroke-accent',
  MINE: 'fill-accent stroke-accent-ink',
  BOOKED: 'fill-line stroke-ink-subtle',
  TEAM_RESERVED: 'fill-warn-soft stroke-warn-ink',
  UNAVAILABLE: 'fill-canvas stroke-line-strong',
};

const DESK_DASH: Partial<Record<DeskState, string>> = {
  PARTIAL: '6 4',
  TEAM_RESERVED: '3 3',
};

const DESK_TONE: Record<DeskState, BadgeTone> = {
  FREE: 'success',
  PARTIAL: 'accent',
  MINE: 'accent',
  BOOKED: 'neutral',
  TEAM_RESERVED: 'warn',
  UNAVAILABLE: 'danger',
};

/**
 * Plan d'étage en mode immersif : la scène occupe tout l'écran, et les éléments d'interface
 * (navigation, chiffres, détail du poste, dates, légende) flottent par-dessus.
 */
@Component({
  selector: 'app-floor-plan-page',
  imports: [
    EmptyStateComponent,
    ButtonComponent,
    BadgeComponent,
    FloorScene3dComponent,
    DeskPopoverComponent,
    ResourcePanelComponent,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './floor-plan.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloorPlanPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly DESK_STATE_META = DESK_STATE_META;
  protected readonly user = this.auth.user;
  protected readonly nav = computed(() => navItemsFor(this.auth.role()));

  // Réglages et étages (une seule fois).
  protected readonly settings = toSignal(this.http.get<Settings>('/api/settings'));
  protected readonly floors = toSignal(this.http.get<FloorSummary[]>('/api/floors'), {
    initialValue: [] as FloorSummary[],
  });

  protected readonly dateOptions = computed(() => {
    const settings = this.settings();
    if (!settings) return [];
    return workdaysFrom(todayIso(), settings.maxAdvanceDays);
  });

  // Sélection utilisateur ; null = valeur par défaut calculée.
  private readonly selectedFloorId = signal<string | null>(null);
  private readonly selectedDate = signal<string | null>(null);
  protected readonly floorId = computed(
    () => this.selectedFloorId() ?? this.floors()[0]?.id ?? null,
  );
  protected readonly date = computed(() => this.selectedDate() ?? this.dateOptions()[0] ?? null);

  // Vue 3D par défaut sur ordinateur ; liste sur mobile.
  protected readonly viewMode = signal<ViewMode>(
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches ? 'list' : '3d',
  );

  // Chargement du plan et des disponibilités.
  protected readonly detail = signal<FloorDetail | null>(null);
  protected readonly availability = signal<Availability | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  private readonly refreshVersion = signal(0);

  // Filtres de la vue liste.
  protected readonly onlyFree = signal(false);
  protected readonly equipmentFilter = signal('');
  protected readonly zoneFilter = signal('');

  // Poste sélectionné (panneau de détail) et réservation en cours.
  protected readonly selectedDeskId = signal<string | null>(null);
  protected readonly selectedResource = signal<ResourceSelection | null>(null);
  protected readonly vehiclesAvail = signal<VehiclesResponse | null>(null);
  protected readonly roomsAvail = signal<RoomsResponse | null>(null);
  protected readonly bookingBusy = signal(false);

  protected readonly desks = computed<DeskView[]>(() => {
    const detail = this.detail();
    const availability = this.availability();
    if (!detail || !availability) return [];
    const byId = new Map(availability.desks.map((d) => [d.id, d]));
    const zones = detail.zones;
    return detail.desks.flatMap((geometry) => {
      const avail = byId.get(geometry.id);
      if (!avail) return [];
      const cx = geometry.x + geometry.width / 2;
      const cy = geometry.y + geometry.height / 2;
      const zone = zones.find(
        (z) => cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height,
      );
      return [buildDeskView(geometry, avail, zone?.name ?? 'Hors zone')];
    });
  });

  protected readonly deskById = computed(() => new Map(this.desks().map((d) => [d.id, d])));
  protected readonly selectedDesk = computed(() => {
    const id = this.selectedDeskId();
    return id ? (this.deskById().get(id) ?? null) : null;
  });

  /** Postes tels qu'attendus par la scène 3D (géométrie et état). */
  protected readonly sceneVehicles = computed<SceneVehicle[]>(() =>
    (this.vehiclesAvail()?.vehicles ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      state: summaryState(v.halves),
    })),
  );

  protected readonly sceneRooms = computed<SceneRoom[]>(() =>
    (this.roomsAvail()?.rooms ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      zoneName: r.zoneName,
      state: summaryState(r.halves),
    })),
  );

  protected readonly selectedVehicle = computed(() => {
    const sel = this.selectedResource();
    if (sel?.kind !== 'vehicle') return null;
    return this.vehiclesAvail()?.vehicles.find((v) => v.id === sel.id) ?? null;
  });

  protected readonly selectedRoom = computed(() => {
    const sel = this.selectedResource();
    if (sel?.kind !== 'room') return null;
    return this.roomsAvail()?.rooms.find((r) => r.id === sel.id) ?? null;
  });

  protected readonly resourceViewer = computed<Record<HalfKey, boolean>>(() => {
    const sel = this.selectedResource();
    const source = sel?.kind === 'room' ? this.roomsAvail() : this.vehiclesAvail();
    return source?.viewer ?? { AM: false, PM: false };
  });

  protected readonly sceneDesks = computed<SceneDesk[]>(() =>
    this.desks().map((d) => ({
      id: d.id,
      label: d.label,
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      state: d.state,
      isActive: d.availability.isActive,
    })),
  );

  /** Chiffres affichés en cartes flottantes. */
  protected readonly kpis = computed(() => {
    const desks = this.desks();
    const active = desks.filter((d) => d.state !== 'UNAVAILABLE');
    const free = active.filter((d) => d.state === 'FREE' || d.state === 'PARTIAL').length;
    const occupied = active.length - free;
    const occupancy = active.length ? Math.round((occupied / active.length) * 100) : 0;
    return { total: desks.length, active: active.length, free, occupancy };
  });

  protected readonly zoneOptions = computed(() =>
    [...new Set(this.desks().map((d) => d.zone))].sort(),
  );
  protected readonly equipmentOptions = computed(() =>
    [...new Set(this.desks().flatMap((d) => d.features))].sort(),
  );

  protected readonly visibleDesks = computed(() =>
    this.desks().filter((d) => {
      if (this.onlyFree() && d.state !== 'FREE' && d.state !== 'PARTIAL') return false;
      if (this.equipmentFilter() && !d.features.includes(this.equipmentFilter())) return false;
      if (this.zoneFilter() && d.zone !== this.zoneFilter()) return false;
      return true;
    }),
  );

  protected readonly floorName = computed(
    () => this.floors().find((f) => f.id === this.floorId())?.name ?? '',
  );
  protected readonly dateLabel = computed(() => {
    const date = this.date();
    return date ? formatDayFr(date) : '';
  });
  protected readonly viewerHalves = computed(
    () => this.availability()?.viewer ?? { AM: false, PM: false },
  );

  /**
   * Étage et disponibilités chargés ensemble : la scène reçoit toujours des données cohérentes.
   * Les anciennes données restent affichées pendant le chargement (pas de squelette en plein milieu
   * d'une transition entre étages).
   */
  private readonly loadFloor$ = combineLatest({
    floorId: toObservable(this.floorId),
    date: toObservable(this.date),
    version: toObservable(this.refreshVersion),
  }).pipe(
    filter(
      (s): s is { floorId: string; date: string; version: number } =>
        s.floorId !== null && s.date !== null,
    ),
    tap(() => {
      this.loading.set(true);
      this.loadError.set(false);
    }),
    switchMap((s) =>
      forkJoin({
        detail: this.http.get<FloorDetail>(`/api/floors/${s.floorId}`),
        vehicles: this.http.get<VehiclesResponse>('/api/vehicles/availability', {
          params: { date: s.date },
        }),
        rooms: this.http.get<RoomsResponse>('/api/rooms/availability', {
          params: { date: s.date, floorId: s.floorId },
        }),
        availability: this.http.get<Availability>(`/api/floors/${s.floorId}/availability`, {
          params: { date: s.date },
        }),
      }).pipe(
        catchError(() => {
          this.loadError.set(true);
          this.loading.set(false);
          return EMPTY;
        }),
      ),
    ),
    takeUntilDestroyed(),
  );

  constructor() {
    // Mode immersif : la coque masque sa sidebar et sa barre de titre tant que cette page est affichée.
    this.layout.setImmersive(true);
    this.destroyRef.onDestroy(() => this.layout.setImmersive(false));

    this.loadFloor$.subscribe(({ detail, availability, vehicles, rooms }) => {
      this.detail.set(detail);
      this.availability.set(availability);
      this.vehiclesAvail.set(vehicles);
      this.roomsAvail.set(rooms);
      this.loading.set(false);
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.clearSelection();
  }

  protected readonly stateKeys: DeskState[] = [
    'FREE',
    'PARTIAL',
    'MINE',
    'BOOKED',
    'TEAM_RESERVED',
    'UNAVAILABLE',
  ];

  protected deskClass(state: DeskState): string {
    return DESK_CLASS[state];
  }

  protected deskDash(state: DeskState): string | null {
    return DESK_DASH[state] ?? null;
  }

  protected deskTone(state: DeskState): BadgeTone {
    return DESK_TONE[state];
  }

  /** Texte d'info-bulle : nomme le titulaire de chaque demi-journée occupée. */
  protected hoverText(desk: DeskView): string {
    const { AM, PM } = desk.availability.halves;
    const part = (label: string, status: typeof AM): string => {
      if (status.status === 'FREE') return '';
      return `${label} : ${status.status === 'MINE' ? 'vous' : status.holder}`;
    };
    return [desk.ariaLabel, part('matin', AM), part('après-midi', PM)].filter(Boolean).join(' · ');
  }

  protected dayLabel(iso: string): string {
    return formatDayFr(iso);
  }

  protected shortDayLabel(iso: string): string {
    return formatShortDayFr(iso);
  }

  protected resetFilters(): void {
    this.onlyFree.set(false);
    this.equipmentFilter.set('');
    this.zoneFilter.set('');
  }

  protected selectFloor(id: string): void {
    this.clearSelection();
    this.selectedFloorId.set(id);
  }

  protected selectDate(iso: string): void {
    this.clearSelection();
    this.selectedDate.set(iso);
  }

  protected setView(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  protected toggleOnlyFree(checked: boolean): void {
    this.onlyFree.set(checked);
  }

  protected setEquipment(value: string): void {
    this.equipmentFilter.set(value);
  }

  protected setZone(value: string): void {
    this.zoneFilter.set(value);
  }

  protected retry(): void {
    this.refreshVersion.update((v) => v + 1);
  }

  /** Sélection d'un poste (clic, Entrée, ou clic dans la scène 3D) : ouvre le panneau de détail. */
  protected select(desk: DeskView): void {
    this.selectedResource.set(null);
    this.selectedDeskId.set(desk.id);
  }

  protected clearSelection(): void {
    this.selectedDeskId.set(null);
    this.selectedResource.set(null);
  }

  protected openFromPlan(desk: DeskView): void {
    this.select(desk);
  }

  protected onDeskKeydown(desk: DeskView, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(desk);
    }
  }

  /** Clic dans la scène 3D : poste, véhicule ou salle. */
  protected onScenePick(pick: ScenePick): void {
    if (pick.kind === 'desk') {
      const desk = this.deskById().get(pick.id);
      if (desk) this.select(desk);
      return;
    }
    this.selectedDeskId.set(null);
    this.selectedResource.set({ kind: pick.kind, id: pick.id });
  }

  /** Réservation du véhicule ou de la salle sélectionné(e), pour une demi-journée ou la journée. */
  protected bookSelectedResource(half: HalfInput): void {
    const sel = this.selectedResource();
    const date = this.date();
    if (!sel || !date) return;
    const isVehicle = sel.kind === 'vehicle';
    const url = isVehicle ? '/api/vehicle-bookings' : '/api/room-bookings';
    const body = isVehicle ? { vehicleId: sel.id, date, half } : { roomId: sel.id, date, half };
    const label = isVehicle ? this.selectedVehicle()?.name : this.selectedRoom()?.name;
    const what = half === 'FULL' ? 'la journée' : half === 'AM' ? 'le matin' : 'l’après-midi';

    this.bookingBusy.set(true);
    this.http
      .post(url, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.bookingBusy.set(false);
          this.toast.success(
            `${label ?? 'Ressource'} réservé${isVehicle ? '' : 'e'} ${what}, ${formatDayFr(date)}.`,
          );
          this.refreshVersion.update((v) => v + 1);
        },
        // L'intercepteur affiche le motif métier (créneau pris, quota…).
        error: () => this.bookingBusy.set(false),
      });
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => {
      void this.router.navigate(['/connexion']);
    });
  }

  protected book(desk: DeskView, half: HalfInput): void {
    const date = this.date();
    if (!date) return;
    this.bookingBusy.set(true);

    this.http
      .post('/api/bookings', { deskId: desk.id, date, half })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.bookingBusy.set(false);
          const what = half === 'FULL' ? 'la journée' : half === 'AM' ? 'le matin' : 'l’après-midi';
          this.toast.success(`Poste ${desk.label} réservé ${what}, ${formatDayFr(date)}.`);
          this.refreshVersion.update((v) => v + 1);
        },
        error: () => {
          // L'intercepteur a déjà affiché le message d'erreur métier.
          this.bookingBusy.set(false);
        },
      });
  }
}
