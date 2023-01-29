import './main.css';
import { World } from 'sculpty';
import {
  Clock,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Input from './core/input';
import Drawing from './core/drawing';
import Materials from './core/materials';
import PatchShaders from './core/patches';
import PostProcessing from './core/postprocessing';
import Storage from './core/storage';
import Walk from './core/walk';
import Color from './ui/color';
import Exporter from './ui/exporter';
import Orientation from './ui/orientation';
import Size from './ui/size';
import Snapshot from './ui/snapshot';

PatchShaders();

const ui = document.getElementById('ui');
if (!ui) {
  throw new Error("Couldn't get ui");
}
const viewport = document.getElementById('viewport');
if (!viewport) {
  throw new Error("Couldn't get viewport");
}
viewport.addEventListener('contextmenu', (e) => e.preventDefault());
viewport.addEventListener('touchstart', (e) => e.preventDefault());

const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
const renderer = new WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(window.devicePixelRatio || 1);
const scene = new Scene();
scene.environment = (new PMREMGenerator(renderer)).fromScene(new RoomEnvironment(), 0.04).texture;
const postprocessing = new PostProcessing({ samples: 4 });

let needsUpdate = false;

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  postprocessing.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  needsUpdate = true;
};

resize();
window.addEventListener('resize', resize);
viewport.appendChild(renderer.domElement);

const materials = Materials();
const storage = new Storage({ chunkSize: 32 });
const world = new World({ history: true, materials, storage });
world.addEventListener('change', () => {
  needsUpdate = true;
});
scene.add(world);

const color = new Color();
const size = new Size();
const orientation = new Orientation();
new Exporter(world);
new Snapshot(postprocessing, renderer, camera, scene);
ui.style.display = '';

const controls = new OrbitControls(camera, viewport);
controls.addEventListener('change', () => {
  needsUpdate = true;
});
controls.enableDamping = true;
controls.enablePan = controls.enableRotate = false;
controls.dampingFactor = 0.1;
controls.maxDistance = 96;
controls.minDistance = 4;
controls.mouseButtons.MIDDLE = undefined;
controls.target.set(0, 8, 0);
camera.position.set(0, 16, 32);
const walk = new Walk(camera, controls, world);

const input = new Input(viewport);
const drawing = new Drawing(camera, color, orientation, size, world);
input.addEventListener('dragstart', (e: any) => {
  if (!controls.enablePan && !walk.isEnabled()) {
    drawing.start(e);
  }
});
input.addEventListener('dragmove', (e: any) => drawing.move(e));
input.addEventListener('dragend', () => drawing.end());
document.addEventListener('keydown', (e) => {
  const { ctrlKey, code, repeat, shiftKey } = e;
  if (!repeat && code === 'Escape') {
    ui.style.display = walk.toggle() ? 'none' : '';
  }
  if (!repeat && code === 'Tab') {
    e.preventDefault();
    materials.triangles.visible = !materials.triangles.visible;
    materials.voxels.visible = !materials.triangles.visible;
    needsUpdate = true;
  }
  if (!repeat && ctrlKey && code === 'Backspace') {
    e.preventDefault();
    localStorage.clear();
    location.reload();
  }
  if (walk.isEnabled()) {
    return;
  }
  if (!repeat && code === 'Space') {
    controls.enablePan = controls.enableRotate = true;
  }
  if (!repeat && ['Digit1', 'Digit2', 'Digit3'].includes(code)) {
    size.setValue(['Digit1', 'Digit2', 'Digit3'].indexOf(code));
  }
  if (!repeat && code === 'KeyE') {
    orientation.toggleMode();
  }
  if (ctrlKey && code === 'KeyZ') {
    e.preventDefault();
    if (shiftKey) {
      world.redo();
    } else {
      world.undo();
    }
  }
});
document.addEventListener('keyup', ({ code }) => {
  if (walk.isEnabled()) {
    return;
  }
  if (code === 'Space') {
    controls.enablePan = controls.enableRotate = false;
  }
});

const clock = new Clock();
document.addEventListener('visibilitychange', () => (
  document.visibilityState === 'visible' && clock.start()
));

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 1);
  controls.update();
  for (let i = 0; i < 4; i++) {
    walk.update(delta / 4);
  }
  if (needsUpdate) {
    needsUpdate = false;
    postprocessing.render(renderer, camera, scene);
  }
});

{
  const chunks: { x: number; y: number; z: number; d: number; }[] = [];
  const maxY = Math.min(
    1 + storage.listStored().reduce((max, { y }) => Math.max(max, y), 0),
    3
  );
  for (let z = -3; z <= 3; z++) {
    for (let y = 0; y <= maxY; y++) {
      for (let x = -3; x <= 3; x++) {
        chunks.push({ x, y, z, d: Math.sqrt(x * x + y * y + z * z)});
      }
    }
  }
  chunks.sort(({ d: a }, { d: b }) => a - b);
  chunks.forEach(({ x, y, z }) => (
    world.updateChunk(x, y, z)
  ));
}
