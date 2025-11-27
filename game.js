import * as THREE from './three.module.js';

const container = document.getElementById('canvas-container');
const hud = document.getElementById('hud');
const pauseMenu = document.getElementById('pause-menu');

// Vervang mainMenu door je start menu div (hier: buttons en titel)
const mainMenu = document.createElement('div');
mainMenu.style.position = 'absolute';
mainMenu.style.top = '0';
mainMenu.style.left = '0';
mainMenu.style.width = '100%';
mainMenu.style.height = '100%';
mainMenu.style.display = 'flex';
mainMenu.style.flexDirection = 'column';
mainMenu.style.alignItems = 'center';
mainMenu.style.justifyContent = 'center';
mainMenu.style.background = 'rgba(0,0,0,0.3)';
container.appendChild(mainMenu);

// Voeg start, controls, fullscreen buttons toe aan mainMenu
['Start','Controls','Fullscreen'].forEach(text => {
  const btn = document.getElementById('btn-' + text.toLowerCase());
  if(btn) mainMenu.appendChild(btn);
});

let scene, camera, renderer;
let player, platforms = [];
let keys = {};
let running = false;
let paused = false;
let lastTime = performance.now();
let gravity = 30;
let platformCount = 28;

// ----- Utility: AABB collision -----
function aabbIntersect(ax, ay, az, aw, ah, ad, bx, by, bz, bw, bh, bd) {
  return Math.abs(ax - bx) <= (aw/2 + bw/2) &&
         Math.abs(ay - by) <= (ah/2 + bh/2) &&
         Math.abs(az - bz) <= (ad/2 + bd/2);
}

// ----- Create scene -----
function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x6fb7ff, 0.0025);

  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
  camera.position.set(0, 8, 14);
  camera.lookAt(0, 2, 0);
  camera.rotation.order = "YXZ";

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setClearColor(0x6fb7ff);
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);
  container.appendChild(mainMenu);
  container.appendChild(pauseMenu);
  container.appendChild(hud);

  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(5, 10, 7);
  scene.add(dir);
  const amb = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(amb);

  const groundGeo = new THREE.BoxGeometry(200, 2, 200);
  const groundMat = new THREE.MeshLambertMaterial({ color:0x2e8b57 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, -120, 0);
  scene.add(ground);
}

// ----- Player object -----
function makePlayer() {
  const geo = new THREE.BoxGeometry(0.6, 1.0, 0.6);
  const mat = new THREE.MeshLambertMaterial({ color:0xff3333 });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return {
    mesh,
    x:0, y:6, z:0,
    w:0.6, h:1.0, d:0.6,
    vel: new THREE.Vector3(0,0,0),
    speed: 15.0,
    jumpPower: 20.0,
    onGround: false
  };
}

// ----- Platform factory -----
function addPlatform(x, y, z, w=3, h=0.5, d=3, color=0x2fbf4f) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  platforms.push({ mesh, x, y, z, w, h, d });
}

// ensure platform under spawn
function ensureSpawnPlatform(spawnX, spawnY, spawnZ) {
  addPlatform(spawnX, spawnY - 1.0, spawnZ, 4.0, 0.6, 4.0, 0x3aa04a);
}

// ----- Generate initial platforms -----
function generatePlatforms(baseY=0) {
  platforms.forEach(p => scene.remove(p.mesh));
  platforms = [];
  ensureSpawnPlatform(0, 6, 0);
  let y = baseY + 3.0;
  for (let i=0;i<platformCount;i++) {
    const x = (Math.random()-0.5) * 12;
    const z = (Math.random()-0.5) * 20;
    const w = 2 + Math.random() * 3;
    const d = 2 + Math.random() * 3;
    addPlatform(x, y, z, w, 0.5, d, 0x2fbf4f);
    y += 2.5 + Math.random() * 2.0;
  }
}

// ----- Resize handler -----
function onWindowResize(){
  if (!renderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight, false);
}
window.addEventListener('resize', onWindowResize);

/* Controls */
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape' && running) togglePause();
  if (e.code === 'KeyF') toggleFullscreen();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

/* Fullscreen helper */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(()=>{});
  } else {
    document.exitFullscreen().catch(()=>{});
  }
}

/* Menu buttons */
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-controls').addEventListener('click', () => {
  alert('WASD: bewegen\nSpace: springen\nEsc: pauze\nF: fullscreen');
});
document.getElementById('btn-full').addEventListener('click', toggleFullscreen);
document.getElementById('btn-resume').addEventListener('click', () => togglePause());
document.getElementById('btn-restart').addEventListener('click', () => {
  restartGame();
  togglePause(false);
});
document.getElementById('btn-main').addEventListener('click', stopToMainMenu);

