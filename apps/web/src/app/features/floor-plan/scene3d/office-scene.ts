import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FloorDetail } from '../../../core/models';
import type { DeskState } from '../desk-status';

/**
 * Scène 3D de l'étage (Three.js, WebGL). Module chargé à la demande.
 * Modèles : Kenney (CC0), dans `public/3d/`. Voir `public/3d/LICENSES.md`.
 *
 * Échelle : 1 unité monde = 50 px du plan. Le plan est posé à plat, la hauteur est l'axe Y.
 */

/** Unités monde par pixel du plan. */
const S = 0.02;
/** Écart vertical entre étages lors de la transition. */
const FLOOR_GAP = 4;
const TRANSITION_MS = 700;
const VIEW_MS = 650;

const DESK_COLOR: Record<DeskState, number> = {
  FREE: 0x2f9e6b,
  PARTIAL: 0x2f54c6,
  MINE: 0x2f54c6,
  BOOKED: 0x8a94a6,
  TEAM_RESERVED: 0xd98a1c,
  UNAVAILABLE: 0xc3cad6,
};

/** États d'une ressource (véhicule ou salle) : résumé des deux demi-journées. */
export type ResourceState = 'FREE' | 'PARTIAL' | 'MINE' | 'BOOKED';

const RESOURCE_COLOR: Record<ResourceState, number> = {
  FREE: 0x2f9e6b,
  PARTIAL: 0x2f54c6,
  MINE: 0x1e3f9e,
  BOOKED: 0x8a94a6,
};

const PALETTE = {
  ground: 0xa9d18e,
  openspace: 0xf7f9fc,
  roomCarpet: 0xe4ecf7,
  kitchenTile: 0xf1f5f9,
  wall: 0xf8fafc,
  wallInner: 0xeef3fa,
  roof: 0x2f54c6,
  asphalt: 0xc3cfdf,
  paint: 0xffffff,
  curb: 0xb9c6d8,
  shadowLight: 0xfff4e6,
  hemiSky: 0xffffff,
  hemiGround: 0xc9d3e0,
};

const WALL_HIGH = 2.6;
const WALL_LOW = 0.45;
const WALL_T = 0.14;
/** Pièces redimensionnables : tolérance de détection du bord (unités du plan) et taille minimale. */
const EDGE_TOLERANCE = 12;
const RESIZE_GRID = 10;
const MIN_ZONE = 20;

