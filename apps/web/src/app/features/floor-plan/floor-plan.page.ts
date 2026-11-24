import type { OverlayRef } from '@angular/cdk/overlay';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { HttpClient } from '@angular/common/http';
import type { ComponentRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewContainerRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';
import { formatDayFr, todayIso, workdaysFrom } from '../../core/dates';
import type {
  Availability,
  FloorDetail,
  FloorSummary,
  HalfInput,
  Settings,
} from '../../core/models';
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

type ViewMode = 'plan' | 'list';
const MOBILE_QUERY = '(max-width: 767px)';

/** Couleurs de remplissage par état. L'état est aussi porté par le symbole et le motif. */
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

@Component({
  selector: 'app-floor-plan-page',
  imports: [EmptyStateComponent, ButtonComponent, BadgeComponent],
  templateUrl: './floor-plan.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloorPlanPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly overlay = inject(Overlay);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly DESK_STATE_META = DESK_STATE_META;

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

  protected readonly viewMode = signal<ViewMode>(
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches ? 'list' : 'plan',
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

  // Popover.
  private overlayRef: OverlayRef | null = null;
  private popoverRef: ComponentRef<DeskPopoverComponent> | null = null;
  private popoverOrigin: HTMLElement | null = null;
  protected readonly bookingBusy = signal(false);
  protected readonly activeDeskId = signal<string | null>(null);

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
  protected readonly freeCount = computed(
    () => this.desks().filter((d) => d.state === 'FREE' || d.state === 'PARTIAL').length,
  );

  private readonly reloadDetail$ = toObservable(this.floorId).pipe(
    filter((id): id is string => id !== null),
    tap(() => this.detail.set(null)),
    switchMap((id) =>
      this.http.get<FloorDetail>(`/api/floors/${id}`).pipe(catchError(() => EMPTY)),
    ),
    takeUntilDestroyed(),
  );

  private readonly reloadAvailability$ = toObservable(
    computed(() => ({
      floorId: this.floorId(),
      date: this.date(),
      version: this.refreshVersion(),
    })),
  ).pipe(
    filter(
      (s): s is { floorId: string; date: string; version: number } =>
        s.floorId !== null && s.date !== null,
    ),
    tap(() => {
      this.loading.set(true);
      this.loadError.set(false);
    }),
    switchMap((s) =>
      this.http
        .get<Availability>(`/api/floors/${s.floorId}/availability`, { params: { date: s.date } })
        .pipe(
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
    this.reloadDetail$.subscribe((detail) => this.detail.set(detail));
    this.reloadAvailability$.subscribe((availability) => {
      this.availability.set(availability);
      this.loading.set(false);
    });
    this.destroyRef.onDestroy(() => this.closePopover(false));
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

  protected resetFilters(): void {
    this.onlyFree.set(false);
    this.equipmentFilter.set('');
    this.zoneFilter.set('');
  }

  protected selectFloor(id: string): void {
    this.closePopover(false);
    this.selectedFloorId.set(id);
  }

  protected selectDate(iso: string): void {
    this.closePopover(false);
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

  protected openFromPlan(desk: DeskView, event: Event): void {
    this.openPopover(desk, event.currentTarget as HTMLElement);
  }

  protected onDeskKeydown(desk: DeskView, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openPopover(desk, event.currentTarget as HTMLElement);
    }
  }

  private openPopover(desk: DeskView, origin: HTMLElement): void {
    this.closePopover(false);
    this.popoverOrigin = origin;
    this.activeDeskId.set(desk.id);

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withPositions([
        { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
        { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
      ])
      .withPush(true)
      .withViewportMargin(12);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });
    this.overlayRef.backdropClick().subscribe(() => this.closePopover());
    this.overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') this.closePopover();
    });

    this.popoverRef = this.overlayRef.attach(
      new ComponentPortal(DeskPopoverComponent, this.viewContainer),
    );
    this.popoverRef.setInput('desk', desk);
    this.popoverRef.setInput('dateLabel', this.dateLabel());
    this.popoverRef.instance.bookRequested.subscribe((half) => this.book(desk, half));
    this.popoverRef.instance.closeRequested.subscribe(() => this.closePopover());
  }

  private closePopover(restoreFocus = true): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.popoverRef = null;
    this.activeDeskId.set(null);
    if (restoreFocus) this.popoverOrigin?.focus();
    this.popoverOrigin = null;
  }

  private book(desk: DeskView, half: HalfInput): void {
    const date = this.date();
    if (!date) return;
    this.bookingBusy.set(true);
    this.popoverRef?.setInput('busy', true);

    this.http
      .post('/api/bookings', { deskId: desk.id, date, half })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.bookingBusy.set(false);
          const what = half === 'FULL' ? 'la journée' : half === 'AM' ? 'le matin' : 'l’après-midi';
          this.toast.success(`Poste ${desk.label} réservé ${what}, ${formatDayFr(date)}.`);
          this.closePopover();
          this.refreshVersion.update((v) => v + 1);
        },
        error: () => {
          // L'intercepteur a déjà affiché le message d'erreur métier.
          this.bookingBusy.set(false);
          this.popoverRef?.setInput('busy', false);
        },
      });
  }
}