/* Game logic */
function startGame() {
    mainMenu.style.display = 'none';
    paused = false;
    running = true;
    lastTime = performance.now();

    // Init scene, camera, renderer
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x6fb7ff, 0.0025);

    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
    camera.position.set(0, 8, 14);
    camera.lookAt(0, 2, 0);
    camera.rotation.order = "YXZ";

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x6fb7ff);

    container.appendChild(renderer.domElement); // canvas nu toegevoegd

    // Licht
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(amb);

    // Ground
    const groundGeo = new THREE.BoxGeometry(200, 2, 200);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -120, 0);
    scene.add(ground);

    // Player en platforms
    player = makePlayer();
    generatePlatforms(0);
    player.x = 0; player.y = 6; player.z = 0;
    player.vel.set(0, 0, 0);

    animate();
}


function restartGame() {
  generatePlatforms(0);
  player.x = 0; player.z = 0; player.y = 6;
  player.vel.set(0,0,0);
  player.onGround = false;
}

function stopToMainMenu() {
  running = false;
  paused = false;
  pauseMenu.style.display = 'none';
  mainMenu.style.display = 'flex';
  if (renderer && renderer.domElement) {
    renderer.domElement.remove();
    renderer = null;
  }
}

function togglePause(forceState) {
  if (typeof forceState === 'boolean') paused = forceState;
  else paused = !paused;
  pauseMenu.style.display = paused ? 'flex' : 'none';
  if (!paused) {
    lastTime = performance.now();
    animate();
  }
}

/* Game loop */
function animate() {
  if (!running || paused) return;
  requestAnimationFrame(animate);
  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05);

  const forward = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
  const strafe  = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const moveDir = new THREE.Vector3(strafe,0,forward);
  if (moveDir.lengthSq() > 0.0001) moveDir.normalize();
  const control = player.onGround ? 1.0 : 0.6;
  player.vel.x = moveDir.x * player.speed * control;
  player.vel.z = moveDir.z * player.speed * control;
  if (keys['Space'] && player.onGround) {
    player.vel.y = player.jumpPower;
    player.onGround = false;
  }
  player.vel.y -= gravity * dt;
  player.x += player.vel.x * dt;
  player.y += player.vel.y * dt;
  player.z += player.vel.z * dt;

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
      } else {
        const overlapX = (player.w/2 + p.w/2) - Math.abs(player.x - p.x);
        const overlapY = (player.h/2 + p.h/2) - Math.abs(player.y - p.y);
        const overlapZ = (player.d/2 + p.d/2) - Math.abs(player.z - p.z);
        if (overlapX < overlapY && overlapX < overlapZ) player.x += (player.x < p.x?-overlapX:overlapX);
        else if (overlapZ < overlapY) player.z += (player.z < p.z?-overlapZ:overlapZ);
      }
    }
  }

  if (player.y < -60) {
    const highest = Math.max(...platforms.map(p=>p.y));
    player.x = 0; player.z = 0; player.y = highest + 5;
    player.vel.set(0,0,0);
  }

  const belowThreshold = player.y - 30;
  for (let i = platforms.length - 1; i >= 0; i--) {
    if (platforms[i].y < belowThreshold) {
      scene.remove(platforms[i].mesh);
      platforms.splice(i,1);
    }
  }
  while (platforms.length < platformCount) {
    const highest = Math.max(...platforms.map(p=>p.y));
    const x = (Math.random()-0.5) * 14;
    const z = (Math.random()-0.5) * 24;
    const y = highest + (2.2 + Math.random()*3.2);
    const w = 2 + Math.random()*3;
    const d = 2 + Math.random()*3;
    addPlatform(x, y, z, w, 0.5, d, 0x2fbf4f);
  }

  player.mesh.position.set(player.x, player.y, player.z);
  for (let p of platforms) p.mesh.position.set(p.x,p.y,p.z);

  const camOffset = new THREE.Vector3(0,6,12);
  const yaw = -0.35;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const rotatedOffset = new THREE.Vector3(
    camOffset.x * cosY + camOffset.z * sinY,
    camOffset.y,
    -camOffset.x * sinY + camOffset.z * cosY
  );
  const camTarget = new THREE.Vector3(player.x + rotatedOffset.x, player.y + rotatedOffset.y, player.z + rotatedOffset.z);
  camera.position.lerp(camTarget, 0.15);
  camera.lookAt(new THREE.Vector3(player.x, player.y + 0.9, player.z));

  hud.textContent = `Y: ${player.y.toFixed(1)}  |  Platforms: ${platforms.length}`;
  renderer.render(scene, camera);
}