import * as THREE from 'three';
import type { FlameField } from '../gfx/flames';
import type { Mats } from './materials';

const V2 = (pts: number[][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));

export function box(w: number, h: number, d: number, mat: THREE.Material, cast = true, recv = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = cast;
  m.receiveShadow = recv;
  return m;
}

export function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Box with UVs scaled to world size so textures do not stretch. */
export function plank(w: number, h: number, d: number, mat: THREE.Material, uvScale = 1): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    let su = w;
    let sv = h;
    if (nx > 0.5) {
      su = d;
      sv = h;
    } else if (ny > 0.5) {
      su = w;
      sv = d;
    }
    uv.setXY(i, uv.getX(i) * su * uvScale, uv.getY(i) * sv * uvScale);
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function bottle(mats: Mats, kind = 0, h = 0.32): THREE.Group {
  const g = new THREE.Group();
  const profiles = [
    [[0, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.55], [0.035, 0.68], [0.016, 0.76], [0.016, 0.92], [0.02, 0.95], [0, 0.95]],
    [[0, 0], [0.06, 0], [0.065, 0.04], [0.065, 0.35], [0.03, 0.55], [0.017, 0.62], [0.017, 0.82], [0.022, 0.85], [0, 0.85]],
    [[0, 0], [0.07, 0], [0.075, 0.1], [0.06, 0.4], [0.025, 0.52], [0.02, 0.7], [0.026, 0.72], [0, 0.72]],
  ];
  const p = profiles[kind % profiles.length].map(([x, y]) => [x * (h / 0.32) * 1.1, y * h]);
  const m = new THREE.Mesh(new THREE.LatheGeometry(V2(p), 16), mats.glass[kind % mats.glass.length]);
  m.castShadow = true;
  g.add(m);
  const cork = cyl(0.016 * (h / 0.32), 0.014 * (h / 0.32), 0.03, mats.leather, 8);
  cork.position.y = p[p.length - 2][1] + 0.01;
  g.add(cork);
  return g;
}

export function barrel(mats: Mats, h = 0.9, r = 0.34): THREE.Group {
  const g = new THREE.Group();
  const pts: number[][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([r * (0.84 + 0.16 * Math.sin(t * Math.PI)), t * h]);
  }
  const wood = mats.wood.clone();
  wood.color.set('#9a7458');
  const staves = new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], ...pts, [0, h]]), 24), wood);
  staves.castShadow = true;
  staves.receiveShadow = true;
  g.add(staves);
  for (const t of [0.1, 0.32, 0.68, 0.9]) {
    const rr = r * (0.84 + 0.16 * Math.sin(t * Math.PI)) + 0.006;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.012, 6, 32), mats.iron);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = t * h;
    g.add(hoop);
  }
  const tap = cyl(0.025, 0.025, 0.12, mats.brass, 8);
  tap.rotation.x = Math.PI / 2;
  tap.position.set(0, h * 0.28, r * 0.97);
  g.add(tap);
  return g;
}

export function tankard(mats: Mats, s = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(V2([[0, 0], [0.045, 0], [0.048, 0.01], [0.045, 0.12], [0.047, 0.13], [0.04, 0.13], [0.038, 0.02], [0, 0.02]]), 18),
    mats.woodLight
  );
  body.castShadow = true;
  g.add(body);
  for (const y of [0.025, 0.105]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.005, 6, 20), mats.iron);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 8, 16, Math.PI), mats.iron);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.05, 0.065, 0);
  g.add(handle);
  g.scale.setScalar(s);
  return g;
}

/** A candle with its flame registered in the shared FlameField. Returns group and flame index. */
export function candle(mats: Mats, flames: FlameField, pos: THREE.Vector3, h = 0.16, r = 0.022, parent?: THREE.Object3D): { group: THREE.Group; flame: number } {
  const g = new THREE.Group();
  const wax = new THREE.Mesh(
    new THREE.LatheGeometry(V2([[0, 0], [r, 0], [r, h * 0.92], [r * 0.8, h], [r * 0.25, h * 0.97], [0, h * 0.98]]), 12),
    mats.wax
  );
  wax.castShadow = true;
  g.add(wax);
  // A couple of wax drips.
  for (let i = 0; i < 2; i++) {
    const d = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.22, h * (0.2 + Math.random() * 0.3), 3, 6), mats.wax);
    const a = Math.random() * Math.PI * 2;
    d.position.set(Math.cos(a) * r, h * 0.75, Math.sin(a) * r);
    g.add(d);
  }
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.014, 4), mats.soot);
  wick.position.y = h + 0.004;
  g.add(wick);
  g.position.copy(pos);
  if (parent) parent.add(g);
  g.updateWorldMatrix(true, false);
  const world = new THREE.Vector3(0, h + 0.006, 0).applyMatrix4(g.matrixWorld);
  const flame = flames.add(world, 1);
  return { group: g, flame };
}

