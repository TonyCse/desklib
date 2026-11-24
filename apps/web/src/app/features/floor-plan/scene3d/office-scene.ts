import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FloorDetail } from '../../../core/models';
import type { DeskState } from '../desk-status';

/**
 * Scène 3D de l'étage (Three.js, WebGL). Ce module est chargé à la demande : il n'alourdit pas
 * le reste de l'application. Les modèles viennent de `public/3d/office` (Kenney, CC0).
 *
 * Échelle : 1 unité monde = 50 px du plan. Le plan est posé à plat, la hauteur est l'axe Y.
 */

/** Unités monde par pixel du plan. */
const S = 0.02;

/** Couleurs d'état : repère au sol sous chaque poste. Même sémantique que la vue plan. */
const STATE_COLOR: Record<DeskState, number> = {
  FREE: 0x2f9e6b,
  PARTIAL: 0x2f54c6,
  MINE: 0x2f54c6,
  BOOKED: 0x8a94a6,
  TEAM_RESERVED: 0xd98a1c,
  UNAVAILABLE: 0xc3cad6,
};

const PALETTE = {
  ground: 0xdde8f5,
  openspace: 0xf7f9fc,
  room: 0xdfe6ef,
  kitchen: 0xf4f1ea,
  wall: 0xf8fafc,
  roof: 0x2f54c6,
  shadowLight: 0xfff4e6,
  hemiSky: 0xffffff,
  hemiGround: 0xc9d3e0,
};

const WALL_HEIGHT = 2.6;
const WALL_THICKNESS = 0.4;

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
  | 'stool';

const MODEL_NAMES: ModelName[] = [
  'desk',
  'desk-corner',
  'chair-desk',
  'chair',
  'chair-modern',
  'monitor',
  'keyboard',
  'laptop',
  'plant',
  'plant-small',
  'table',
  'table-round',
  'table-coffee',
  'kitchen-cabinet',
  'fridge',
  'kitchen-bar',
  'bookcase',
  'sofa',
  'coat-rack',
  'trashcan',
  'lamp-floor',
  'rug',
  'cabinet-tv',
  'window',
  'stool',
];