/** Rectangle d'une zone, en unités du plan. */
export interface ZoneRect {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeEdge = 'n' | 's' | 'e' | 'w';

interface ResizeState {
  edge: ResizeEdge;
  start: ZoneRect;
  current: ZoneRect;
  line: THREE.LineLoop;
}

function snapPlan(value: number): number {
  return Math.round(value / RESIZE_GRID) * RESIZE_GRID;
}

function clampPlan(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SITE_MARGIN = 4;
const SLOT_W = 2.2;

export interface SceneDesk {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  state: DeskState;
  isActive: boolean;
}

export interface SceneVehicle {
  id: string;
  name: string;
  state: ResourceState;
}

export interface SceneRoom {
  id: string;
  name: string;
  zoneName: string;
  state: ResourceState;
}

/** Élément désigné dans la scène. */
export interface ScenePick {
  kind: 'desk' | 'vehicle' | 'room';
  id: string;
}

export type SceneView = 'iso' | 'top';

type ModelName =
  | 'desk'
  | 'chair-desk'
  | 'chair'
  | 'chair-modern'
  | 'monitor'
  | 'plant'
  | 'plant-small'
  | 'table-round'
  | 'table-coffee'
  | 'kitchen-cabinet'
  | 'fridge'
  | 'kitchen-bar'
  | 'bookcase'
  | 'sofa'
  | 'coat-rack'
  | 'trashcan'
  | 'lamp-floor'
  | 'rug'
  | 'stool'
  | 'tree-default'
  | 'tree-oak'
  | 'tree-fat'
  | 'tree-pine'
  | 'tree-simple'
  | 'bush-large'
  | 'car-sedan'
  | 'car-suv'
  | 'car-hatch'
  | 'car-van'
  | 'car-taxi'
  | 'car-sports';

/** Chemin de chaque modèle, relatif à `public/`. */
const MODEL_PATH: Record<ModelName, string> = {
  desk: '3d/office/desk.glb',
  'chair-desk': '3d/office/chair-desk.glb',
  chair: '3d/office/chair.glb',
  'chair-modern': '3d/office/chair-modern.glb',
  monitor: '3d/office/monitor.glb',
  plant: '3d/office/plant.glb',
  'plant-small': '3d/office/plant-small.glb',
  'table-round': '3d/office/table-round.glb',
  'table-coffee': '3d/office/table-coffee.glb',
  'kitchen-cabinet': '3d/office/kitchen-cabinet.glb',
  fridge: '3d/office/fridge.glb',
  'kitchen-bar': '3d/office/kitchen-bar.glb',
  bookcase: '3d/office/bookcase.glb',
  sofa: '3d/office/sofa.glb',
  'coat-rack': '3d/office/coat-rack.glb',
  trashcan: '3d/office/trashcan.glb',
  'lamp-floor': '3d/office/lamp-floor.glb',
  rug: '3d/office/rug.glb',
  stool: '3d/office/stool.glb',
  'tree-default': '3d/nature/tree-default.glb',
  'tree-oak': '3d/nature/tree-oak.glb',
  'tree-fat': '3d/nature/tree-fat.glb',
  'tree-pine': '3d/nature/tree-pine.glb',
  'tree-simple': '3d/nature/tree-simple.glb',
  'bush-large': '3d/nature/bush-large.glb',
  'car-sedan': '3d/parking/sedan.glb',
  'car-suv': '3d/parking/suv.glb',
  'car-hatch': '3d/parking/hatchback-sports.glb',
  'car-van': '3d/parking/van.glb',
  'car-taxi': '3d/parking/taxi.glb',
  'car-sports': '3d/parking/sedan-sports.glb',
};

const MODEL_NAMES = Object.keys(MODEL_PATH) as ModelName[];
const CAR_MODELS: ModelName[] = [
  'car-sedan',
  'car-suv',
  'car-sports',
  'car-hatch',
  'car-van',
  'car-taxi',
];
const CAR_COLORS = [0xf8fafc, 0x2f54c6, 0x9aa5b5, 0x1e293b];

/** Couleur du mobilier selon sa nature, pour rester dans la palette bleu et blanc de l'interface. */
function furnitureColor(name: ModelName): number | null {
  switch (name) {
    case 'chair':
    case 'chair-desk':
    case 'chair-modern':
    case 'stool':
      return 0x2f54c6;
    case 'monitor':
      return 0x1e293b;
    case 'desk':
      return 0xb9cdf2;
    case 'plant':
    case 'plant-small':
    case 'bush-large':
      return 0x58b36c;
    case 'tree-default':
    case 'tree-oak':
    case 'tree-fat':
    case 'tree-pine':
    case 'tree-simple':
      return 0x6fbf7a;
    case 'trashcan':
    case 'coat-rack':
    case 'lamp-floor':
      return 0xcbd5e1;
    case 'car-sedan':
    case 'car-suv':
    case 'car-hatch':
    case 'car-van':
    case 'car-taxi':
    case 'car-sports':
      return null; // Carrosserie : la texture d'origine est conservée.
    default:
      return 0xf8fafc;
  }
}

function isCar(name: ModelName): boolean {
  return name.startsWith('car-');
}

/**
 * Lisse un maillage à facettes : recalcule les normales sur les sommets partagés, pour un
 * rendu moins anguleux sans ajouter de polygones.
 */
function smoothGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const copy = geometry.clone();
  copy.deleteAttribute('normal');
  const merged = mergeVertices(copy, 1e-3);
  merged.computeVertexNormals();
  return merged;
}

type Tween = { start: number; duration: number; step: (t: number) => void; done?: () => void };

/** Ease in-out cubique. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function pickKey(pick: ScenePick): string {
  return `${pick.kind}:${pick.id}`;
}

export class OfficeScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly models = new Map<ModelName, THREE.Group>();
  private readonly materials = new Map<number, THREE.MeshStandardMaterial>();
  /** Repères au sol (postes, véhicules, salles), par clé « genre:identifiant ». */
  private readonly markers = new Map<string, THREE.Mesh>();
  private hitboxes: THREE.Mesh[] = [];
  private siteHitboxes: THREE.Mesh[] = [];
  private hovered: string | null = null;
  private frame = 0;
  private width = 1;
  private height = 1;
  private floorGroup: THREE.Group | null = null;
  private siteGroup: THREE.Group | null = null;
  private floorId: string | null = null;
  private builtSignature = '';
  private siteKey = '';
  private buildingW = 0;
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private resizeState: ResizeState | null = null;
  /** Corps teinté de chaque poste (le bureau change de couleur selon son état). */
  private readonly bodies = new Map<string, THREE.Object3D>();
  /** Moquette ou carrelage de chaque salle et cuisine (teinte selon l'état de la salle). */
  private readonly zoneFloors = new Map<string, THREE.Mesh>();
  private buildingH = 0;
  private detail: FloorDetail | null = null;
  private tweens: Tween[] = [];
  private lastTime = 0;