export function chest(mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const w = 0.46;
  const d = 0.3;
  const h = 0.22;
  const base = plank(w, h, d, mats.woodDark, 2);
  base.position.y = h / 2;
  g.add(base);
  // Curved lid.
  const lidGeo = new THREE.CylinderGeometry(d / 2, d / 2, w, 20, 1, false, 0, Math.PI);
  lidGeo.rotateZ(Math.PI / 2);
  const lid = new THREE.Mesh(lidGeo, mats.woodDark);
  lid.castShadow = true;
  lid.position.y = h;
  g.add(lid);
  // Iron straps.
  for (const x of [-0.15, 0.15]) {
    const s = box(0.03, h + 0.004, d + 0.006, mats.iron);
    s.position.set(x, h / 2, 0);
    g.add(s);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(d / 2 + 0.003, 0.012, 4, 16, Math.PI), mats.iron);
    arc.rotation.y = Math.PI / 2;
    arc.position.set(x, h, 0);
    g.add(arc);
  }
  const lock = box(0.06, 0.07, 0.02, mats.brass);
  lock.position.set(0, h - 0.01, d / 2 + 0.008);
  g.add(lock);
  g.userData.lid = lid;
  return g;
}

export function coinStack(mats: Mats, n: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.021, 0.021, 0.0045, 18);
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(geo, mats.gold);
    c.position.set((Math.random() - 0.5) * 0.003, 0.0025 + i * 0.0047, (Math.random() - 0.5) * 0.003);
    c.rotation.y = Math.random();
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

export function purse(mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(V2([[0, 0], [0.06, 0.005], [0.085, 0.04], [0.08, 0.08], [0.05, 0.11], [0.025, 0.125], [0.035, 0.15], [0.02, 0.16], [0, 0.16]]), 18),
    mats.leather
  );
  body.castShadow = true;
  const pos = body.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 5) * 0.06;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  body.geometry.computeVertexNormals();
  g.add(body);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 16), mats.parchment);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.125;
  g.add(tie);
  return g;
}

export function dice(color = '#efe6d2'): THREE.Mesh {
  const s = 128;
  const mats: THREE.MeshStandardMaterial[] = [];
  const pips: Record<number, number[][]> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };
  for (const f of [1, 6, 2, 5, 3, 4]) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#2a120c';
    for (const [x, y] of pips[f]) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, s * 0.085, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    mats.push(new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }));
  }
  const geo = new THREE.BoxGeometry(0.045, 0.045, 0.045, 2, 2, 2);
  // Round the corners a bit.
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize().multiplyScalar(0.0225 * 1.3);
    v.lerp(n, 0.18);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mats);
  m.castShadow = true;
  return m;
}

export function lantern(mats: Mats, flames: FlameField, parent: THREE.Object3D, pos: THREE.Vector3, chain = 0.6): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  parent.add(g);
  const frameMat = mats.iron;
  const top = cyl(0.02, 0.09, 0.08, frameMat, 8);
  top.position.y = 0.2;
  g.add(top);
  const bottom = cyl(0.08, 0.07, 0.03, frameMat, 8);
  g.add(bottom);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bar = cyl(0.006, 0.006, 0.18, frameMat, 4);
    bar.position.set(Math.cos(a) * 0.07, 0.1, Math.sin(a) * 0.07);
    g.add(bar);
  }
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.066, 0.066, 0.17, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.4), transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  glass.position.y = 0.1;
  g.add(glass);
  const ch = cyl(0.004, 0.004, chain, frameMat, 4);
  ch.position.y = 0.24 + chain / 2;
  g.add(ch);
  g.updateWorldMatrix(true, false);
  candle(mats, flames, new THREE.Vector3(0, 0.015, 0), 0.07, 0.016, g);
  return g;
}

/** Cloth panel with soft vertical folds (curtains, tapestries). */
export function drape(w: number, h: number, mat: THREE.Material, folds = 6, depth = 0.06): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h, Math.max(8, folds * 6), 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const k = (x / w + 0.5) * folds * Math.PI * 2;
    const flare = 0.6 + 0.4 * (0.5 - y / h);
    p.setZ(i, Math.sin(k) * depth * flare);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

export function chair(mats: Mats, high = true): THREE.Group {
  const g = new THREE.Group();
  const seatH = 0.48;
  const seat = plank(0.48, 0.05, 0.46, mats.wood, 2);
  seat.position.y = seatH;
  g.add(seat);
  for (const [x, z] of [
    [-0.2, -0.19],
    [0.2, -0.19],
    [-0.2, 0.19],
    [0.2, 0.19],
  ]) {
    const leg = plank(0.05, seatH, 0.05, mats.woodDark, 2);
    leg.position.set(x, seatH / 2, z);
    g.add(leg);
  }
  if (high) {
    for (const x of [-0.2, 0.2]) {
      const post = plank(0.055, 0.75, 0.055, mats.woodDark, 2);
      post.position.set(x, seatH + 0.37, -0.2);
      g.add(post);
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mats.woodDark);
      fin.position.set(x, seatH + 0.77, -0.2);
      g.add(fin);
    }
    for (const y of [0.32, 0.6]) {
      const rail = plank(0.42, 0.06, 0.03, mats.wood, 2);
      rail.position.set(0, seatH + y, -0.2);
      g.add(rail);
    }
  }
  return g;
}
