import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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

const STATE_COLOR: Record<DeskState, number> = {
  FREE: 0x2f9e6b,
  PARTIAL: 0x2f54c6,
  MINE: 0x2f54c6,
  BOOKED: 0x8a94a6,
  TEAM_RESERVED: 0xd98a1c,
  UNAVAILABLE: 0xc3cad6,
};

const PALETTE = {
  ground: 0xdfe9f4,
  slab: 0xf4f7fb,
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
const SITE_MARGIN = 14;

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

export type SceneView = 'iso' | 'top';

type ModelName =
  | 'desk'
  | 'desk-corner'
  | 'chair-desk'
  | 'chair'
  | 'chair-modern'
  | 'monitor'
  | 'keyboard'
  | 'laptop'
  | 'plant'
  | 'plant-small'
  | 'table'
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
  | 'cabinet-tv'
  | 'window'
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
  'desk-corner': '3d/office/desk-corner.glb',
  'chair-desk': '3d/office/chair-desk.glb',
  chair: '3d/office/chair.glb',
  'chair-modern': '3d/office/chair-modern.glb',
  monitor: '3d/office/monitor.glb',
  keyboard: '3d/office/keyboard.glb',
  laptop: '3d/office/laptop.glb',
  plant: '3d/office/plant.glb',
  'plant-small': '3d/office/plant-small.glb',
  table: '3d/office/table.glb',
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
  'cabinet-tv': '3d/office/cabinet-tv.glb',
  window: '3d/office/window.glb',
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

/** Couleur du mobilier selon sa nature, pour rester dans la palette bleu et blanc de l'interface. */
function furnitureColor(name: ModelName): number | null {
  switch (name) {
    case 'chair':
    case 'chair-desk':
    case 'chair-modern':
    case 'stool':
      return 0x2f54c6;
    case 'monitor':
    case 'keyboard':
    case 'laptop':
    case 'cabinet-tv':
      return 0x1e293b;
    case 'desk':
    case 'desk-corner':
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

type Tween = { start: number; duration: number; step: (t: number) => void; done?: () => void };

/** Ease in-out cubique. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  private readonly markers = new Map<string, THREE.Mesh>();
  private hitboxes: THREE.Mesh[] = [];
  private hovered: string | null = null;
  private frame = 0;
  private width = 1;
  private height = 1;
  private floorGroup: THREE.Group | null = null;
  private siteGroup: THREE.Group | null = null;
  private floorId: string | null = null;
  private builtSignature = '';
  private detail: FloorDetail | null = null;
  private tweens: Tween[] = [];
  private lastTime = 0;
  private readonly sun: THREE.DirectionalLight;

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
    this.sun = new THREE.DirectionalLight(PALETTE.shadowLight, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -40;
    c.right = 40;
    c.top = 40;
    c.bottom = -40;
    c.near = 1;
    c.far = 160;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
  }

  /** Charge les modèles puis crée la scène. Les échecs de chargement sont propagés. */
  static async create(canvas: HTMLCanvasElement): Promise<OfficeScene> {
    const instance = new OfficeScene(canvas);
    await instance.loadModels();
    return instance;
  }

  /**
   * Met la scène à jour selon l'étage et l'état des postes :
   * - changement d'étage : transition animée (l'étage sort, le nouveau monte) ;
   * - même étage, postes changés : reconstruction sans animation si la liste de postes diffère ;
   * - sinon : simple mise à jour des états.
   */
  update(detail: FloorDetail, desks: readonly SceneDesk[]): void {
    const signature = desks
      .map((d) => d.id)
      .sort()
      .join('|');
    if (detail.id !== this.floorId) {
      this.transitionTo(detail, desks, signature);
    } else if (signature !== this.builtSignature) {
      this.buildFloor(detail, desks, signature, 0);
      this.frameCamera(detail);
    } else {
      this.setStates(desks);
    }
    this.requestRender();
  }

  /** Met à jour l'état des postes sans reconstruire la scène. */
  setStates(desks: readonly SceneDesk[]): void {
    for (const desk of desks) {
      const marker = this.markers.get(desk.id);
      if (!marker) continue;
      const material = marker.material as THREE.MeshBasicMaterial;
      material.color.setHex(STATE_COLOR[desk.state]);
      material.opacity = desk.state === 'UNAVAILABLE' ? 0.45 : 0.9;
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

  /** Désigne le poste sous le pointeur (coordonnées écran). */
  pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.hitboxes, false)[0];
    return (hit?.object.userData['deskId'] as string | undefined) ?? null;
  }

  /** Survol : met en évidence le poste sous le pointeur. Retourne true si le survol a changé. */
  hover(clientX: number, clientY: number): boolean {
    const id = this.pick(clientX, clientY);
    if (id === this.hovered) return false;
    if (this.hovered) this.markers.get(this.hovered)?.scale.set(1, 1, 1);
    this.hovered = id;
    if (id) this.markers.get(id)?.scale.set(1.12, 1.12, 1.12);
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
    return Math.max(w, d) * 0.62;
  }

  private frameCamera(detail: FloorDetail): void {
    const w = detail.width * S;
    const d = detail.height * S;
    const c = new THREE.Vector3(w / 2, 0, d / 2 + 2);
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

  private transitionTo(detail: FloorDetail, desks: readonly SceneDesk[], signature: string): void {
    const previous = this.floorGroup;
    this.detail = detail;
    this.floorId = detail.id;
    this.builtSignature = signature;
    this.ensureSite(detail);

    const incoming = this.buildFloorGroup(detail, desks);
    incoming.position.y = FLOOR_GAP;
    this.scene.add(incoming);
    this.floorGroup = incoming;
    this.hitboxes = this.collectHitboxes(incoming);
    this.frameCamera(detail);

    this.addTween(TRANSITION_MS, (t) => {
      incoming.position.y = FLOOR_GAP * (1 - t);
    });
    if (previous) {
      this.addTween(
        TRANSITION_MS,
        (t) => {
          previous.position.y = -FLOOR_GAP * t;
        },
        () => {
          this.scene.remove(previous);
          this.disposeGroup(previous);
        },
      );
    }
  }

  private buildFloor(
    detail: FloorDetail,
    desks: readonly SceneDesk[],
    signature: string,
    y: number,
  ): void {
    if (this.floorGroup) {
      this.scene.remove(this.floorGroup);
      this.disposeGroup(this.floorGroup);
    }
    this.detail = detail;
    this.floorId = detail.id;
    this.builtSignature = signature;
    this.ensureSite(detail);
    const group = this.buildFloorGroup(detail, desks);
    group.position.y = y;
    this.scene.add(group);
    this.floorGroup = group;
    this.hitboxes = this.collectHitboxes(group);
  }

  private collectHitboxes(group: THREE.Group): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData['hitbox']) out.push(obj as THREE.Mesh);
    });
    return out;
  }

  private disposeGroup(group: THREE.Object3D): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) (obj as THREE.Mesh<THREE.BufferGeometry>).geometry.dispose();
    });
  }

  // ----- Construction de l'étage --------------------------------------------

  private buildFloorGroup(detail: FloorDetail, desks: readonly SceneDesk[]): THREE.Group {
    const group = new THREE.Group();
    this.markers.clear();
    const w = detail.width * S;
    const d = detail.height * S;

    // Dalle et sol.
    group.add(this.plane(w, d, PALETTE.openspace, w / 2, 0.005, d / 2));

    // Bâtiment en coupe : murs Nord et Ouest hauts, Sud et Est bas.
    this.addShell(group, w, d);

    for (const zone of detail.zones) {
      if (zone.kind === 'room') this.buildMeetingRoom(group, zone);
      else if (zone.kind === 'kitchen') this.buildKitchen(group, zone);
      else this.buildOpenspace(group, zone);
    }

    // Postes : bureau, écran, chaise côté utilisateur.
    for (const desk of desks) {
      if (!desk.isActive) continue;
      this.buildDesk(group, desk);
    }
    return group;
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
    group.add(this.plane(zw, zd, PALETTE.roomCarpet, cx, 0.008, cz));
    this.addRoomWalls(group, x0, z0, zw, zd, WALL_HIGH - 0.4);

    // Écran mural sur la cloison Nord.
    group.add(this.box(zw * 0.5, 0.9, 0.05, this.material(0x1e293b, 0.4), cx, 1.5, z0 + 0.12));

    // Grande table ronde, six chaises autour, tapis dessous.
    const table = this.fit(this.model('table-round'), { footprint: Math.min(zw, zd) * 0.62 });
    this.anchor(table, cx, cz);
    group.add(table);
    const rug = this.fit(this.model('rug'), { footprint: Math.min(zw, zd) * 0.95 });
    this.anchor(rug, cx, cz);
    group.add(rug);
    const radius = Math.min(zw, zd) * 0.34;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const chair = this.fit(this.model('chair-modern'), { height: 0.95 });
      this.anchor(chair, cx + Math.cos(a) * radius, cz + Math.sin(a) * radius);
      chair.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
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
    group.add(this.plane(zw, zd, PALETTE.kitchenTile, x0 + zw / 2, 0.008, z0 + zd / 2));
    this.addRoomWalls(group, x0, z0, zw, zd, WALL_HIGH - 0.4);

    // Plan de travail et placards hauts le long du mur Nord.
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
    // Évier et plaque de cuisson (détails sur le plan de travail).
    group.add(
      this.box(0.5, 0.02, 0.36, this.material(0x94a3b8, 0.2), x0 + zw * 0.45, 1.03, z0 + 0.45),
    );
    group.add(
      this.box(0.45, 0.02, 0.4, this.material(0x1e293b, 0.3), x0 + zw * 0.7, 1.03, z0 + 0.45),
    );

    const fridge = this.fit(this.model('fridge'), { height: 2.0 });
    this.anchor(fridge, x0 + zw - 0.45, z0 + 0.5);
    group.add(fridge);

    // Îlot central avec deux tabourets côté Sud.
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

  /** Décor de l'open space : plantes, canapé d'accueil, bibliothèque, porte-manteau, poubelles. */
  private buildOpenspace(group: THREE.Group, zone: FloorDetail['zones'][number]): void {
    const x0 = zone.x * S;
    const z0 = zone.y * S;
    const zw = zone.width * S;
    const zd = zone.height * S;
    group.add(this.plane(zw, zd, PALETTE.openspace, x0 + zw / 2, 0.007, z0 + zd / 2));

    // Plantes dans les angles.
    const corners: [number, number, number][] = [
      [x0 + 0.4, z0 + 0.4, 1.5],
      [x0 + zw - 0.4, z0 + 0.4, 1.7],
      [x0 + 0.4, z0 + zd - 0.4, 1.6],
      [x0 + zw - 0.4, z0 + zd - 0.4, 1.5],
    ];
    for (const [px, pz, h] of corners) {
      const plant = this.fit(this.model('plant'), { height: h });
      this.anchor(plant, px, pz);
      group.add(plant);
    }

    // Coin détente : canapé, table basse, tapis et lampe.
    const loungeX = x0 + 0.9;
    const loungeZ = z0 + zd * 0.78;
    const rug = this.fit(this.model('rug'), { footprint: 2.8 });
    this.anchor(rug, loungeX + 1.2, loungeZ);
    group.add(rug);
    const sofa = this.fit(this.model('sofa'), { footprint: 2.2 });
    this.anchor(sofa, loungeX + 1.2, loungeZ - 1.0);
    group.add(sofa);
    const coffee = this.fit(this.model('table-coffee'), { footprint: 1.1 });
    this.anchor(coffee, loungeX + 1.2, loungeZ + 0.1);
    group.add(coffee);
    const lamp = this.fit(this.model('lamp-floor'), { height: 1.9 });
    this.anchor(lamp, loungeX + 2.6, loungeZ - 0.9);
    group.add(lamp);

    // Bibliothèque et plantes le long du mur Ouest.
    const shelf = this.fit(this.model('bookcase'), { height: 2.1 });
    this.anchor(shelf, x0 + 0.5, z0 + zd * 0.42);
    shelf.rotation.y = Math.PI / 2;
    group.add(shelf);
    const plantW = this.fit(this.model('plant-small'), { height: 1.1 });
    this.anchor(plantW, x0 + 0.5, z0 + zd * 0.2);
    group.add(plantW);

    // Porte-manteau et poubelle près de l'angle Est.
    const coat = this.fit(this.model('coat-rack'), { height: 1.8 });
    this.anchor(coat, x0 + zw - 0.5, z0 + zd * 0.5);
    group.add(coat);
    const bin = this.fit(this.model('trashcan'), { height: 0.6 });
    this.anchor(bin, x0 + zw - 0.8, z0 + zd * 0.68);
    group.add(bin);

    // Plantes intermédiaires entre les rangées de postes.
    for (const px of [0.25, 0.5, 0.75]) {
      const p = this.fit(this.model('plant-small'), { height: 0.95 });
      this.anchor(p, x0 + zw * px, z0 + zd * 0.5);
      group.add(p);
    }
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

    const monitor = this.fit(this.model('monitor'), { height: 0.55 });
    this.anchor(monitor, cx, cz - d * 0.25);
    group.add(monitor);

    // La chaise est du côté de l'utilisateur (Sud du bureau), tournée vers le bureau (Nord).
    const chair = this.fit(this.model('chair-desk'), { height: 0.95 });
    this.anchor(chair, cx, cz + d * 0.95);
    chair.rotation.y = 0;
    group.add(chair);

    // Repère d'état au sol ; zone de survol agrandie.
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.12, d * 1.12),
      new THREE.MeshBasicMaterial({
        color: STATE_COLOR[desk.state],
        transparent: true,
        opacity: 0.9,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(cx, 0.02, cz);
    marker.userData['deskId'] = desk.id;
    group.add(marker);
    this.markers.set(desk.id, marker);

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.1, 1.6, d * 1.1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.position.set(cx, 0.8, cz);
    hit.userData['deskId'] = desk.id;
    hit.userData['hitbox'] = true;
    group.add(hit);
  }

  // ----- Site extérieur : parking, véhicules, arbres ------------------------

  private ensureSite(detail: FloorDetail): void {
    const key = `${detail.width}x${detail.height}`;
    if (this.siteGroup && this.siteGroup.userData['key'] === key) return;
    if (this.siteGroup) {
      this.scene.remove(this.siteGroup);
      this.disposeGroup(this.siteGroup);
    }
    this.siteGroup = this.buildSite(detail);
    this.siteGroup.userData['key'] = key;
    this.scene.add(this.siteGroup);
  }

  private buildSite(detail: FloorDetail): THREE.Group {
    const site = new THREE.Group();
    const w = detail.width * S;
    const d = detail.height * S;
    const left = -SITE_MARGIN;
    const right = w + SITE_MARGIN;

    // Terrain autour du bâtiment et du parking.
    site.add(
      this.plane(
        right - left,
        d + SITE_MARGIN * 2,
        PALETTE.ground,
        (left + right) / 2,
        -0.02,
        d / 2,
      ),
    );

    // Parking devant le bâtiment (côté Sud, face à la caméra).
    const parkZ0 = d + 1.2;
    const parkZ1 = d + 7.6;
    site.add(
      this.plane(w + 6, parkZ1 - parkZ0, PALETTE.asphalt, w / 2, 0.003, (parkZ0 + parkZ1) / 2),
    );

    const slotW = 2.2;
    const slots = Math.floor((w + 4) / slotW);
    const paint = this.material(PALETTE.paint, 0.7);
    for (let i = 0; i <= slots; i++) {
      const x = -2 + i * slotW;
      site.add(this.box(0.05, 0.01, parkZ1 - parkZ0 - 0.6, paint, x, 0.01, (parkZ0 + parkZ1) / 2));
    }

    // Véhicules de fonction : une voiture sur quatre places, orientées vers le bâtiment.
    const cars: ModelName[] = [
      'car-sedan',
      'car-suv',
      'car-sports',
      'car-hatch',
      'car-van',
      'car-taxi',
    ];
    const carColors = [0xf8fafc, 0x2f54c6, 0x9aa5b5, 0x1e293b];
    let carIndex = 0;
    for (let i = 0; i < slots; i++) {
      if (i % 4 === 1) continue;
      const x = -2 + (i + 0.5) * slotW;
      const car = this.fit(this.model(cars[carIndex % cars.length] ?? 'car-sedan'), {
        footprint: 1.9,
      });
      this.anchor(car, x, (parkZ0 + parkZ1) / 2);
      car.rotation.y = Math.PI / 2;
      this.tintBody(car, carColors[carIndex % carColors.length] ?? 0xffffff);
      site.add(car);
      carIndex++;
    }

    // Voie de circulation et bordure.
    site.add(this.plane(w + 6, 2.6, PALETTE.curb, w / 2, 0.004, parkZ1 + 1.4));
    site.add(this.plane(w + 6, 0.1, PALETTE.paint, w / 2, 0.006, parkZ1 + 0.1));

    // Arbres et haies autour du site.
    const trees: [ModelName, number, number, number][] = [
      ['tree-oak', left + 1.5, 2, 3.6],
      ['tree-default', left + 1.2, d * 0.5, 3.2],
      ['tree-pine', left + 1.6, d - 1.5, 4.2],
      ['tree-simple', w * 0.3, -2.4, 3.0],
      ['tree-fat', w * 0.75, -2.8, 3.4],
      ['tree-oak', right - 1.6, d * 0.6, 3.6],
      ['tree-default', right - 1.4, parkZ1 + 2.2, 3.2],
      ['tree-pine', w * 0.18, parkZ1 + 3.4, 3.8],
    ];
    for (const [name, x, z, h] of trees) {
      const tree = this.fit(this.model(name), { height: h });
      this.anchor(tree, x, z);
      site.add(tree);
    }
    for (const [x, z] of [
      [w * 0.5, parkZ1 + 0.8],
      [w * 0.95, parkZ1 + 3.2],
    ] as const) {
      const bush = this.fit(this.model('bush-large'), { footprint: 1.6 });
      this.anchor(bush, x, z);
      site.add(bush);
    }
    return site;
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
    group.add(this.wallX(x0, x0 + zw, z0, high, WALL_T, wall));
    group.add(this.wallZ(x0, z0, z0 + zd, high, WALL_T, wall));
    group.add(this.wallX(x0, x0 + zw, z0 + zd, WALL_LOW, WALL_T, wall));
    group.add(this.wallZ(x0 + zw, z0, z0 + zd, WALL_LOW, WALL_T, wall));
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
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
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