  private constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 800);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 3.2;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.requestRender());

    this.scene.background = new THREE.Color(0xeaf1fa);
    this.scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.6));
    const sun = new THREE.DirectionalLight(PALETTE.shadowLight, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -40;
    c.right = 40;
    c.top = 40;
    c.bottom = -40;
    c.near = 1;
    c.far = 160;
    sun.shadow.bias = -0.0005;
    sun.position.set(-12, 30, 14);
    this.scene.add(sun);
  }

  /** Charge les modèles puis crée la scène. Les échecs de chargement sont propagés. */
  static async create(canvas: HTMLCanvasElement): Promise<OfficeScene> {
    const instance = new OfficeScene(canvas);
    await instance.loadModels();
    return instance;
  }

  /**
   * Met la scène à jour selon l'étage et les états :
   * - changement d'étage : transition animée (l'étage sort, le nouveau monte) ;
   * - liste des éléments modifiée : reconstruction sans animation ;
   * - sinon : simple mise à jour des états.
   */
  update(
    detail: FloorDetail,
    desks: readonly SceneDesk[],
    vehicles: readonly SceneVehicle[],
    rooms: readonly SceneRoom[],
  ): void {
    const signature = [
      `${detail.width}x${detail.height}|${JSON.stringify(detail.zones)}`,
      desks
        .map((d) => `${d.id}:${d.x},${d.y},${d.width},${d.height},${d.isActive}`)
        .sort()
        .join(','),
      vehicles
        .map((v) => v.id)
        .sort()
        .join(','),
      rooms
        .map((r) => r.id)
        .sort()
        .join(','),
    ].join('|');
    if (detail.id !== this.floorId) {
      this.transitionTo(detail, desks, vehicles, rooms, signature);
    } else if (signature !== this.builtSignature) {
      this.buildFloor(detail, desks, vehicles, rooms, signature);
      this.frameCamera(detail);
    } else {
      this.setStates(desks, vehicles, rooms);
    }
    this.requestRender();
  }

  /** Met à jour les états des repères sans reconstruire la scène. */
  setStates(
    desks: readonly SceneDesk[],
    vehicles: readonly SceneVehicle[],
    rooms: readonly SceneRoom[],
  ): void {
    for (const desk of desks) {
      const body = this.bodies.get(pickKey({ kind: 'desk', id: desk.id }));
      if (body) this.tintAll(body, DESK_COLOR[desk.state]);
    }
    for (const v of vehicles) {
      this.paint(pickKey({ kind: 'vehicle', id: v.id }), RESOURCE_COLOR[v.state], 0.9);
    }
    for (const r of rooms) {
      this.paintZoneFloor(r.zoneName, r.state);
    }
    this.requestRender();
  }

  setView(view: SceneView): void {
    if (!this.detail) return;
    const center = this.center();
    const distance = 60;
    const to =
      view === 'top'
        ? new THREE.Vector3(center.x, distance, center.z + 0.001)
        : new THREE.Vector3(center.x + distance * 0.7, distance * 0.75, center.z + distance * 0.7);
    this.tweenCamera(to, center);
  }

  /** Zoom multiplicatif (au-dessus de 1 = plus proche). */
  zoomBy(factor: number): void {
    this.camera.zoom = Math.min(
      this.controls.maxZoom,
      Math.max(this.controls.minZoom, this.camera.zoom * factor),
    );
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setSize(this.width, this.height, false);
    const half = this.viewHalfSize();
    const aspect = this.width / this.height;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Désigne l'élément sous le pointeur (poste, véhicule ou salle). */
  pick(clientX: number, clientY: number): ScenePick | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.hitboxes, ...this.siteHitboxes], false)[0];
    return (hit?.object.userData['pick'] as ScenePick | undefined) ?? null;
  }

  /** Survol : met en évidence le poste sous le pointeur. Retourne true si le survol a changé. */
  hover(clientX: number, clientY: number): boolean {
    const pick = this.pick(clientX, clientY);
    const key = pick ? pickKey(pick) : null;
    if (key === this.hovered) return false;
    if (this.hovered && this.hovered.startsWith('desk:'))
      this.markers.get(this.hovered)?.scale.set(1, 1, 1);
    this.hovered = key;
    if (key && key.startsWith('desk:')) this.markers.get(key)?.scale.set(1.12, 1.12, 1.12);
    this.requestRender();
    return true;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) (obj as THREE.Mesh<THREE.BufferGeometry>).geometry.dispose();
    });
  }

  // ----- Cycle de rendu -----------------------------------------------------

  private requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  private tick(time: number): void {
    this.frame = 0;
    const dt = this.lastTime ? time - this.lastTime : 16;
    this.lastTime = time;
    this.controls.update(dt / 1000);
    this.tweens = this.tweens.filter((tw) => {
      const t = Math.min(1, (time - tw.start) / tw.duration);
      tw.step(ease(t));
      if (t >= 1) {
        tw.done?.();
        return false;
      }
      return true;
    });
    this.renderer.render(this.scene, this.camera);
    if (this.tweens.length > 0) this.requestRender();
  }

  private addTween(duration: number, step: (t: number) => void, done?: () => void): void {
    this.tweens.push({ start: performance.now(), duration, step, done });
    this.requestRender();
  }

  // ----- Caméra -------------------------------------------------------------

  private center(): THREE.Vector3 {
    const w = (this.detail?.width ?? 1000) * S;
    const d = (this.detail?.height ?? 560) * S;
    return new THREE.Vector3(w / 2, 0, d / 2 + 2);
  }

  private viewHalfSize(): number {
    const w = (this.detail?.width ?? 1000) * S;
    const d = (this.detail?.height ?? 560) * S;
    return Math.max(w, d) * 0.56;
  }

  private frameCamera(detail: FloorDetail): void {
    const c = new THREE.Vector3((detail.width * S) / 2, 0, (detail.height * S) / 2 + 2);
    this.controls.target.copy(c);
    this.camera.position.set(c.x + 30, 30, c.z + 30);
    this.camera.zoom = 1;
    this.camera.lookAt(c);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private tweenCamera(to: THREE.Vector3, target: THREE.Vector3): void {
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    this.addTween(VIEW_MS, (t) => {
      this.camera.position.lerpVectors(fromPos, to, t);
      this.controls.target.lerpVectors(fromTarget, target, t);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
    });
  }

  // ----- Étages -------------------------------------------------------------

  private transitionTo(
    detail: FloorDetail,
    desks: readonly SceneDesk[],
    vehicles: readonly SceneVehicle[],
    rooms: readonly SceneRoom[],
    signature: string,
  ): void {
    const previous = this.floorGroup;
    this.detail = detail;
    this.floorId = detail.id;
    this.builtSignature = signature;
    this.ensureSite(detail, vehicles);

    const incoming = this.buildFloorGroup(detail, desks, rooms);
    incoming.position.y = FLOOR_GAP;
    this.scene.add(incoming);
    this.floorGroup = incoming;
    this.hitboxes = this.collectHitboxes(incoming);
    this.frameCamera(detail);

    // L'étage précédent reste en place ; le nouveau descend et se pose dessus (accélération puis atterrissage doux).
    this.addTween(
      TRANSITION_MS,
      (t) => {
        incoming.position.y = FLOOR_GAP * (1 - t) * (1 - t);
      },
      () => {
        incoming.position.y = 0;
        if (previous) {
          this.scene.remove(previous);
          this.disposeGroup(previous);
        }
      },
    );
  }

  private buildFloor(
    detail: FloorDetail,
    desks: readonly SceneDesk[],
    vehicles: readonly SceneVehicle[],
    rooms: readonly SceneRoom[],
    signature: string,
  ): void {
    if (this.floorGroup) {
      this.scene.remove(this.floorGroup);
      this.disposeGroup(this.floorGroup);
    }
    this.detail = detail;
    this.floorId = detail.id;
    this.builtSignature = signature;
    this.ensureSite(detail, vehicles);
    const group = this.buildFloorGroup(detail, desks, rooms);
    this.scene.add(group);
    this.floorGroup = group;
    this.hitboxes = this.collectHitboxes(group);
  }

  private collectHitboxes(group: THREE.Group): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData['pick']) out.push(obj as THREE.Mesh);
    });
    return out;
  }

  private disposeGroup(group: THREE.Object3D): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) (obj as THREE.Mesh<THREE.BufferGeometry>).geometry.dispose();
    });
  }

  private paint(key: string, color: number, opacity: number): void {
    const marker = this.markers.get(key);
    if (!marker) return;
    const material = marker.material as THREE.MeshBasicMaterial;
    material.color.setHex(color);
    material.opacity = opacity;
  }

  // ----- Construction de l'étage --------------------------------------------

  private buildFloorGroup(
    detail: FloorDetail,
    desks: readonly SceneDesk[],
    rooms: readonly SceneRoom[],
  ): THREE.Group {
    const group = new THREE.Group();
    this.bodies.clear();
    this.zoneFloors.clear();
    this.buildingW = detail.width * S;
    this.buildingH = detail.height * S;
    // Repères du plan : on repart de zéro pour les postes et les salles de cet étage.
    for (const key of [...this.markers.keys()]) {
      if (key.startsWith('desk:') || key.startsWith('room:')) this.markers.delete(key);
    }
    const w = detail.width * S;
    const d = detail.height * S;

    group.add(this.plane(w, d, PALETTE.openspace, w / 2, 0.005, d / 2));
    this.addShell(group, w, d);

    for (const zone of detail.zones) {
      if (zone.kind === 'room') this.buildMeetingRoom(group, zone);
      else if (zone.kind === 'kitchen') this.buildKitchen(group, zone);
      else this.buildOpenspace(group, zone);
    }

    // Salles réservables : repère de disponibilité sur la zone, zone cliquable.
    for (const room of rooms) {
      const zone = detail.zones.find((z) => z.name === room.zoneName);
      if (!zone) continue;
      this.addRoomMarker(group, room, zone);
    }

    for (const desk of desks) {
      if (!desk.isActive) continue;
      this.buildDesk(group, desk);
    }
    return group;
  }

  private addRoomMarker(
    group: THREE.Group,
    room: SceneRoom,
    zone: FloorDetail['zones'][number],
  ): void {
    const x0 = zone.x * S;
    const z0 = zone.y * S;
    const zw = zone.width * S;
    const zd = zone.height * S;
    const cx = x0 + zw / 2;
    const cz = z0 + zd / 2;
    this.paintZoneFloor(zone.name, room.state);

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(zw, 1.8, zd),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.position.set(cx, 0.9, cz);
    hit.userData['pick'] = { kind: 'room', id: room.id } satisfies ScenePick;
    group.add(hit);
  }

  private addShell(group: THREE.Group, w: number, d: number): void {
    const wall = this.material(PALETTE.wall, 0.9);
    const roof = this.material(PALETTE.roof, 0.6);
    group.add(this.wallX(0, w, 0, WALL_HIGH, WALL_T, wall));
    group.add(this.wallZ(0, 0, d, WALL_HIGH, WALL_T, wall));
    group.add(this.wallX(0, w, d, WALL_LOW, WALL_T, wall));
    group.add(this.wallZ(w, 0, d, WALL_LOW, WALL_T, wall));
    group.add(
      this.box(w + WALL_T * 2, 0.2, WALL_T * 1.6, roof, w / 2, WALL_HIGH + 0.1, -WALL_T / 2),
    );
    group.add(
      this.box(WALL_T * 1.6, 0.2, d + WALL_T * 2, roof, -WALL_T / 2, WALL_HIGH + 0.1, d / 2),
    );
  }

  /** Salle de réunion fermée : cloisons Nord et Ouest hautes, Sud et Est basses (coupe). */
  private buildMeetingRoom(group: THREE.Group, zone: FloorDetail['zones'][number]): void {
    const x0 = zone.x * S;
    const z0 = zone.y * S;
    const zw = zone.width * S;
    const zd = zone.height * S;
    const cx = x0 + zw / 2;
    const cz = z0 + zd / 2;
    group.add(this.zoneFloor(zone.name, zw, zd, PALETTE.roomCarpet, cx, cz));
    this.addRoomWalls(group, x0, z0, zw, zd, WALL_HIGH - 0.4);

    group.add(this.box(zw * 0.5, 0.9, 0.05, this.material(0x1e293b, 0.4), cx, 1.5, z0 + 0.12));

    const table = this.fit(this.model('table-round'), { footprint: Math.min(zw, zd) * 0.42 });
    this.anchor(table, cx, cz);
    group.add(table);
    const rug = this.fit(this.model('rug'), { footprint: Math.min(zw, zd) * 0.95 });
    this.anchor(rug, cx, cz);
    group.add(rug);
    const radius = Math.min(zw, zd) * 0.36;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const chair = this.fit(this.model('chair-modern'), { height: 0.95 });
      this.anchor(chair, cx + Math.cos(a) * radius, cz + Math.sin(a) * radius);
      chair.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      group.add(chair);
    }
    const plant = this.fit(this.model('plant'), { height: 1.3 });
    this.anchor(plant, x0 + zw - 0.4, z0 + zd - 0.4);
    group.add(plant);
  }

  /** Cuisine fermée : comptoir et placards le long du mur Nord, frigo, îlot avec tabourets. */
  private buildKitchen(group: THREE.Group, zone: FloorDetail['zones'][number]): void {
    const x0 = zone.x * S;
    const z0 = zone.y * S;
    const zw = zone.width * S;
    const zd = zone.height * S;
    group.add(this.zoneFloor(zone.name, zw, zd, PALETTE.kitchenTile, x0 + zw / 2, z0 + zd / 2));
    this.addRoomWalls(group, x0, z0, zw, zd, WALL_HIGH - 0.4);

    const counterW = zw - 1.2;
    group.add(
      this.box(
        counterW,
        0.95,
        0.7,
        this.material(0xe2e8f0, 0.5),
        x0 + 0.1 + counterW / 2,
        0.475,
        z0 + 0.45,
      ),
    );
    group.add(
      this.box(
        counterW,
        0.08,
        0.78,
        this.material(0xf8fafc, 0.3),
        x0 + 0.1 + counterW / 2,
        0.99,
        z0 + 0.45,
      ),
    );
    group.add(
      this.box(
        counterW,
        0.7,
        0.3,
        this.material(0xbfd3f5, 0.6),
        x0 + 0.1 + counterW / 2,
        2.0,
        z0 + 0.2,
      ),
    );
    group.add(
      this.box(0.5, 0.02, 0.36, this.material(0x94a3b8, 0.2), x0 + zw * 0.45, 1.03, z0 + 0.45),
    );
    group.add(
      this.box(0.45, 0.02, 0.4, this.material(0x1e293b, 0.3), x0 + zw * 0.7, 1.03, z0 + 0.45),
    );

    const fridge = this.fit(this.model('fridge'), { height: 2.0 });
    this.anchor(fridge, x0 + zw - 0.45, z0 + 0.5);
    group.add(fridge);

    const islandW = zw * 0.42;
    const islandX = x0 + zw * 0.3;
    const islandZ = z0 + zd * 0.55;
    group.add(
      this.box(
        islandW,
        0.95,
        0.9,
        this.material(0xf1f5f9, 0.5),
        islandX + islandW / 2,
        0.475,
        islandZ,
      ),
    );
    group.add(
      this.box(
        islandW + 0.1,
        0.07,
        1.0,
        this.material(0xffffff, 0.3),
        islandX + islandW / 2,
        0.98,
        islandZ,
      ),
    );
    for (const k of [0.3, 0.7]) {
      const stool = this.fit(this.model('stool'), { height: 0.85 });
      this.anchor(stool, islandX + islandW * k, islandZ + 0.95);
      group.add(stool);
    }
    const plant = this.fit(this.model('plant-small'), { height: 0.9 });
    this.anchor(plant, x0 + 0.4, z0 + zd - 0.4);
    group.add(plant);
  }

  /** Open space : sol uniquement. Le décor (plantes, coin détente, rangements) est retiré pour le moment. */
  private buildOpenspace(group: THREE.Group, zone: FloorDetail['zones'][number]): void {
    const x0 = zone.x * S;
    const z0 = zone.y * S;
    const zw = zone.width * S;
    const zd = zone.height * S;
    group.add(this.plane(zw, zd, PALETTE.openspace, x0 + zw / 2, 0.007, z0 + zd / 2));
  }

  /** Poste : bureau bleuté, écran posé sur le plateau, chaise côté utilisateur (face au poste). */
  private buildDesk(group: THREE.Group, desk: SceneDesk): void {
    const cx = (desk.x + desk.width / 2) * S;
    const cz = (desk.y + desk.height / 2) * S;
    const w = desk.width * S;
    const d = desk.height * S;

    const table = this.fit(this.model('desk'), { footprint: Math.max(w, d) });
    this.anchor(table, cx, cz);
    group.add(table);

    const deskTop = new THREE.Box3().setFromObject(table).max.y;
    const monitor = this.fit(this.model('monitor'), { height: 0.55 });
    this.anchor(monitor, cx, cz - d * 0.25);
    monitor.position.y += deskTop;
    group.add(monitor);

    const chair = this.fit(this.model('chair-desk'), { height: 0.95 });
    this.anchor(chair, cx, cz + d * 0.95);
    chair.rotation.y = 0;
    group.add(chair);

    this.tintAll(table, DESK_COLOR[desk.state]);
    this.bodies.set(pickKey({ kind: 'desk', id: desk.id }), table);

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.1, 1.6, d * 1.1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.position.set(cx, 0.8, cz);
    hit.userData['pick'] = { kind: 'desk', id: desk.id } satisfies ScenePick;
    group.add(hit);
  }

  // ----- Site extérieur : parking, véhicules, arbres ------------------------

  /** Reconstruit le site si ses dimensions ou la liste des véhicules changent. */
  private ensureSite(detail: FloorDetail, vehicles: readonly SceneVehicle[]): void {
    const key = `${detail.width}x${detail.height}|${vehicles.map((v) => v.id).join(',')}`;
    if (this.siteGroup && this.siteKey === key) return;
    if (this.siteGroup) {
      this.scene.remove(this.siteGroup);
      this.disposeGroup(this.siteGroup);
      for (const k of [...this.markers.keys()]) {
        if (k.startsWith('vehicle:')) this.markers.delete(k);
      }
    }
    this.siteGroup = this.buildSite(detail, vehicles);
    this.siteKey = key;
    this.scene.add(this.siteGroup);
  }

  private buildSite(detail: FloorDetail, vehicles: readonly SceneVehicle[]): THREE.Group {
    const site = new THREE.Group();
    this.siteHitboxes = [];
    const w = detail.width * S;
    const d = detail.height * S;
    const left = -SITE_MARGIN;
    const right = w + SITE_MARGIN;

    const siteEnd = d + 7.6 + 2.7 + SITE_MARGIN;
    site.add(
      this.plane(right - left, siteEnd + SITE_MARGIN, PALETTE.ground, (left + right) / 2, -0.02, (siteEnd - SITE_MARGIN) / 2),
    );

    // Parking devant le bâtiment (côté Sud) : les places couvrent exactement la façade.
    const parkZ0 = d + 1.2;
    const parkZ1 = d + 7.6;
    const parkZ = (parkZ0 + parkZ1) / 2;
    site.add(this.plane(w, parkZ1 - parkZ0, PALETTE.asphalt, w / 2, 0.003, parkZ));

    const slots = Math.max(2, Math.round(w / SLOT_W));
    const slotW = w / slots;
    const paint = this.material(PALETTE.paint, 0.7);
    for (let i = 0; i <= slots; i++) {
      site.add(this.box(0.05, 0.01, parkZ1 - parkZ0 - 0.6, paint, i * slotW, 0.01, parkZ));
    }

    // Un véhicule de fonction par place réservable : on n'affiche que la flotte réelle.
    vehicles.forEach((vehicle, index) => {
      const slotIndex = (index * 2 + 1) % slots;
      const x = (slotIndex + 0.5) * slotW;
      const z = parkZ;
      const model = CAR_MODELS[index % CAR_MODELS.length] ?? 'car-sedan';
      const car = this.fit(this.model(model), { footprint: 3.4 });
      const carSize = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3());
      car.rotation.y = carSize.x > carSize.z ? Math.PI / 2 : 0;
      this.anchor(car, x, z);
      this.tintBody(car, CAR_COLORS[index % CAR_COLORS.length] ?? 0xffffff);
      site.add(car);

      const key = pickKey({ kind: 'vehicle', id: vehicle.id });
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 3.6),
        new THREE.MeshBasicMaterial({
          color: RESOURCE_COLOR[vehicle.state],
          transparent: true,
          opacity: 0.9,
        }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(x, 0.02, z);
      site.add(marker);
      this.markers.set(key, marker);

      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.8, 3.8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hit.position.set(x, 0.9, z);
      hit.userData['pick'] = { kind: 'vehicle', id: vehicle.id } satisfies ScenePick;
      site.add(hit);
      this.siteHitboxes.push(hit);
    });

    site.add(this.plane(w, 2.6, PALETTE.curb, w / 2, 0.004, parkZ1 + 1.4));
    site.add(this.plane(w, 0.1, PALETTE.paint, w / 2, 0.006, parkZ1 + 0.1));

    return site;
  }

  // ----- Redimensionnement d'une pièce (administrateur) ----------------------

  /** Point visé sur le sol, en unités du plan. */
  private planPointAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x / S, y: hit.z / S };
  }

  /** Bord d'une salle ou d'une cuisine sous le curseur (à quelques unités près). */
  private edgeAt(clientX: number, clientY: number): { zone: ZoneRect; edge: ResizeEdge } | null {
    const p = this.planPointAt(clientX, clientY);
    const plan = this.detail;
    if (!p || !plan) return null;
    const T = EDGE_TOLERANCE;
    let best: { zone: ZoneRect; edge: ResizeEdge; dist: number } | null = null;
    for (const z of plan.zones) {
      if (z.kind !== 'room' && z.kind !== 'kitchen') continue;
      const x1 = z.x + z.width;
      const y1 = z.y + z.height;
      const inX = p.x >= z.x - T && p.x <= x1 + T;
      const inY = p.y >= z.y - T && p.y <= y1 + T;
      const candidates: [ResizeEdge, number, boolean][] = [
        ['w', Math.abs(p.x - z.x), inY],
        ['e', Math.abs(p.x - x1), inY],
        ['n', Math.abs(p.y - z.y), inX],
        ['s', Math.abs(p.y - y1), inX],
      ];
      for (const [edge, dist, inside] of candidates) {
        if (inside && dist <= T && (!best || dist < best.dist)) {
          best = {
            zone: { name: z.name, x: z.x, y: z.y, width: z.width, height: z.height },
            edge,
            dist,
          };
        }
      }
    }
    return best ? { zone: best.zone, edge: best.edge } : null;
  }

  /** Curseur à afficher au survol d'un bord redimensionnable, sinon null. */
  edgeCursor(clientX: number, clientY: number): string | null {
    const hit = this.edgeAt(clientX, clientY);
    if (!hit) return null;
    return hit.edge === 'e' || hit.edge === 'w' ? 'ew-resize' : 'ns-resize';
  }

  /** Démarre le redimensionnement si le curseur est sur le bord d'une pièce. */
  beginResize(clientX: number, clientY: number): boolean {
    const hit = this.edgeAt(clientX, clientY);
    if (!hit) return false;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    const line = new THREE.LineLoop(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x2f54c6 }),
    );
    line.position.y = 0.6;
    this.scene.add(line);
    this.resizeState = { edge: hit.edge, start: hit.zone, current: { ...hit.zone }, line };
    this.updateResizeLine();
    return true;
  }

  /** Suit le curseur : le bord se cale sur la grille et ne sort pas du plan. */
  moveResize(clientX: number, clientY: number): void {
    const r = this.resizeState;
    const plan = this.detail;
    if (!r || !plan) return;
    const p = this.planPointAt(clientX, clientY);
    if (!p) return;
    const px = snapPlan(p.x);
    const py = snapPlan(p.y);
    const s = r.start;
    const next: ZoneRect = { ...s };
    if (r.edge === 'e') next.width = clampPlan(px - s.x, MIN_ZONE, plan.width - s.x);
    if (r.edge === 's') next.height = clampPlan(py - s.y, MIN_ZONE, plan.height - s.y);
    if (r.edge === 'w') {
      next.x = clampPlan(px, 0, s.x + s.width - MIN_ZONE);
      next.width = s.x + s.width - next.x;
    }
    if (r.edge === 'n') {
      next.y = clampPlan(py, 0, s.y + s.height - MIN_ZONE);
      next.height = s.y + s.height - next.y;
    }
    r.current = next;
    this.updateResizeLine();
  }

  /** Termine le redimensionnement ; renvoie le nouveau rectangle s'il a changé. */
  endResize(): ZoneRect | null {
    const r = this.resizeState;
    if (!r) return null;
    this.scene.remove(r.line);
    r.line.geometry.dispose();
    (r.line.material as THREE.Material).dispose();
    this.resizeState = null;
    const c = r.current;
    const s = r.start;
    const changed = c.x !== s.x || c.y !== s.y || c.width !== s.width || c.height !== s.height;
    return changed ? c : null;
  }

  /** Aperçu du nouveau contour pendant le glissement. */
  private updateResizeLine(): void {
    const r = this.resizeState;
    if (!r) return;
    const c = r.current;
    const x0 = c.x * S;
    const x1 = (c.x + c.width) * S;
    const z0 = c.y * S;
    const z1 = (c.y + c.height) * S;
    const corners = [x0, z0, x1, z0, x1, z1, x0, z1];
    const pos = r.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < 4; i++) pos.setXYZ(i, corners[i * 2] ?? 0, 0, corners[i * 2 + 1] ?? 0);
    pos.needsUpdate = true;
    this.requestRender();
  }

  // ----- Utilitaires --------------------------------------------------------

  private material(color: number, roughness: number): THREE.MeshStandardMaterial {
    const key = color * 10 + Math.round(roughness * 10);
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness });
      this.materials.set(key, m);
    }
    return m;
  }

  private box(
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private plane(w: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.material(color, 1));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Mur horizontal (le long de X) : de x0 à x1, à la position z, hauteur h. */
  private wallX(
    x0: number,
    x1: number,
    z: number,
    h: number,
    t: number,
    material: THREE.Material,
  ): THREE.Mesh {
    return this.box(x1 - x0, h, t, material, (x0 + x1) / 2, h / 2, z);
  }

  /** Mur vertical (le long de Z) : de z0 à z1, à la position x. */
  private wallZ(
    x: number,
    z0: number,
    z1: number,
    h: number,
    t: number,
    material: THREE.Material,
  ): THREE.Mesh {
    return this.box(t, h, z1 - z0, material, x, h / 2, (z0 + z1) / 2);
  }

  /** Cloisons d'une pièce : Nord et Ouest hautes, Sud et Est basses (coupe). */
  private addRoomWalls(
    group: THREE.Group,
    x0: number,
    z0: number,
    zw: number,
    zd: number,
    high: number,
  ): void {
    const wall = this.material(PALETTE.wallInner, 0.9);
    const onNorth = z0 <= 0.01;
    const onWest = x0 <= 0.01;
    const onEast = x0 + zw >= this.buildingW - 0.01;
    const onSouth = z0 + zd >= this.buildingH - 0.01;
    if (!onNorth) group.add(this.wallX(x0, x0 + zw, z0, high, WALL_T, wall));
    if (!onWest) group.add(this.wallZ(x0, z0, z0 + zd, high, WALL_T, wall));
    if (!onSouth) group.add(this.wallX(x0, x0 + zw, z0 + zd, WALL_LOW, WALL_T, wall));
    if (!onEast) group.add(this.wallZ(x0 + zw, z0, z0 + zd, WALL_LOW, WALL_T, wall));
  }

  private async loadModels(): Promise<void> {
    const loader = new GLTFLoader();
    const loaded = await Promise.all(
      MODEL_NAMES.map(async (name) => {
        const gltf = await loader.loadAsync(`/${MODEL_PATH[name]}`);
        return [name, gltf.scene] as const;
      }),
    );
    for (const [name, root] of loaded) {
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
        // Décor : normales lissées pour un rendu moins facetté (les voitures gardent leurs normales).
        if (!isCar(name)) {
          const mesh = obj as THREE.Mesh<THREE.BufferGeometry>;
          mesh.geometry = smoothGeometry(mesh.geometry);
          const m = obj.material as THREE.MeshStandardMaterial;
          m.flatShading = false;
          m.needsUpdate = true;
        }
      });
      this.models.set(name, root);
    }
  }

  private model(name: ModelName): THREE.Group {
    const base = this.models.get(name);
    if (!base) throw new Error(`Modèle 3D absent : ${name}`);
    const copy = base.clone(true);
    const tint = furnitureColor(name);
    // Chaque copie reçoit ses propres matériaux, pour ne pas teinter les autres instances.
    copy.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const material = (obj.material as THREE.MeshStandardMaterial).clone();
      if (tint !== null) material.color.setHex(tint);
      obj.material = material;
    });
    return copy;
  }

  /** Teinte tout un objet (chaque copie de modèle a ses propres matériaux). */
  private tintAll(object: THREE.Object3D, color: number): void {
    object.traverse((obj) => {
      if (obj instanceof THREE.Mesh) (obj.material as THREE.MeshStandardMaterial).color.setHex(color);
    });
  }

  /** Sol d'une salle ou cuisine, avec son propre matériau pour pouvoir changer sa couleur. */
  private zoneFloor(
    zoneName: string,
    w: number,
    d: number,
    color: number,
    x: number,
    z: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.008, z);
    mesh.receiveShadow = true;
    this.zoneFloors.set(zoneName, mesh);
    return mesh;
  }

  /** Moquette teintée selon l'état : la couleur d'état, éclaircie pour rester posée au sol. */
  private paintZoneFloor(zoneName: string, state: ResourceState): void {
    const mesh = this.zoneFloors.get(zoneName);
    if (!mesh) return;
    const color = new THREE.Color(RESOURCE_COLOR[state]).lerp(new THREE.Color(0xffffff), 0.55);
    (mesh.material as THREE.MeshStandardMaterial).color.copy(color);
  }

  /** Teinte la carrosserie d'un véhicule sans toucher aux vitres ni aux pneus. */
  private tintBody(car: THREE.Object3D, color: number): void {
    car.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const m = obj.material as THREE.MeshStandardMaterial;
      if (m.name && /glass|window|tire|wheel|light/i.test(m.name)) return;
      m.color.setHex(color);
    });
  }

  /** Mise à l'échelle uniforme : hauteur cible, ou empreinte cible (le plus grand côté horizontal). */
  private fit(
    object: THREE.Object3D,
    target: { height?: number; footprint?: number },
  ): THREE.Object3D {
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    let factor = 1;
    if (target.height !== undefined && size.y > 0) factor = target.height / size.y;
    if (target.footprint !== undefined) {
      const span = Math.max(size.x, size.z) || 1;
      factor = target.footprint / span;
    }
    object.scale.multiplyScalar(factor);
    return object;
  }

  /** Pose le bas du modèle au sol, centré sur (x, z). */
  private anchor(object: THREE.Object3D, x: number, z: number): void {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    object.position.x += x - center.x;
    object.position.z += z - center.z;
    object.position.y += -box.min.y;
  }
}
