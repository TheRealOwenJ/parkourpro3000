import * as THREE from './three.module.js';

const container = document.getElementById('canvas-container');
const hud = document.getElementById('hud');
const pauseMenu = document.getElementById('pause-menu');

/* --- Kleuren --- */
const COLOR_SKY       = 0x6fb7ff;
const COLOR_GROUND    = 0x595959;
const COLOR_PLATFORM  = 0x49ff3a;
const COLOR_SPAWNPLAT = 0xf8ff00;
const COLOR_PLAYER    = 0xff0000;
const COLOR_LIGHT_DIR = 0xffffff;
const COLOR_LIGHT_AMB = 0xffffff;

let scene, camera, renderer;
let player, platforms = [];
let keys = {};
let running = true;
let paused = false;
let lastTime = performance.now();
let gravity = 30;
let platformCount = 28;

/* AABB Collision */
function aabbIntersect(ax, ay, az, aw, ah, ad, bx, by, bz, bw, bh, bd) {
  return Math.abs(ax - bx) <= (aw/2 + bw/2) &&
         Math.abs(ay - by) <= (ah/2 + bh/2) &&
         Math.abs(az - bz) <= (ad/2 + bd/2);
}

/* Scene setup */
function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLOR_SKY, 0.0025);

  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
  camera.position.set(0, 8, 14);
  camera.lookAt(0, 2, 0);
  camera.rotation.order = "YXZ";

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(COLOR_SKY);

  /* SCHADUW FIXES */
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.appendChild(renderer.domElement);

  /* Directional Light */
  const dir = new THREE.DirectionalLight(COLOR_LIGHT_DIR, 2.5);
  dir.position.set(5, 10, 7);
  dir.castShadow = true;

  dir.shadow.mapSize.width = 2048;
  dir.shadow.mapSize.height = 2048;

  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 50;
  dir.shadow.camera.left = -30;
  dir.shadow.camera.right = 30;
  dir.shadow.camera.top = 30;
  dir.shadow.camera.bottom = -30;

  scene.add(dir);

  const amb = new THREE.AmbientLight(COLOR_LIGHT_AMB, 0.35);
  scene.add(amb);

  /* Ground */
  const groundGeo = new THREE.BoxGeometry(1500, 2, 1500);
  const groundMat = new THREE.MeshStandardMaterial({
    color: COLOR_GROUND,
    roughness: 0.9,
    metalness: 0.0
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, -120, 0);
  ground.receiveShadow = true;
  scene.add(ground);
}

/* Platforms */
function addPlatform(x, y, z, w=3, h=0.5, d=3, color=COLOR_PLATFORM) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  scene.add(mesh);
  platforms.push({ mesh, x, y, z, w, h, d });
  return platforms[platforms.length - 1];
}

function ensureSpawnPlatform() {
  return addPlatform(0, 5, 0, 4, 0.6, 4, COLOR_SPAWNPLAT);
}

/* Genereer platforms binnen bereik van speler */
function generatePlatforms(baseY=0) {
  platforms.forEach(p => scene.remove(p.mesh));
  platforms = [];

  const spawn = ensureSpawnPlatform();
  let prev = spawn;

  for (let i = 0; i < platformCount; i++) {
    prev = addNextPlatform(prev);
  }
  return spawn;
}

function addNextPlatform(prev) {
  const maxXDist = 6;
  const maxZDist = 6;
  const minYDist = 2;
  const maxYDist = 3.5;

  const x = prev.x + (Math.random()*2 - 1) * maxXDist;
  const z = prev.z + (Math.random()*2 - 1) * maxZDist;
  const y = prev.y + minYDist + Math.random() * (maxYDist - minYDist);
  const w = 2 + Math.random() * 3;
  const d = 2 + Math.random() * 3;

  return addPlatform(x, y, z, w, 0.5, d);
}

/* Player */
function makePlayer() {
  const spawnPlatform = platforms.length > 0 ? platforms[0] : ensureSpawnPlatform();
  const geo = new THREE.BoxGeometry(0.6, 1.0, 0.6);
  const mat = new THREE.MeshStandardMaterial({
    color: COLOR_PLAYER,
    roughness: 0.8,
    metalness: 0.0
  });

  const mesh = new THREE.Mesh(geo, mat);

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  scene.add(mesh);

  const startY = spawnPlatform.y + spawnPlatform.h/2 + 1.0/2;

  return {
    mesh,
    x: spawnPlatform.x,
    y: startY,
    z: spawnPlatform.z,
    w: 0.6, h: 1.0, d: 0.6,
    vel: new THREE.Vector3(0, 0, 0),
    speed: 15.0,
    jumpPower: 20.0,
    onGround: false,
    squash: 0
  };
}

