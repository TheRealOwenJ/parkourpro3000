import * as THREE from './three.module.js';

const container = document.getElementById('canvas-container');
const hud = document.getElementById('hud');

/* ==========================
   CONSTANTEN
========================== */
const COLORS = {
  sky:       0x6fb7ff,
  ground:    0x595959,
  platform:  0x49ff3a,
  spawn:     0xf8ff00,
  player:    0xff0000,
  dirLight:  0xffffff,
  ambLight:  0xffffff
};

let scene, camera, renderer;
let player;
let platforms = [];
let keys = {};
let running = true;
let lastTime = performance.now();
let gravity = 30;
let platformCount = 28;

/* LIVE HEIGHT VALUE */
let height = 0;

/* ==========================
   AABB COLLISION
========================== */
function aabb(a, b) {
  return (
    Math.abs(a.x - b.x) <= (a.w/2 + b.w/2) &&
    Math.abs(a.y - b.y) <= (a.h/2 + b.h/2) &&
    Math.abs(a.z - b.z) <= (a.d/2 + b.d/2)
  );
}

/* ==========================
   SCENE
========================== */
function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.sky, 0.0025);

  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
  camera.position.set(0, 8, 14);
  camera.lookAt(0, 2, 0);
  camera.rotation.order = "YXZ";

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(COLORS.sky);

  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.appendChild(renderer.domElement);

  const dir = new THREE.DirectionalLight(COLORS.dirLight, 2.5);
  dir.position.set(5, 10, 7);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 50;
  dir.shadow.camera.left = -30;
  dir.shadow.camera.right = 30;
  dir.shadow.camera.top = 30;
  dir.shadow.camera.bottom = -30;
  scene.add(dir);

  const amb = new THREE.AmbientLight(COLORS.ambLight, 0.35);
  scene.add(amb);

  const groundGeo = new THREE.BoxGeometry(1500, 2, 1500);
  const groundMat = new THREE.MeshStandardMaterial({
    color: COLORS.ground,
    roughness: 0.9,
    metalness: 0.0
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, -120, 0);
  ground.receiveShadow = true;
  scene.add(ground);
}

/* ==========================
   PLATFORMS
========================== */
function addPlatform(x, y, z, w=3, h=0.5, d=3, color=COLORS.platform) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { w, h, d };
  scene.add(mesh);
  platforms.push(mesh);
  return mesh;
}

function generatePlatforms() {
  platforms.forEach(p => scene.remove(p));
  platforms = [];
  const spawn = addPlatform(0, 0, 0, 4, 0.6, 4, COLORS.spawn);
  let prev = spawn;
  for (let i = 0; i < platformCount; i++) prev = addNextPlatform(prev);
  return spawn;
}

function addNextPlatform(prev) {
  const minYDist = 4.0;
  const maxYDist = 6.0;
  let x, z;
  do {
    x = prev.position.x + (Math.random()*2 - 1) * 8;
    z = prev.position.z + (Math.random()*2 - 1) * 8;
  } while (Math.abs(x - prev.position.x) < 2 || Math.abs(z - prev.position.z) < 2);
  const y = prev.position.y + minYDist + Math.random() * (maxYDist - minYDist);
  const w = 2 + Math.random() * 3;
  const d = 2 + Math.random() * 3;
  return addPlatform(x, y, z, w, 0.5, d);
}

/* ==========================
   PLAYER
========================== */
function makePlayer() {
  if (platforms.length === 0) generatePlatforms();
  const spawn = platforms[0];
  const geo = new THREE.BoxGeometry(0.6, 1.0, 0.6);
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.player, roughness: 0.8, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const startY = spawn.position.y + 0.6/2 + 1/2;
  return { mesh, x: spawn.position.x, y: startY, z: spawn.position.z, w: 0.6, h: 1.0, d: 0.6, vel: new THREE.Vector3(), speed: 15, jumpPower: 20, onGround: false, squash: 0 };
}

