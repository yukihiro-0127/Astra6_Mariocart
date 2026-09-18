import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const PALETTE = { asphalt: 0x283d46, edge: 0x40555c, cream: 0xf7e6c7, coral: 0xf07c56, cyan: 0x65e4df, steel: 0x51646a, dark: 0x23343d };
const clamp = THREE.MathUtils.clamp;
function seeded(seed = 2091) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function matte(color, options = {}) { return new THREE.MeshLambertMaterial({ color, emissive: options.emissive || 0, emissiveIntensity: options.emissiveIntensity ?? 1 }); }
function material(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .76, metalness: .12, ...options }); }
function ribbon(points, from, to, y = 0) {
  const vertices = [], indices = [], uvs = [];
  points.forEach((p, i) => {
    const half = p.width / 2;
    vertices.push(p.x + p.nx * from * half, p.y + y, p.z + p.nz * from * half,
      p.x + p.nx * to * half, p.y + y, p.z + p.nz * to * half);
    uvs.push(0, i, 1, i);
    if (i) { const k = i * 2; indices.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}
function strip(points, offset, width, y) {
  return ribbon(points.map(p => ({ ...p, x: p.x + p.nx * offset, z: p.z + p.nz * offset, width })), -1, 1, y);
}

/** Entire world and vehicles are original procedural geometry; no downloaded art. */
export class WorldRenderer {
  constructor(canvas, track) {
    this.track = track;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    this.softwareGPU = !!debugInfo && /SwiftShader|llvmpipe|software/i.test(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
    this.renderScale = this.softwareGPU ? .8 : Math.min(devicePixelRatio, CONFIG.render.maxPixelRatio);
    this.renderer.setPixelRatio(this.renderScale);
    this.qualityTime = 0; this.qualityFrames = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.softwareGPU;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd5a795);
    this.scene.fog = new THREE.FogExp2(0xc7998e, .00185);
    this.camera = new THREE.PerspectiveCamera(63, 1, .15, 2100);
    this.camera.position.set(0, 12, -24);
    this.cameraTarget = new THREE.Vector3();
    this.readyCamera = false;
    this.vehicleGroups = new Map();
    this.trapGroups = [];
    this.gateLights = [];
    this.animated = [];
    this.batches = new Map();
    this.geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
      sphere: new THREE.SphereGeometry(1, 10, 8),
    };
    this.mats = {
      road: matte(PALETTE.asphalt),
      edge: matte(PALETTE.edge),
      cream: matte(PALETTE.cream),
      coral: matte(PALETTE.coral),
      cyan: matte(PALETTE.cyan, { emissive: PALETTE.cyan, emissiveIntensity: .65 }),
      rail: matte(0x4c979b, { metalness: .4 }),
      shortcut: matte(0xdcfa78, { emissive: 0x7f9841, emissiveIntensity: .22 }),
      steel: matte(PALETTE.steel),
      dark: matte(PALETTE.dark),
      windows: matte(0xffcd85, { emissive: 0xffb56a, emissiveIntensity: .6 }),
      tower1: matte(0x596974),
      tower2: matte(0x78848a),
      tower3: matte(0x917d78),
      tower4: matte(0x566569),
    };
    this.mats.architecture = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.addLighting();
    this.addSky();
    this.buildTrack();
    this.buildCity();
    this.flushBatches();
    this.buildStart();
    this.createParticles();
    this.resize();
  }

  addLighting() {
    this.scene.add(new THREE.HemisphereLight(0xd4e8ef, 0x58484e, 2.2));
    const sun = new THREE.DirectionalLight(0xffd0a1, 3.3);
    sun.position.set(-180, 220, -140);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -65; sun.shadow.camera.right = 65;
    sun.shadow.camera.top = 65; sun.shadow.camera.bottom = -65;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
    sun.shadow.normalBias = .05; sun.shadow.bias = -.0002;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;
  }

  addSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDirection: { value: new THREE.Vector3(-.63, .19, -.74).normalize() } },
      vertexShader: 'varying vec3 vWorld; void main(){ vWorld=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec3 vWorld; uniform vec3 sunDirection;
      void main(){vec3 d=normalize(vWorld); float h=d.y;
      vec3 c=mix(vec3(.97,.68,.49),vec3(.28,.40,.55),smoothstep(-.02,.52,h));
      c=mix(vec3(.39,.34,.40),c,smoothstep(-.35,.03,h));
      float a=dot(d,sunDirection); c+=vec3(.45,.23,.09)*pow(max(a,0.),16.);
      c=mix(c,vec3(1.,.88,.62),smoothstep(.9975,.9982,a));
      gl_FragColor=vec4(c,1.); }`,
    }));
    sky.renderOrder = -10; this.scene.add(sky); this.sky = sky;
  }

  add(geometry, key, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const g = geometry.clone();
    if (key.startsWith('tower')) {
      const color = this.mats[key].color, colors = [];
      for (let i = 0; i < g.attributes.position.count; i++) colors.push(color.r, color.g, color.b);
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); key = 'architecture';
    }
    if (this.batchRegion) key += '@' + this.batchRegion;
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    if (!this.batches.has(key)) this.batches.set(key, []);
    this.batches.get(key).push(g);
  }
  box(key, x, y, z, sx, sy, sz, ry = 0, rz = 0) { this.add(this.geo.box, key, [x, y, z], [sx, sy, sz], [0, ry, rz]); }
  beam(key, a, b, width, depth = width) {
    if (this.batchRegion) key += '@' + this.batchRegion;
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), diff = bv.clone().sub(av);
    const g = this.geo.box.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(av.add(bv).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(UP, diff.clone().normalize()), new THREE.Vector3(width, diff.length(), depth)));
    if (!this.batches.has(key)) this.batches.set(key, []); this.batches.get(key).push(g);
  }
  raw(g, key) { if (!this.batches.has(key)) this.batches.set(key, []); this.batches.get(key).push(g); }
  flushBatches() {
    for (const [batchKey, geometries] of this.batches) {
      const key = batchKey.split('@')[0];
      // Strip UVs so boxes, custom ribbons and cylinders can share one draw call.
      for (const g of geometries) { g.deleteAttribute('uv'); if (g.index) { const flat = g.toNonIndexed(); g.copy(flat); flat.dispose(); } }
      const merged = mergeGeometries(geometries, false);
      const mesh = new THREE.Mesh(merged, this.mats[key]);
      mesh.receiveShadow = ['road', 'edge', 'cream', 'steel'].includes(key);
      mesh.castShadow = false;
      this.scene.add(mesh);
      geometries.forEach(g => g.dispose());
    }
    this.batches.clear();
  }

  buildTrack() {
    const track = this.track;
    const pointCount = Math.ceil(track.length / 2.8) + 1;
    const points = Array.from({ length: pointCount }, (_, i) => track.sample(i / (pointCount - 1) * track.length));
    this.raw(ribbon(points, -1, 1, .045), 'road');
    this.raw(ribbon(points, -1.1, -1, -.035), 'cream');
    this.raw(ribbon(points, 1, 1.1, -.035), 'cream');
    this.raw(ribbon(points, -1.12, 1.12, -.65), 'edge');
    this.raw(ribbon(points, -.93, -.915, .061), 'cyan');
    this.raw(ribbon(points, .915, .93, .061), 'cyan');
    for (let s = 0; s < track.length; s += 7) {
      const a = track.sample(s), b = track.sample(s + 3.2), heading = Math.atan2(a.tx, a.tz);
      for (const side of [-1, 1]) {
        const off = a.width * .525 * side;
        this.box((Math.floor(s / 7) % 2 === 0) ? 'coral' : 'cream', a.x + a.nx * off, a.y + .055, a.z + a.nz * off, 1.15, .22, 3.5, heading);
        const sc=track.shortcut;
        const junction=sc&&side===1&&((s>sc.start+64&&s<sc.start+106)||(s>sc.end-21&&s<sc.end+22));
        if (a.guarded !== false && !junction) {
          const x = a.x + a.nx * (a.width * .56 + .2) * side, z = a.z + a.nz * (a.width * .56 + .2) * side;
          const bx = b.x + b.nx * (b.width * .56 + .2) * side, bz = b.z + b.nz * (b.width * .56 + .2) * side;
          this.box('steel', x, a.y + .7, z, .23, 1.4, .4, heading);
          const c = track.sample(s + 7.25);
          this.beam('rail', [x, a.y + 1.05, z], [c.x + c.nx * (c.width * .56 + .2) * side, c.y + 1.05, c.z + c.nz * (c.width * .56 + .2) * side], .24, .34);
          if (Math.floor(s / 7) % 3 === 0) this.beam('cyan', [x, a.y + 1.22, z], [bx, b.y + 1.22, bz], .075, .12);
        }
      }
      if (Math.floor(s / 7) % 2 === 0) this.box('edge', a.x, a.y + .055, a.z, .12, .02, 2.1, heading);
    }
    for (let s = 28; s < track.length; s += 43) this.addRoadArrow(track.sample(s), 'cream');
    for (let s = 18; s < track.length; s += 72) {
      const p = track.sample(s);
      this.box('dark', p.x, p.y - 8.5, p.z, 3, 16, 4, Math.atan2(p.tx, p.tz));
      this.box('steel', p.x, p.y - 1.8, p.z, p.width + 4, 2.1, 5, Math.atan2(p.tx, p.tz));
      for (const side of [-1, 1]) this.beam('steel', [p.x, p.y - 11, p.z], [p.x + p.nx * p.width * .43 * side, p.y - 2, p.z + p.nz * p.width * .43 * side], 1.1);
    }
    for (const gs of track.gates || []) this.buildGate(track.sample(typeof gs === 'number' ? gs : gs.s));
    if (track.shortcut?.sample) {
      const sc = track.shortcut;
      const pointCount = Math.ceil(sc.length / 2) + 1;
      const pts = Array.from({ length: pointCount }, (_, i) => ({ ...sc.sample(i / (pointCount - 1) * sc.length), width: sc.width || 7 }));
      this.raw(ribbon(pts, -1, 1, .12), 'edge');
      this.raw(ribbon(pts, -.96, -.88, .14), 'shortcut');
      this.raw(ribbon(pts, .88, .96, .14), 'shortcut');
      for (let i = 4; i < pts.length - 4; i += 9) this.addRoadArrow(pts[i], 'shortcut', .65);
      for (let i = 0; i < pts.length; i += 10) {
        const p = pts[i];
        this.box('dark', p.x, p.y - 5, p.z, 1, 9, 2);
      }
    }
    if(track.shortcut){
      const p=track.sample(track.shortcut.start+49), h=Math.atan2(p.tx,p.tz);
      const board=new THREE.Group();board.position.set(p.x+p.nx*13.2,p.y,p.z+p.nz*13.2);board.rotation.y=h;
      const post=new THREE.Mesh(new THREE.BoxGeometry(.25,4,.25),this.mats.steel);post.position.y=2;board.add(post);
      const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle='#203337';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#dcfa78';ctx.lineWidth=10;ctx.strokeRect(5,5,502,150);ctx.fillStyle='#dcfa78';ctx.font='bold 40px Arial';ctx.textAlign='center';ctx.fillText('CUT-THROUGH',256,66);ctx.font='22px Arial';ctx.fillText('NARROW DECK / KEEP LEFT',256,112);
      const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const panel=new THREE.Mesh(new THREE.PlaneGeometry(7,2.2),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));panel.position.y=3.7;panel.rotation.y=Math.PI;board.add(panel);this.scene.add(board);
    }
    if (track.jump) {
      const { start, end, height = 1.8 } = track.jump;
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const pts = Array.from({ length: 12 }, (_, i) => {
          const p = track.sample(start + (end - start) * i / 11);
          return { ...p, y: p.y + height * i / 11, width: p.width * .63 };
        });
        this.raw(ribbon(pts, -1, 1, .09), 'steel');
        for (let i = 1; i < 10; i += 2) {
          const p = pts[i]; this.box('coral', p.x, p.y + .1, p.z, p.width, .025, .5, Math.atan2(p.tx, p.tz));
        }
        this.addRoadArrow(pts[7], 'cream');
      }
    }
  }

  addRoadArrow(p, key, scale = 1) {
    const forward = new THREE.Vector3(p.tx, 0, p.tz), normal = new THREE.Vector3(p.nx, 0, p.nz);
    const base = new THREE.Vector3(p.x, p.y + .07, p.z);
    for (const dir of [-1, 1]) {
      const a = base.clone().addScaledVector(normal, dir * 1.4 * scale).addScaledVector(forward, -1.2 * scale);
      const b = base.clone().addScaledVector(forward, 1.25 * scale);
      this.beam(key, a.toArray(), b.toArray(), .28 * scale, .045);
    }
  }

  buildGate(p) {
    const heading = Math.atan2(p.tx, p.tz), spread = p.width * .4;
    for (const side of [-1, 1]) {
      const x = p.x + p.nx * spread * side, z = p.z + p.nz * spread * side;
      this.box('steel', x, p.y + 2.7, z, .8, 5.4, .85, heading);
      this.box('cyan', x, p.y + 2.85, z, .16, 4.4, 1, heading);
      this.box('cream', x, p.y + .35, z, 1.8, .7, 1.8, heading);
    }
    this.box('dark', p.x, p.y + 5.45, p.z, spread * 2 + 1, .65, .85, heading);
    this.box('cyan', p.x, p.y + 5.05, p.z, spread * 2 - 1, .12, .72, heading);
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(.65), new THREE.MeshStandardMaterial({ color: 0x8cfff4, emissive: 0x55eedf, emissiveIntensity: 2, metalness: .2, roughness: .25 }));
    glow.position.set(p.x, p.y + 3.2, p.z); this.scene.add(glow); this.gateLights.push(glow);
    const linePoints = [new THREE.Vector3(p.x + p.nx * spread, p.y + .09, p.z + p.nz * spread), new THREE.Vector3(p.x - p.nx * spread, p.y + .09, p.z - p.nz * spread)];
    this.beam('cyan', linePoints[0].toArray(), linePoints[1].toArray(), .1, .4);
  }

  buildCity() {
    const random = seeded();
    const positions = [...(this.track.samples || Array.from({ length: 100 }, (_, i) => this.track.sample(this.track.length * i / 100))), ...(this.track.shortcut?.samples || [])];
    const xs = positions.map(p => p.x), zs = positions.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
    const nearRoad = (x, z, margin) => positions.some((p, i) => i % 3 === 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < (p.width / 2 + margin) ** 2);
    let count = 0;
    for (let i = 0; i < 420 && count < 165; i++) {
      const x = centerX + (random() - .5) * (maxX - minX + 560), z = centerZ + (random() - .5) * (maxZ - minZ + 560);
      const width = 12 + random() * 16, depth = 12 + random() * 16, height = 24 + random() ** 1.7 * 120;
      if (nearRoad(x, z, width * .8 + 19)) continue;
      count++;
      this.batchRegion = `${Math.floor(x / 180)}:${Math.floor(z / 180)}`;
      const ground = -55 - random() * 22, key = `tower${1 + Math.floor(random() * 4)}`;
      this.box(key, x, ground + height / 2, z, width, height, depth);
      this.box('dark', x, ground + 3, z, width + 6, 5, depth + 6);
      if (count % 3 === 0) {
        this.box(key, x + width * .8, ground + height * .22, z, width * .7, height * .44, depth * .85);
        this.box('steel', x + width * .8, ground + height * .44 + .4, z, width * .75, .8, depth * .9);
      }
      this.box('dark', x, ground + height + .7, z, width + 1.4, 1.4, depth + 1.4);
      this.box('steel', x, ground + height + 3, z, width * .55, 5, depth * .55);
      // Facades use large architectural bands, no texture or image assets.
      for (let h = 8; h < height - 2; h += 10) {
        this.box('dark', x, ground + h, z - depth / 2 - .12, width + .1, 1.5, .28);
        this.box('dark', x, ground + h, z + depth / 2 + .12, width + .1, 1.1, .28);
        if (random() > .3) {
          this.box('windows', x - width * .16, ground + h + 2, z - depth / 2 - .24, width * .49, .65, .24);
          this.box('windows', x + width * .12, ground + h + 2, z + depth / 2 + .24, width * .56, .65, .24);
        }
        this.box('steel', x + width / 2 + .12, ground + h, z, .28, 1.5, depth);
        this.box('steel', x - width / 2 - .12, ground + h, z, .28, 1.5, depth);
        if (random() > .6) {
          this.box('cyan', x + width / 2 + .28, ground + h + 2.1, z, .22, .5, depth * .56);
          this.box('windows', x - width / 2 - .28, ground + h + 2.1, z, .22, .5, depth * .56);
        }
      }
      this.box('steel', x - width * .25, ground + height * .5, z - depth * .5 - .3, .65, height, .5);
      this.box('steel', x + width * .25, ground + height * .5, z + depth * .5 + .3, .65, height, .5);
      if (count % 3 === 0) {
        this.box('coral', x - width * .38, ground + height * .55, z + depth / 2 + .6, .7, height * .8, .7);
        this.box('cream', x + width / 2 + .7, ground + height * .4, z + depth * .2, 1.3, height * .67, 1.1);
      }
      if (count % 4 === 0) {
        this.box('dark', x, ground + height + 9, z, .5, 14, .5);
        this.add(this.geo.sphere, 'coral', [x, ground + height + 16, z], [.65, .65, .65]);
      }
      if (count % 9 === 0) this.buildCrane(x, ground + height + 2, z, 19 + random() * 12);
      if (count % 5 === 0) {
        for (const side of [-1, 1]) {
          this.add(this.geo.cylinder, 'steel', [x + side * width * .23, ground + height + 6, z], [2.1, 10, 2.1]);
          this.add(this.geo.cylinder, 'cream', [x + side * width * .23, ground + height + 11, z], [2.6, .8, 2.6]);
        }
      }
    }
    this.batchRegion = null;
    // Floating foundry platforms beyond the circuit make its suspended structure legible.
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2, radius = 250 + random() * 130;
      const x = centerX + Math.sin(angle) * radius, z = centerZ + Math.cos(angle) * radius;
      const y = -48 + random() * 38;
      this.box('steel', x, y, z, 55, 4, 40);
      this.box('dark', x, y - 6, z, 43, 8, 30);
      this.box('cyan', x, y - 10.3, z, 24, .6, 16);
    }
    // High, distant freight ships drift through the city, never across the track.
    for (let i = 0; i < 5; i++) {
      const ship = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 6), this.mats.dark); ship.add(hull);
      const freight = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 5), this.mats[i % 2 ? 'steel' : 'coral']); freight.position.y = 2.5; ship.add(freight);
      const engine = new THREE.Mesh(new THREE.BoxGeometry(4, .35, 5), this.mats.cyan); engine.position.set(-6, -1.65, 0); ship.add(engine);
      ship.position.set(centerX + (random() - .5) * 600, 65 + i * 12, centerZ + 160 + i * 50);
      this.scene.add(ship); this.animated.push({ group: ship, x: ship.position.x, z: ship.position.z, phase: i * 2, speed: 3 + random() * 2 });
    }
    // Broad floating haze layers soften the bottom of the skyline.
    const clouds = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xead1ba, transparent: true, opacity: .17, depthWrite: false });
    const cloudGeo = new THREE.SphereGeometry(1, 10, 6);
    for (let i = 0; i < 20; i++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(centerX + (random() - .5) * 1500, -80 + random() * 15, centerZ + (random() - .5) * 1500);
      cloud.scale.set(95 + random() * 160, 8 + random() * 6, 35 + random() * 60); clouds.add(cloud);
    }
    this.scene.add(clouds);
  }

  buildCrane(x, y, z, height) {
    this.box('coral', x, y + height / 2, z, 1.2, height, 1.2);
    this.box('coral', x + 8, y + height, z, 28, 1.2, 1.2);
    this.beam('steel', [x, y + height + 7, z], [x + 21, y + height, z], .3);
    this.beam('steel', [x, y + height + 7, z], [x - 5, y + height, z], .3);
    this.box('steel', x, y + height + 3.5, z, .6, 7, .6);
    this.box('cream', x - 5, y + height - 1.5, z, 4, 3, 3);
    this.box('dark', x + 19, y + height - 6, z, .12, 12, .12);
  }

  buildStart() {
    const p = this.track.sample(0), h = Math.atan2(p.tx, p.tz);
    const group = new THREE.Group(); group.position.set(p.x, p.y, p.z); group.rotation.y = h;
    const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); group.add(o); return o; };
    for (const side of [-1, 1]) {
      mesh(new THREE.BoxGeometry(1.1, 8.3, 1.6), this.mats.cream, side * (p.width * .5 + .3), 4.15, 0);
      mesh(new THREE.BoxGeometry(.24, 6.5, 1.75), this.mats.coral, side * (p.width * .5 + .3), 4.1, 0);
    }
    mesh(new THREE.BoxGeometry(p.width + 3, 2.3, 1.4), this.mats.dark, 0, 8.2, 0);
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#253840'; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#f5e8cd'; ctx.font = '900 67px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A E R O F O R G E', 512, 78);
    ctx.fillStyle = '#78d8d3'; ctx.font = 'bold 19px Arial, sans-serif'; ctx.fillText('S K Y L I N E   F O U N D R Y   C I R C U I T', 512, 110);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const approach = mesh(new THREE.PlaneGeometry(p.width + 1.6, 2), signMat, 0, 8.2, -.72); approach.rotation.y = Math.PI;
    mesh(new THREE.PlaneGeometry(p.width + 1.6, 2), signMat, 0, 8.2, .72);
    for (let i = -2; i <= 2; i++) mesh(new THREE.BoxGeometry(.55, .25, .2), this.mats.cyan, i * 1.1, 6.8, -.8);
    // Original segmented timing line instead of a borrowed racing checkerboard.
    for (let i = -5; i <= 5; i++) {
      mesh(new THREE.BoxGeometry(1.32, .05, .5), this.mats.cream, i * 1.7, .09, 0);
      mesh(new THREE.BoxGeometry(.22, .05, 3), this.mats.coral, i * 1.7, .085, 1.2);
    }
    this.scene.add(group);
  }

  createVehicle(racer) {
    const group = new THREE.Group();
    const accent = material(racer.color || 0x68c6c7, { roughness: .36, metalness: .38 });
    const cream = material(0xf2e7ce, { roughness: .48, metalness: .18 });
    const dark = material(0x192a32, { roughness: .5, metalness: .55 });
    const glass = material(0x233f48, { roughness: .15, metalness: .85 });
    const glow = material(0x80fff0, { emissive: 0x3df4e1, emissiveIntensity: 1.7 });
    const red = material(0xff9167, { emissive: 0xff553a, emissiveIntensity: 1 });
    const batches = new Map();
    const part = (g, mat, pos, scale = [1, 1, 1], rot = [0, 0, 0]) => {
      const clone = g.clone(); clone.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
      clone.deleteAttribute('uv'); let final = clone.index ? clone.toNonIndexed() : clone;
      if (!batches.has(mat)) batches.set(mat, []); batches.get(mat).push(final); if (final !== clone) clone.dispose();
    };
    const rounded = new RoundedBoxGeometry(1, 1, 1, 1, .16);
    part(rounded, dark, [0, -.1, 0], [2.2, .45, 3.65]);
    part(rounded, cream, [0, .2, .15], [1.7, .6, 3.4]);
    part(rounded, accent, [0, .39, 1.35], [1.67, .5, 1.13], [.1, 0, 0]);
    part(rounded, accent, [0, .35, -1.2], [1.85, .62, .7]);
    part(rounded, dark, [0, .65, -.25], [.97, .65, 1.45]);
    part(rounded, cream, [0, .77, -.75], [1.17, .8, .25], [-.13, 0, 0]);
    // Seated original faceless pilot: quilted flight suit and rounded geometric helmet.
    part(rounded, accent, [0, .98, -.33], [.7, .78, .68], [-.15, 0, 0]);
    part(this.geo.sphere, cream, [0, 1.65, -.19], [.48, .48, .44]);
    part(rounded, glass, [0, 1.63, .17], [.77, .28, .19], [.1, 0, 0]);
    part(rounded, accent, [0, 1.95, -.18], [.16, .06, .55]);
    for (const side of [-1, 1]) {
      part(rounded, dark, [side * 1.16, .12, -.12], [.5, .5, 2.9]);
      part(rounded, accent, [side * 1.28, .25, -.12], [.57, .64, 2.25]);
      part(rounded, cream, [side * 1.27, .27, 1.14], [.65, .65, .6]);
      part(rounded, dark, [side * 1.27, .24, -1.3], [.6, .58, .26]);
      part(rounded, glow, [side * 1.27, -.12, -.05], [.53, .08, 1.9]);
      part(rounded, glow, [side * .53, .39, 1.92], [.43, .16, .07]);
      part(rounded, red, [side * .56, .46, -1.77], [.35, .16, .06]);
      part(rounded, cream, [side * .46, 1.12, .11], [.2, .25, .65], [.45, 0, side * .3]);
      part(rounded, dark, [side * .47, 1.05, .5], [.2, .17, .2]);
    }
    part(rounded, cream, [0, .66, -1.42], [2.65, .13, .45], [.1, 0, 0]);
    for (const [mat, geometries] of batches) {
      const merged = mergeGeometries(geometries, false);
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
      geometries.forEach(g => g.dispose());
    }
    rounded.dispose();
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshBasicMaterial({ color: 0x142329, transparent: true, opacity: .28, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 1.5, 1); this.scene.add(shadow);
    const shield = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 10), new THREE.MeshBasicMaterial({ color: 0x74f0dd, wireframe: true, transparent: true, opacity: .23, depthWrite: false }));
    shield.position.y = .55; shield.scale.z = 1.16; shield.visible = false; group.add(shield);
    const jet = new THREE.Group();
    for (const side of [-1, 1]) {
      const plume = new THREE.Mesh(new THREE.ConeGeometry(.31, 2.5, 8), new THREE.MeshBasicMaterial({ color: 0x99fff5, transparent: true, opacity: .65, depthWrite: false }));
      plume.rotation.x = -Math.PI / 2; plume.position.set(side * 1.27, .12, -2.15); jet.add(plume);
    }
    jet.visible = false; group.add(jet);
    this.scene.add(group);
    const entry = { group, shadow, shield, jet, accent, glow };
    this.vehicleGroups.set(racer.id, entry); return entry;
  }

  createParticles() {
    this.particles = Array.from({ length: 48 }, () => ({ life: 0, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, warm: false }));
    this.particleCursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(48 * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(48 * 3), 3));
    this.particleMesh = new THREE.Points(g, new THREE.PointsMaterial({ size: .19, vertexColors: true, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.particleMesh.frustumCulled = false; this.scene.add(this.particleMesh);
  }

  updateParticles(player, dt, time, paused) {
    const g = this.particleMesh.geometry, positions = g.attributes.position.array, colors = g.attributes.color.array;
    if (!paused && player && player.speed > 12 && (player.boostTimer > 0 || player.drifting)) {
      for (const side of [-1, 1]) {
        const p = this.particles[this.particleCursor++ % this.particles.length];
        const tx = Math.sin(player.heading), tz = Math.cos(player.heading);
        Object.assign(p, { life: .48, x: player.x - tx * 1.5 + tz * 1.35 * side, y: player.y - .2, z: player.z - tz * 1.5 - tx * 1.35 * side,
          vx: -tx * 3 + tz * side * 1.8, vy: .5 + Math.sin(time * 17), vz: -tz * 3 - tx * side * 1.8, warm: player.drifting });
      }
    }
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!paused) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
      positions[i * 3] = p.x; positions[i * 3 + 1] = p.life > 0 ? p.y : -999; positions[i * 3 + 2] = p.z;
      const fade = clamp(p.life / .48, 0, 1);
      colors[i * 3] = (p.warm ? 1 : .35) * fade; colors[i * 3 + 1] = (p.warm ? .6 : 1) * fade; colors[i * 3 + 2] = (p.warm ? .2 : .93) * fade;
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }

  resize() {
    const width = this.renderer.domElement.clientWidth || window.innerWidth;
    const height = this.renderer.domElement.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  render(game, dt = 1 / 60) {
    // Reduce only internal pixel density after sustained slow frames; physics stays fixed at 60 Hz.
    this.qualityTime += dt; this.qualityFrames++;
    if (this.qualityTime > 2) {
      const fps = this.qualityFrames / this.qualityTime;
      if (fps < 36 && this.renderScale > .55) {
        this.renderScale = Math.max(.55, this.renderScale - .15);
        this.renderer.setPixelRatio(this.renderScale); this.resize();
      }
      this.qualityTime = 0; this.qualityFrames = 0;
    }
    const time = game.time || performance.now() * .001;
    for (const racer of game.racers || []) {
      const entry = this.vehicleGroups.get(racer.id) || this.createVehicle(racer);
      const hover = !racer.falling ? Math.sin(time * 7 + (racer.rank || 0)) * .035 : 0;
      entry.group.position.set(racer.x, racer.y + hover, racer.z);
      entry.group.rotation.set(0, racer.heading, -(racer.steer || 0) * clamp(Math.abs(racer.speed) / 40, 0, 1) * .09);
      if (racer.drifting) entry.group.rotation.y += (racer.steer || 0) * .16;
      entry.shield.visible = racer.shieldTimer > 0;
      entry.shield.rotation.y = time * .8;
      entry.jet.visible = racer.boostTimer > 0;
      entry.jet.scale.z = .85 + Math.sin(time * 35) * .18;
      entry.glow.emissive.setHex(racer.drifting && racer.driftCharge > .7 ? 0xffa35f : 0x3df4e1);
      entry.shadow.position.set(racer.x, Math.max(-15, (racer.groundY ?? racer.y - .72 - (racer.jumpHeight || 0))) + .1, racer.z);
      entry.shadow.rotation.z = -racer.heading;
      entry.shadow.visible = !racer.falling;
    }
    for (let i = 0; i < this.gateLights.length; i++) {
      const light = this.gateLights[i]; light.rotation.y = time * 1.3; light.rotation.z = Math.sin(time + i) * .12;
    }
    for (const a of this.animated) {
      a.group.position.x = a.x + Math.sin(time * .016 + a.phase) * 90;
      a.group.position.z = a.z + Math.cos(time * .016 + a.phase) * 25;
    }
    const traps = game.traps || [];
    for (let i = 0; i < Math.max(traps.length, this.trapGroups.length); i++) {
      if (!this.trapGroups[i] && traps[i]) {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.1, .11, 6, 22), new THREE.MeshBasicMaterial({ color: 0xeeb175 }));
        mesh.rotation.x = Math.PI / 2; this.scene.add(mesh); this.trapGroups[i] = mesh;
      }
      const mesh = this.trapGroups[i], trap = traps[i];
      if (mesh) { mesh.visible = !!trap; if (trap) { mesh.position.set(trap.x, trap.y + .16, trap.z); mesh.scale.setScalar(1 + Math.sin(time * 5) * .1); } }
    }
    const player = game.racers?.[0];
    this.updateParticles(player, dt, time, game.state === 'paused');
    if (player) {
      const dir = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
      const normal = new THREE.Vector3(dir.z, 0, -dir.x);
      const p = new THREE.Vector3(player.x, Math.max(player.y, -2), player.z);
      const menu = game.state === 'menu';
      const speed = Math.abs(player.speed || 0), boost = player.boostTimer > 0;
      const desired = p.clone().addScaledVector(dir, menu ? -16 : -10.7 - Math.min(speed / 22, 2.1));
      desired.y += menu ? 7.8 : 5.65;
      if (boost && !menu) { desired.x += Math.sin(time * 43) * .028; desired.y += Math.cos(time * 37) * .019; }
      if (menu) desired.addScaledVector(normal, 7.5);
      const target = p.clone().addScaledVector(dir, menu ? 9 : 6.2 + speed * .075);
      if (menu) target.addScaledVector(normal, 8);
      target.y += menu ? 1.7 : 1.0;
      const smoothing = 1 - Math.exp(-Math.min(dt, .1) * 6.2);
      if (!this.readyCamera || (this.lastState === 'menu' && !menu)) {
        this.camera.position.copy(desired); this.cameraTarget.copy(target); this.readyCamera = true;
      } else { this.camera.position.lerp(desired, smoothing); this.cameraTarget.lerp(target, smoothing); }
      this.camera.lookAt(this.cameraTarget);
      const desiredFov = menu ? 59 : 62 + clamp(speed / 10, 0, 5) + (boost ? 3 : 0);
      if (Math.abs(this.camera.fov - desiredFov) > .03) { this.camera.fov += (desiredFov - this.camera.fov) * smoothing; this.camera.updateProjectionMatrix(); }
      this.sun.position.set(player.x - 110, player.y + 190, player.z - 100);
      this.sun.target.position.set(player.x, player.y, player.z);
      this.sky.position.copy(this.camera.position);
      this.lastState = game.state;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.scene.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) { materials.add(m); if (m.map) textures.add(m.map); }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); this.renderer.dispose();
  }
}