/* Resize */
window.addEventListener('resize', () => {
  if (!renderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

/* Input */
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyF') toggleFullscreen();
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

/* Fullscreen */
function toggleFullscreen() {
  if (!document.fullscreenElement) container.requestFullscreen().catch(()=>{});
  else document.exitFullscreen().catch(()=>{});
}

/* Pause Menu */
document.getElementById('btn-resume').onclick = () => togglePause(false);
document.getElementById('btn-restart').onclick = () => restartGame();

function togglePause(forceState) {
  if (typeof forceState === 'boolean') paused = forceState;
  else paused = !paused;
  pauseMenu.style.display = paused ? 'flex' : 'none';
  if (!paused) lastTime = performance.now(), animate();
}

/* Restart */
function restartGame() {
  const spawn = generatePlatforms();
  player.x = spawn.x;
  player.y = spawn.y + spawn.h/2 + player.h/2;
  player.z = spawn.z;
  player.vel.set(0,0,0);
  player.onGround = false;
  togglePause(false);
}

/* GAME START */
initScene();
player = makePlayer();
generatePlatforms();

/* Game Loop */
function animate() {
  if (!running || paused) return;
  requestAnimationFrame(animate);

  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05);

  /* Movement */
  const forward = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
  const strafe  = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);

  const moveDir = new THREE.Vector3(strafe, 0, forward);
  if (moveDir.lengthSq() > 0.0001) moveDir.normalize();
  const control = player.onGround ? 1.0 : 0.6;
  player.vel.x = moveDir.x * player.speed * control;
  player.vel.z = moveDir.z * player.speed * control;

  /* Squash / jump */
  player.squash += (player.onGround ? (1 - player.squash) * 0.2 : (0 - player.squash) * 0.15);
  if (keys['Space'] && player.onGround) player.vel.y = player.jumpPower, player.onGround = false;

  player.vel.y -= gravity * dt;
  player.x += player.vel.x * dt;
  player.y += player.vel.y * dt;
  player.z += player.vel.z * dt;

  /* Collision */
  player.onGround = false;
  for (let p of platforms) {
    if (aabbIntersect(player.x,player.y,player.z,player.w,player.h,player.d,
                      p.x,p.y,p.z,p.w,p.h,p.d)) {
      const playerFeet = player.y - player.h/2;
      const platformTop = p.y + p.h/2;
      if (player.vel.y <= 0 && playerFeet <= platformTop + 0.1) {
        player.y = platformTop + player.h/2;
        player.vel.y = 0;
        player.onGround = true;
      }
    }
  }

  /* Fall reset */
  if (player.y < -60) {
    const spawnPlatform = platforms[0];
    player.x = spawnPlatform.x;
    player.y = spawnPlatform.y + spawnPlatform.h/2 + player.h/2;
    player.z = spawnPlatform.z;
    player.vel.set(0,0,0);
    player.onGround = false;
  }

  /* Platform recycling */
  const below = player.y - 30;
  for (let i = platforms.length - 1; i >= 0; i--) {
    if (platforms[i].y < below) scene.remove(platforms[i].mesh), platforms.splice(i,1);
  }

  while (platforms.length < platformCount) {
    const highest = Math.max(...platforms.map(p=>p.y));
    addNextPlatform(platforms.reduce((a,b)=>a.y>b.y?a:b));
  }

  /* Apply positions & squash */
  const squashScale = 1 - 0.2 * player.squash;
  player.mesh.scale.set(1 + 0.1 * player.squash, squashScale, 1 + 0.1 * player.squash);
  player.mesh.position.set(player.x, player.y, player.z);
  platforms.forEach(p => p.mesh.position.set(p.x,p.y,p.z));

  /* Camera */
  const camOffset = new THREE.Vector3(0, 6, 12);
  const yaw = -0.35;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const rotated = new THREE.Vector3(
    camOffset.x * cosY + camOffset.z * sinY,
    camOffset.y,
    -camOffset.x * sinY + camOffset.z * cosY
  );

  const target = new THREE.Vector3(player.x + rotated.x, player.y + rotated.y, player.z + rotated.z);
  camera.position.lerp(target, 0.15);
  camera.lookAt(new THREE.Vector3(player.x, player.y + 0.9, player.z));

  hud.textContent = `Height: ${player.y.toFixed(1)}`;
  renderer.render(scene, camera);
}

animate();