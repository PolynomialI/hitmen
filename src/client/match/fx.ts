import * as THREE from 'three';
import { paint } from '../gfx/textures';

let featherTex: THREE.Texture | null = null;
function feather(): THREE.Texture {
  if (featherTex) return featherTex;
  featherTex = paint(64, 128, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,240,210,0.7)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.46);
    ctx.bezierCurveTo(w * 0.42, -h * 0.2, w * 0.3, h * 0.3, 0, h * 0.46);
    ctx.bezierCurveTo(-w * 0.3, h * 0.3, -w * 0.42, -h * 0.2, 0, -h * 0.46);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,180,140,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.4);
    ctx.lineTo(0, h * 0.48);
    ctx.stroke();
  });
  return featherTex;
}

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  spin: number;
  rot: number;
}

/** CPU particle bursts rendered as sprites (sparks, embers, feathers, motes). */
export class Fx {
  readonly group = new THREE.Group();
  private systems: Array<{ sprites: THREE.Sprite[]; parts: Particle[]; gravity: number; drag: number; fade: number }> = [];
  private glowTex: THREE.Texture;

  constructor(glowTex: THREE.Texture) {
    this.glowTex = glowTex;
  }

  burst(o: {
    at: THREE.Vector3;
    count: number;
    color: THREE.ColorRepresentation;
    intensity?: number;
    speed: number;
    up?: number;
    life: number;
    size: number;
    gravity?: number;
    drag?: number;
    kind?: 'glow' | 'feather' | 'blood';
    spread?: THREE.Vector3;
    /** Bias every particle's direction this way (e.g. a spurt to one side). */
    dir?: THREE.Vector3;
  }): void {
    const sprites: THREE.Sprite[] = [];
    const parts: Particle[] = [];
    const blood = o.kind === 'blood';
    const col = new THREE.Color(o.color).multiplyScalar(blood ? 1 : (o.intensity ?? 3));
    const feathers = o.kind === 'feather';
    for (let i = 0; i < o.count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: feathers ? feather() : this.glowTex,
        color: feathers ? new THREE.Color(1.6, 1.5, 1.3) : col,
        transparent: true,
        blending: feathers || blood ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5 + (o.up ?? 0), Math.random() - 0.5).normalize();
      if (o.dir) dir.multiplyScalar(0.55).add(o.dir).normalize();
      const sp = o.speed * (0.4 + Math.random() * 0.8);
      const start = o.at.clone();
      if (o.spread) start.add(new THREE.Vector3((Math.random() - 0.5) * o.spread.x, (Math.random() - 0.5) * o.spread.y, (Math.random() - 0.5) * o.spread.z));
      const part: Particle = {
        p: start,
        v: dir.multiplyScalar(sp),
        life: 0,
        max: o.life * (0.6 + Math.random() * 0.8),
        size: o.size * (0.5 + Math.random()),
        spin: (Math.random() - 0.5) * 6,
        rot: Math.random() * 6,
      };
      s.position.copy(part.p);
      s.scale.setScalar(part.size);
      s.renderOrder = 30;
      this.group.add(s);
      sprites.push(s);
      parts.push(part);
    }
    this.systems.push({ sprites, parts, gravity: o.gravity ?? -0.6, drag: o.drag ?? 1.5, fade: 1 });
  }

  update(dt: number): void {
    for (let si = this.systems.length - 1; si >= 0; si--) {
      const sys = this.systems[si];
      let alive = 0;
      for (let i = 0; i < sys.parts.length; i++) {
        const p = sys.parts[i];
        const s = sys.sprites[i];
        p.life += dt;
        if (p.life >= p.max) {
          s.visible = false;
          continue;
        }
        alive++;
        p.v.y += sys.gravity * dt;
        p.v.multiplyScalar(Math.exp(-sys.drag * dt));
        p.p.addScaledVector(p.v, dt);
        p.rot += p.spin * dt;
        s.position.copy(p.p);
        const k = p.life / p.max;
        const m = s.material as THREE.SpriteMaterial;
        m.opacity = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
        m.rotation = p.rot;
        s.scale.set(p.size, p.size * (m.map === this.glowTex ? 1 : 2), 1);
      }
      if (!alive) {
        for (const s of sys.sprites) {
          this.group.remove(s);
          (s.material as THREE.SpriteMaterial).dispose();
        }
        this.systems.splice(si, 1);
      }
    }
  }

  /** A big soft flash of light at a point (returns the sprite so callers can animate it). */
  flash(at: THREE.Vector3, color: THREE.ColorRepresentation, size: number): THREE.Sprite {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
    );
    s.position.copy(at);
    s.scale.setScalar(size);
    s.renderOrder = 31;
    this.group.add(s);
    return s;
  }

  ring(at: THREE.Vector3, color: THREE.ColorRepresentation, facing: THREE.Quaternion): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    m.position.copy(at);
    m.quaternion.copy(facing);
    m.renderOrder = 32;
    this.group.add(m);
    return m;
  }
}