/* ==========================
   RESIZE
========================== */
window.addEventListener('resize', () => {
  if (!renderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

/* ==========================
   INPUT
========================== */
window.addEventListener('keydown', (e) => { 
  if (e.code === 'ArrowUp') keys['KeyW'] = true; 
  else if (e.code === 'ArrowDown') keys['KeyS'] = true; 
  else if (e.code === 'ArrowLeft') keys['KeyA'] = true; 
  else if (e.code === 'ArrowRight') keys['KeyD'] = true; 
  else keys[e.code] = true; 
  if (e.code === 'KeyF') toggleFullscreen();
});

window.addEventListener('keyup', (e) => { 
  if (e.code === 'ArrowUp') keys['KeyW'] = false; 
  else if (e.code === 'ArrowDown') keys['KeyS'] = false; 
  else if (e.code === 'ArrowLeft') keys['KeyA'] = false; 
  else if (e.code === 'ArrowRight') keys['KeyD'] = false; 
  else keys[e.code] = false; 
});

function toggleFullscreen() {
  if (!document.fullscreenElement) container.requestFullscreen().catch(()=>{}); 
  else document.exitFullscreen().catch(()=>{});
}

/* ==========================
   RESTART
========================== */
function fullReset() {
  const spawn = generatePlatforms();
  player.x = spawn.position.x;
  player.y = spawn.position.y + spawn.userData.h/2 + player.h/2;
  player.z = spawn.position.z;
  player.vel.set(0,0,0);
  player.onGround = false;
  height = 0; // reset height
}

/* ==========================
   GAME START
========================== */
initScene();
generatePlatforms();
player = makePlayer();

let prevOnGround = false;

/* Camera support vectors */
const camOffset = new THREE.Vector3(0, 6, 12);
const rotated = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

/* ==========================
   GAME LOOP
========================== */
function animate() {
  if (!running) return;
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

  /* Squash */
  player.squash += (player.onGround ? (1 - player.squash) * 0.2 : (0 - player.squash) * 0.15);

  /* Gravity */
  player.vel.y -= gravity * dt;
  player.x += player.vel.x * dt;
  player.y += player.vel.y * dt;
  player.z += player.vel.z * dt;

  /* Collision */
  player.onGround = false;
  const pBox = { x: player.x, y: player.y, z: player.z, w: player.w, h: player.h, d: player.d };
  for (let p of platforms) {
    const ud = p.userData;
    const box = { x: p.position.x, y: p.position.y, z: p.position.z, w: ud.w, h: ud.h, d: ud.d };
    if (!aabb(pBox, box)) continue;
    const playerTop = player.y + player.h/2;
    const playerBottom = player.y - player.h/2;
    const platTop = box.y + box.h/2;
    const platBottom = box.y - box.h/2;

    if (player.vel.y <= 0 && playerBottom <= platTop && playerTop > platTop) {
      player.y = platTop + player.h/2;
      player.vel.y = 0;
      player.onGround = true;
    } else if (player.vel.y > 0 && playerTop >= platBottom && playerBottom < platBottom) {
      player.y = platBottom - player.h/2;
      player.vel.y = 0;
    }
  }

  /* Auto-jump */
  if (!prevOnGround && player.onGround) {
    player.vel.y = player.jumpPower;
    player.onGround = false;
  }
  prevOnGround = player.onGround;

  /* Fall reset */
  if (player.y < -60) fullReset();

  /* Cleanup & spawn */
  const below = player.y - 30;
  for (let i = platforms.length - 1; i >= 0; i--) {
    if (platforms[i].position.y < below) {
      scene.remove(platforms[i]);
      platforms.splice(i, 1);
    }
  }
  while (platforms.length < platformCount) {
    const top = platforms.reduce((a,b)=> a.position.y > b.position.y ? a : b);
    addNextPlatform(top);
  }

  /* LIVE HEIGHT SYSTEM */
  let maxPlatform = -Infinity;
  for (let p of platforms) {
    if (p.position.y <= player.y - player.h/2) maxPlatform = Math.max(maxPlatform, p.position.y);
  }
  height = Math.floor(Math.max(0, maxPlatform));

  /* Visuals */
  const squashScale = 1 - 0.2 * player.squash;
  player.mesh.scale.set(1 + 0.1 * player.squash, squashScale, 1 + 0.1 * player.squash);
  player.mesh.position.set(player.x, player.y, player.z);

  /* Camera */
  const yaw = -0.35;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  rotated.set(
    camOffset.x * cosY + camOffset.z * sinY,
    camOffset.y,
    -camOffset.x * sinY + camOffset.z * cosY
  );
  camTarget.set(player.x + rotated.x, player.y + rotated.y, player.z + rotated.z);
  camera.position.lerp(camTarget, 0.15);
  lookTarget.set(player.x, player.y + 0.9, player.z);
  camera.lookAt(lookTarget);

  /* HUD */
  hud.textContent = `Height: ${height}`;
  renderer.render(scene, camera);
}

animate();