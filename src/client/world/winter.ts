// Winter Feast: the den under snow. Snow on the floor round the table and drifted against the stage, a dusting on the
// table's rim and felt and on every chair, icicles along the valance, frost on the windows, a snowy night painted on
// the stage, snow falling all through the room, and a colder light. Built once when a Winter Feast begins.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../gfx/textures';
import { STAGE } from './stage';

let rng = 1;
const rnd = () => ((rng = (rng * 16807) % 2147483647) - 1) / 2147483646;

let _snowMat: THREE.MeshStandardMaterial | null = null;
/** Packed snow: white with a faint blue cold, a little self-lit so it reads as white in the candlelit room. */
export function snowMaterial(): THREE.MeshStandardMaterial {
  if (_snowMat) return _snowMat;
  const map = paint(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f4f7fb';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 212 + Math.floor(Math.random() * 43);
      ctx.fillStyle = `rgb(${v - 6},${v - 2},${v})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  _snowMat = new THREE.MeshStandardMaterial({ color: '#f2f6fb', map, roughness: 0.88, emissive: '#2a3646', emissiveIntensity: 1 });
  return _snowMat;
}

/** A soft drift of snow: a squashed, lumpy dome on y = 0, long along x. */
export function driftGeometry(sx: number, sy: number, sz: number, seed = rnd() * 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 20, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + 0.14 * Math.sin(x * 6.3 + seed) * Math.cos(z * 4.7 + seed * 1.7) + 0.06 * Math.sin(x * 13 + z * 9 + seed);
    p.setXYZ(i, x * sx * n, y * sy * (0.75 + 0.25 * n), z * sz * n);
  }
  g.computeVertexNormals();
  return g;
}

/** Snow on top of a chair's back (and a little on its seat edge), fitted to the chair's own size. */
export function addChairSnow(chair: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(chair);
  const size = box.getSize(new THREE.Vector3());
  // Chairs face the table along +z: the back is at the far (-z) end.
  const cap = new THREE.Mesh(driftGeometry(size.x * 0.42, 0.035, Math.min(0.06, size.z * 0.12)), snowMaterial());
  cap.position.set((box.min.x + box.max.x) / 2, box.max.y - 0.012, box.min.z + Math.min(0.05, size.z * 0.1));
  chair.add(cap);
}

/** A soft round flake for the falling snow. */
function flakeTexture(): THREE.Texture {
  return paint(32, 32, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Snow lying on a surface: white, thick in the middle and thinning to nothing at a ragged edge. */
function snowCover(rIn: number, speckle: number): THREE.Texture {
  return paint(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const c = w / 2;
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * c;
      const edge = 1 - Math.max(0, (r / c - rIn) / (1 - rIn));
      if (edge <= 0) continue;
      const s = 6 + Math.random() * 26 * edge;
      const g = ctx.createRadialGradient(c + Math.cos(a) * r, c + Math.sin(a) * r, 0, c + Math.cos(a) * r, c + Math.sin(a) * r, s);
      g.addColorStop(0, `rgba(245,248,252,${Math.min(1, 0.35 + edge * speckle)})`);
      g.addColorStop(1, 'rgba(245,248,252,0)');
      ctx.fillStyle = g;
      ctx.fillRect(c + Math.cos(a) * r - s, c + Math.sin(a) * r - s, s * 2, s * 2);
    }
  });
}

/** Frost creeping in from a window's edges. */
function frostTexture(): THREE.Texture {
  return paint(256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      // Start near an edge; branches reach inwards.
      const side = Math.floor(Math.random() * 4);
      let x = side === 0 ? 0 : side === 1 ? w : Math.random() * w;
      let y = side === 2 ? 0 : side === 3 ? h : Math.random() * h;
      x += (side === 0 ? 1 : side === 1 ? -1 : 0) * Math.random() * 60;
      y += (side === 2 ? 1 : side === 3 ? -1 : 0) * Math.random() * 90;
      const a = Math.atan2(h / 2 - y, w / 2 - x) + (Math.random() - 0.5) * 1.6;
      const len = 6 + Math.random() * 22;
      ctx.strokeStyle = `rgba(225,238,255,${0.25 + Math.random() * 0.45})`;
      ctx.lineWidth = 0.8 + Math.random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.moveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5);
      ctx.lineTo(x + Math.cos(a + 0.7) * len * 0.9, y + Math.sin(a + 0.7) * len * 0.9);
      ctx.stroke();
    }
    // A misted rim.
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, h * 0.62);
    g.addColorStop(0, 'rgba(220,235,255,0)');
    g.addColorStop(1, 'rgba(220,235,255,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A snowy night painted on the stage's backdrop: moon, hills, pines and a village under snow. */
function winterBackdrop(): THREE.Texture {
  return paint(1024, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0b1430');
    sky.addColorStop(0.55, '#24386a');
    sky.addColorStop(1, '#6c7fa8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // Moon and its halo.
    const mx = w * 0.7;
    const my = h * 0.2;
    const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 160);
    halo.addColorStop(0, 'rgba(235,240,255,0.55)');
    halo.addColorStop(1, 'rgba(160,180,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f6f4e8';
    ctx.beginPath();
    ctx.arc(mx, my, 30, 0, Math.PI * 2);
    ctx.fill();
    // Far hills, then near hills: snow-white, shaded blue.
    const hills = (base: number, amp: number, f: number, ph: number, top: string, bottom: string) => {
      const g = ctx.createLinearGradient(0, base - amp, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, base - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.7 + ph * 2) * amp * 0.35);
      ctx.lineTo(w, h);
      ctx.fill();
    };
    hills(h * 0.62, 40, 0.006, 1.2, '#b8c6e0', '#7d8fb6');
    // Pines on the far ridge.
    const pine = (x: number, y: number, s: number) => {
      ctx.fillStyle = '#1b2c2a';
      for (let k = 0; k < 3; k++) {
        const ty = y - s * (0.5 + k * 0.42);
        const tw = s * (0.55 - k * 0.13);
        ctx.beginPath();
        ctx.moveTo(x, ty - s * 0.55);
        ctx.lineTo(x + tw, ty + s * 0.2);
        ctx.lineTo(x - tw, ty + s * 0.2);
        ctx.fill();
        // Snow along each tier's edge.
        ctx.strokeStyle = 'rgba(240,246,255,0.95)';
        ctx.lineWidth = Math.max(1.5, s * 0.07);
        ctx.beginPath();
        ctx.moveTo(x - tw * 0.9, ty + s * 0.15);
        ctx.lineTo(x, ty - s * 0.5);
        ctx.lineTo(x + tw * 0.9, ty + s * 0.15);
        ctx.stroke();
      }
      ctx.fillStyle = '#2a1c14';
      ctx.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.3);
    };
    for (let i = 0; i < 26; i++) {
      const x = (i / 26) * w + rnd() * 20;
      pine(x, h * 0.6 - Math.sin(x * 0.006 + 1.2) * 40 + 6, 18 + rnd() * 14);
    }
    hills(h * 0.8, 26, 0.004, 3.1, '#e4ebf6', '#a9b8d4');
    // A village: roofs heavy with snow, lit windows.
    let x = w * 0.08;
    while (x < w * 0.5) {
      const bw = 34 + rnd() * 30;
      const bh = 26 + rnd() * 22;
      const by = h * 0.8 - Math.sin(x * 0.004 + 3.1) * 26 + 10;
      ctx.fillStyle = '#3a2e2a';
      ctx.fillRect(x, by - bh, bw, bh);
      ctx.fillStyle = '#f0f4fb';
      ctx.beginPath();
      ctx.moveTo(x - 5, by - bh + 2);
      ctx.lineTo(x + bw / 2, by - bh - 20);
      ctx.lineTo(x + bw + 5, by - bh + 2);
      ctx.fill();
      ctx.fillStyle = rnd() < 0.5 ? '#ffc060' : '#ffdc8a';
      ctx.fillRect(x + bw * 0.3, by - bh * 0.6, 6, 8);
      x += bw + 10 + rnd() * 30;
    }
    for (let i = 0; i < 9; i++) pine(w * 0.55 + i * 52 + rnd() * 20, h * 0.86 + rnd() * 8, 40 + rnd() * 22);
    // Falling flakes.
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
      const s = 1 + rnd() * 2.4;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, s, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export interface Winter {
  group: THREE.Group;
  update(t: number, dt: number): void;
}

/**
 * Build the snow for the room. `table` is the table's centre on the floor (y = 0) and `top` its height; `windows` the
 * stage-wall window centres; `valance` points along the stage valance for the icicles.
 */
export function buildWinter(o: { table: THREE.Vector3; top: number; windows: THREE.Vector3[]; valance: THREE.Vector3[]; flakes: number }): Winter {
  rng = 7;
  const g = new THREE.Group();
  const snow = snowMaterial();
  const T = o.table;
  const S = STAGE;
  const parts: THREE.BufferGeometry[] = [];
  const place = (geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number) => {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
    parts.push(geo);
  };

  // ---- the table: snow along the rim, frost creeping in over the edge of the felt.
  for (let a = 0; a < Math.PI * 2; ) {
    const len = 0.1 + rnd() * 0.16;
    const mid = a + len / 2 / 1.06;
    place(driftGeometry(len / 2, 0.022 + rnd() * 0.012, 0.04), T.x + Math.cos(mid) * 1.062, o.top + 0.022, T.z + Math.sin(mid) * 1.062, -mid - Math.PI / 2);
    a += len / 1.06 + (rnd() < 0.3 ? 0.08 + rnd() * 0.2 : 0.01);
  }
  // The ring's UVs map the square texture: frost dense at the rim, thinning to nothing toward the middle.
  const FROST_IN = 0.78; // metres: the frost only creeps a little way in from the rim
  const frostMap = paint(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const c = w / 2;
    const inner = FROST_IN / 1.02;
    // A soft white haze right at the rim...
    const g = ctx.createRadialGradient(c, c, c * inner, c, c, c);
    g.addColorStop(0, 'rgba(236,242,250,0)');
    g.addColorStop(1, 'rgba(236,242,250,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // ...and fine crystals, thicker toward the rim.
    for (let i = 0; i < 5000; i++) {
      const a = Math.random() * Math.PI * 2;
      const k = Math.sqrt(Math.random());
      const r = c * (inner + (1 - inner) * k);
      ctx.fillStyle = `rgba(242,247,253,${(0.06 + k * k * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 0.8 + k * 1.8 * Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const feltFrost = new THREE.Mesh(
    new THREE.RingGeometry(FROST_IN, 1.02, 72),
    new THREE.MeshStandardMaterial({ map: frostMap, transparent: true, depthWrite: false, roughness: 0.9, emissive: '#1a2230', polygonOffset: true, polygonOffsetFactor: -2 })
  );
  feltFrost.rotation.x = -Math.PI / 2;
  feltFrost.position.set(T.x, o.top + 0.0018, T.z);
  feltFrost.renderOrder = 1;
  feltFrost.userData.noBatch = true;
  g.add(feltFrost);

  // ---- the floor: a blanket of snow round the table, drifts at its edge and against the stage.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 64),
    new THREE.MeshStandardMaterial({ map: snowCover(0.55, 0.8), transparent: true, depthWrite: false, roughness: 0.9, emissive: '#1e2836', polygonOffset: true, polygonOffsetFactor: -2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(T.x + 0.4, 0.006, T.z);
  floor.receiveShadow = true;
  floor.userData.noBatch = true;
  g.add(floor);
  for (let i = 0; i < 16; i++) {
    // Not between you and the table (you sit on the -x side).
    let a = rnd() * Math.PI * 2;
    if (Math.abs(((a - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.8) a += Math.PI;
    const r = 2.0 + rnd() * 1.5;
    place(driftGeometry(0.3 + rnd() * 0.45, 0.06 + rnd() * 0.12, 0.18 + rnd() * 0.22), T.x + Math.cos(a) * r, 0, T.z + Math.sin(a) * r, rnd() * Math.PI);
  }
  // Along the foot of the stage, and a long drift across the stage floor.
  for (let z = S.Z0 + 0.3; z < S.Z1; z += 0.55 + rnd() * 0.4) place(driftGeometry(0.4 + rnd() * 0.3, 0.12 + rnd() * 0.14, 0.22 + rnd() * 0.12), S.PX - 0.35, 0, z, Math.PI / 2 + (rnd() - 0.5) * 0.4);
  for (let z = S.Z0 + 0.2; z < S.Z1; z += 0.7 + rnd() * 0.5) place(driftGeometry(0.5 + rnd() * 0.4, 0.08 + rnd() * 0.12, 0.3 + rnd() * 0.2), S.PX + 0.6 + rnd() * 1.6, S.SF, z, rnd() * Math.PI);
  // On the window sills.
  for (const w of o.windows) place(driftGeometry(0.5, 0.06, 0.1), S.PX - 0.06, w.y - 1.175, w.z, Math.PI / 2); // sill = centre - h / 2
  const drifts = new THREE.Mesh(mergeGeometries(parts), snow);
  drifts.castShadow = false;
  drifts.receiveShadow = true;
  g.add(drifts);

  // ---- icicles along the valance.
  const ice: THREE.BufferGeometry[] = [];
  const vs = o.valance;
  for (let i = 0; i + 1 < vs.length; i++) {
    for (let k = 0; k < 7; k++) {
      const p = vs[i].clone().lerp(vs[i + 1], (k + rnd() * 0.8) / 7);
      const len = 0.06 + rnd() * rnd() * 0.32;
      const c = new THREE.ConeGeometry(0.008 + len * 0.06, len, 5);
      c.rotateX(Math.PI);
      c.translate(p.x - 0.05, p.y - 0.04 - len / 2, p.z);
      ice.push(c);
    }
  }
  if (ice.length) {
    const icicles = new THREE.Mesh(
      mergeGeometries(ice),
      new THREE.MeshStandardMaterial({ color: '#d4ecff', roughness: 0.12, metalness: 0.1, emissive: '#2a4a66', emissiveIntensity: 0.8, transparent: true, opacity: 0.88 })
    );
    icicles.userData.noBatch = true;
    g.add(icicles);
  }

  // ---- frost on the windows.
  const frost = new THREE.MeshBasicMaterial({ map: frostTexture(), transparent: true, depthWrite: false, color: new THREE.Color(0.9, 0.95, 1.05) });
  for (const w of o.windows) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), frost);
    f.position.set(S.PX + S.PT * 0.45, w.y, w.z);
    f.rotation.y = -Math.PI / 2;
    f.userData.noBatch = true;
    g.add(f);
  }

  // ---- a snowy night on the stage's backdrop.
  const back = new THREE.Mesh(new THREE.PlaneGeometry(S.SZ1 - S.SZ0, S.H - S.SF), new THREE.MeshBasicMaterial({ map: winterBackdrop(), color: new THREE.Color(0.78, 0.8, 0.88), fog: false }));
  back.position.set(S.BACK - 0.45, S.SF + (S.H - S.SF) / 2, (S.SZ0 + S.SZ1) / 2);
  back.rotation.y = -Math.PI / 2;
  back.userData.noBatch = true;
  g.add(back);

  // ---- snow falling all through the room and on the stage.
  const N = o.flakes;
  const box = { x0: 1.6, x1: S.BACK - 0.6, y0: 0, y1: 3.8, z0: S.Z0 - 0.6, z1: S.Z1 + 0.6 };
  const pos = new Float32Array(N * 3);
  const speed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = box.x0 + rnd() * (box.x1 - box.x0);
    pos[i * 3 + 1] = box.y0 + rnd() * (box.y1 - box.y0);
    pos[i * 3 + 2] = box.z0 + rnd() * (box.z1 - box.z0);
    speed[i] = 0.16 + rnd() * 0.22;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const flakes = new THREE.Points(geo, new THREE.PointsMaterial({ map: flakeTexture(), color: new THREE.Color(1.25, 1.3, 1.45), size: 0.03, transparent: true, depthWrite: false, opacity: 0.9 }));
  flakes.frustumCulled = false;
  flakes.userData.noBatch = true;
  g.add(flakes);

  return {
    group: g,
    update(t, dt) {
      const p = geo.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      for (let i = 0; i < N; i++) {
        let y = a[i * 3 + 1] - dt * speed[i];
        if (y < box.y0) y = box.y1;
        a[i * 3 + 1] = y;
        a[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.06;
        a[i * 3 + 2] += Math.cos(t * 0.5 + i * 1.3) * dt * 0.06;
      }
      p.needsUpdate = true;
    },
  };
}