export class OfficeScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly models = new Map<ModelName, THREE.Group>();
  private readonly markers = new Map<string, THREE.Mesh>();
  private readonly hitboxes: THREE.Mesh[] = [];
  private hovered: string | null = null;
  private frame = 0;
  private width = 1;
  private height = 1;
  private floorW = 1000;
  private floorH = 560;
  private readonly onPick: (deskId: string, clientX: number, clientY: number) => void;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    onPick: (deskId: string, clientX: number, clientY: number) => void,
  ) {
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);
    this.camera.position.set(30, 30, 30);
    this.camera.lookAt(0, 0, 0);

    // Fond clair et doux, dans la continuité de l'interface.
    this.scene.background = new THREE.Color(0xeaf1fa);
    this.scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.6));
    const sun = new THREE.DirectionalLight(PALETTE.shadowLight, 2.4);
    sun.position.set(-12, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -22;
    c.right = 22;
    c.top = 22;
    c.bottom = -22;
    c.near = 1;
    c.far = 80;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  /** Charge les modèles puis crée la scène. Les échecs de chargement sont propagés. */
  static async create(
    canvas: HTMLCanvasElement,
    onPick: (deskId: string, clientX: number, clientY: number) => void,
  ): Promise<OfficeScene> {
    const instance = new OfficeScene(canvas, onPick);
    await instance.loadModels();
    return instance;
  }

  /** Construit le bâtiment, le mobilier fixe et les postes pour un étage. */
  setFloor(detail: FloorDetail, desks: readonly SceneDesk[]): void {
    this.floorW = detail.width;
    this.floorH = detail.height;
    // La caméra vise le centre du bâtiment (et non le coin du plan).
    const cx = (detail.width * S) / 2;
    const cz = (detail.height * S) / 2;
    this.camera.position.set(cx + 30, 30, cz + 30);
    this.camera.lookAt(cx, 0, cz);
    this.clearScene();
    this.buildGround();
    this.buildBuilding(detail);
    this.buildZones(detail);
    this.buildDesks(desks);
    this.resize(this.width, this.height);
    this.requestRender();
  }

  /** Met à jour l'état des postes sans reconstruire la scène. */
  setStates(desks: readonly SceneDesk[]): void {
    for (const desk of desks) {
      const marker = this.markers.get(desk.id);
      if (!marker) continue;
      const material = marker.material as THREE.MeshStandardMaterial;
      material.color.setHex(STATE_COLOR[desk.state]);
      material.opacity = desk.state === 'UNAVAILABLE' ? 0.45 : 0.9;
    }
    this.requestRender();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setSize(this.width, this.height, false);
    // Cadrage serré sur le bâtiment : la scène occupe la vue, comme dans la référence.
    const half = Math.max(this.floorW, this.floorH) * S * 0.46;
    const aspect = this.width / this.height;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Désigne le poste sous le pointeur (coordonnées écran, relatives au canvas). */
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

  /** Position écran (coordonnées du canvas) du centre d'un poste, pour ancrer la popover. */
  screenPointOf(deskId: string): { x: number; y: number } | null {
    const marker = this.markers.get(deskId);
    if (!marker) return null;
    const v = marker.getWorldPosition(new THREE.Vector3()).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mesh = obj as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
        mesh.geometry.dispose();
        const mats: THREE.Material[] = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of mats) m.dispose();
      }
    });
  }

  // ----- Construction -------------------------------------------------------

  private async loadModels(): Promise<void> {
    const loader = new GLTFLoader();
    const loaded = await Promise.all(
      MODEL_NAMES.map(async (name) => {
        const gltf = await loader.loadAsync(`/3d/office/${name}.glb`);
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
    return base.clone(true);
  }

  private clearScene(): void {
    for (const child of [...this.scene.children]) {
      if (child instanceof THREE.Light) continue;
      this.scene.remove(child);
    }
    this.markers.clear();
    this.hitboxes.length = 0;
    this.hovered = null;
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private buildBuilding(detail: FloorDetail): void {
    const w = detail.width * S;
    const d = detail.height * S;
    const wall = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: PALETTE.roof, roughness: 0.6 });
    // Coupe : seuls les murs Nord et Ouest sont dessinés, le plan reste visible.
    const north = this.box(w + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS, wall);
    north.position.set(w / 2, WALL_HEIGHT / 2, -WALL_THICKNESS / 2);
    const west = this.box(WALL_THICKNESS, WALL_HEIGHT, d + WALL_THICKNESS, wall);
    west.position.set(-WALL_THICKNESS / 2, WALL_HEIGHT / 2, d / 2);
    const northRoof = this.box(w + WALL_THICKNESS * 2, 0.22, WALL_THICKNESS * 1.6, roof);
    northRoof.position.set(w / 2, WALL_HEIGHT + 0.11, -WALL_THICKNESS / 2);
    const westRoof = this.box(WALL_THICKNESS * 1.6, 0.22, d + WALL_THICKNESS * 2, roof);
    westRoof.position.set(-WALL_THICKNESS / 2, WALL_HEIGHT + 0.11, d / 2);
    this.scene.add(north, west, northRoof, westRoof);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: PALETTE.openspace, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2, 0.005, d / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildZones(detail: FloorDetail): void {
    for (const zone of detail.zones) {
      const color =
        zone.kind === 'room'
          ? PALETTE.room
          : zone.kind === 'kitchen'
            ? PALETTE.kitchen
            : PALETTE.openspace;
      const x0 = zone.x * S;
      const z0 = zone.y * S;
      const zw = zone.width * S;
      const zd = zone.height * S;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(zw, zd),
        new THREE.MeshStandardMaterial({ color, roughness: 1 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x0 + zw / 2, 0.008, z0 + zd / 2);
      floor.receiveShadow = true;
      this.scene.add(floor);

      if (zone.kind === 'room') {
        // Cloisons : murs Nord et Ouest uniquement, comme le bâtiment.
        const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.9 });
        const n = this.box(zw, 1.6, WALL_THICKNESS * 0.6, wallMat);
        n.position.set(x0 + zw / 2, 0.8, z0);
        const e = this.box(WALL_THICKNESS * 0.6, 1.6, zd, wallMat);
        e.position.set(x0, 0.8, z0 + zd / 2);
        this.scene.add(n, e);
        this.placeRoomFurniture(x0 + zw / 2, z0 + zd / 2, Math.min(zw, zd));
      } else if (zone.kind === 'kitchen') {
        this.placeKitchen(x0, z0, zw, zd);
      } else {
        this.placeOpenspaceExtras(x0, z0, zw, zd);
      }
    }
  }

  private placeRoomFurniture(cx: number, cz: number, size: number): void {
    const table = this.fit(this.model('table-round'), { footprint: size * 0.45 });
    this.anchor(table, cx, cz);
    this.scene.add(table);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const chair = this.fit(this.model('chair'), { height: 0.95 });
      this.anchor(chair, cx + Math.cos(a) * size * 0.34, cz + Math.sin(a) * size * 0.34);
      chair.rotation.y = -a + Math.PI / 2;
      this.scene.add(chair);
    }
  }

  private placeKitchen(x0: number, z0: number, zw: number, zd: number): void {
    const cabinet = this.fit(this.model('kitchen-cabinet'), { height: 1.0 });
    this.anchor(cabinet, x0 + zw * 0.35, z0 + 0.35);
    this.scene.add(cabinet);
    const fridge = this.fit(this.model('fridge'), { height: 1.9 });
    this.anchor(fridge, x0 + zw - 0.4, z0 + 0.45);
    this.scene.add(fridge);
    const bar = this.fit(this.model('kitchen-bar'), { footprint: Math.min(zw, zd) * 0.5 });
    this.anchor(bar, x0 + zw * 0.45, z0 + zd * 0.6);
    this.scene.add(bar);
    const stool = this.fit(this.model('stool'), { height: 0.9 });
    this.anchor(stool, x0 + zw * 0.45, z0 + zd * 0.6 + 0.45);
    this.scene.add(stool);
  }

  private placeOpenspaceExtras(x0: number, z0: number, zw: number, zd: number): void {
    const corners: [number, number][] = [
      [x0 + 0.5, z0 + zd - 0.5],
      [x0 + zw - 0.5, z0 + zd - 0.5],
    ];
    for (const [px, pz] of corners) {
      const plant = this.fit(this.model('plant'), { height: 1.3 });
      this.anchor(plant, px, pz);
      this.scene.add(plant);
    }
    const bin = this.fit(this.model('trashcan'), { height: 0.6 });
    this.anchor(bin, x0 + zw - 0.5, z0 + 0.5);
    this.scene.add(bin);
  }

  private buildDesks(desks: readonly SceneDesk[]): void {
    for (const desk of desks) {
      if (!desk.isActive) continue;
      const cx = (desk.x + desk.width / 2) * S;
      const cz = (desk.y + desk.height / 2) * S;
      const w = desk.width * S;
      const d = desk.height * S;

      const table = this.fit(this.model('desk'), { footprint: Math.max(w, d) });
      this.anchor(table, cx, cz);
      this.scene.add(table);

      const monitor = this.fit(this.model('monitor'), { height: 0.55 });
      this.anchor(monitor, cx, cz - d * 0.25);
      this.scene.add(monitor);

      const chair = this.fit(this.model('chair-desk'), { height: 0.95 });
      this.anchor(chair, cx, cz + d * 0.85);
      chair.rotation.y = Math.PI;
      this.scene.add(chair);

      // Repère d'état au sol, cliquable (zone de survol agrandie au-dessus du repère).
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
      this.scene.add(marker);
      this.markers.set(desk.id, marker);

      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.1, 1.6, d * 1.1),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hit.position.set(cx, 0.8, cz);
      hit.userData['deskId'] = desk.id;
      this.scene.add(hit);
      this.hitboxes.push(hit);
    }
  }

  // ----- Utilitaires --------------------------------------------------------

  private box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
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

  private requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }
}
