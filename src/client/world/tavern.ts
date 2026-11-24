import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { FlameField, HearthFire } from '../gfx/flames';
import { glowSprite, paint } from '../gfx/textures';
import { batchStatic } from './batch';
import { Figure } from './figure';
import { FONT3D } from './fonts3d';
import { buildMaterials, type Mats } from './materials';
import { barrel, bottle, box, candle, chair, chest, coinStack, cyl, dice, drape, lantern, plank, purse, tankard } from './props';

export interface Station {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** Look-around range in radians (yaw, pitch). */
  look: [number, number];
  fov?: number;
}

export function makeText(
  str: string,
  o: { font?: string; size?: number; color?: THREE.ColorRepresentation; glow?: number; anchorX?: string; anchorY?: string; maxWidth?: number; align?: 'left' | 'center' | 'right'; letterSpacing?: number; outline?: number; outlineColor?: string }
): Text {
  const t = new Text();
  t.text = str;
  t.font = o.font ?? FONT3D.gothic;
  t.fontSize = o.size ?? 0.1;
  t.anchorX = o.anchorX ?? 'center';
  t.anchorY = o.anchorY ?? 'middle';
  if (o.maxWidth) t.maxWidth = o.maxWidth;
  t.textAlign = o.align ?? 'center';
  t.letterSpacing = o.letterSpacing ?? 0;
  const col = new THREE.Color(o.color ?? '#f3e6c4').multiplyScalar(o.glow ?? 1);
  t.material = new THREE.MeshBasicMaterial({ color: col, transparent: true, toneMapped: false });
  if (o.outline) {
    t.outlineWidth = o.outline;
    t.outlineColor = o.outlineColor ?? '#000000';
    t.outlineBlur = o.outline * 1.5;
    t.outlineOpacity = 0.6;
  }
  t.sync();
  return t;
}

/** The whole tavern: room, bar, hearth, notice board, card den. */
export class Tavern {
  readonly group = new THREE.Group();
  readonly mats: Mats;
  readonly flames = new FlameField(320);
  readonly fire = new HearthFire(1.15, 0.9);
  readonly glowTex = glowSprite(128);

  readonly stations: Record<'menu' | 'play' | 'table' | 'intro', Station>;
  readonly lights: {
    hearth: THREE.PointLight;
    bar: THREE.PointLight;
    tableSpot: THREE.SpotLight;
    tableFill: THREE.PointLight;
    stage: THREE.PointLight;
    moon: THREE.DirectionalLight;
    hemi: THREE.HemisphereLight;
  };
  private baseIntensity = new Map<THREE.Light, number>();

  // Menu props (main menu labels attach to these).
  readonly menuProps: { play: THREE.Object3D; shop: THREE.Object3D; inventory: THREE.Object3D; challenges: THREE.Object3D };
  readonly barkeep: Figure;
  /** Notice board group on the west wall; local +z faces the room, +x is to the viewer's right. */
  readonly board = new THREE.Group();
  // Den.
  readonly table = new THREE.Group();
  readonly tableTop = 0.8;
  readonly tableCenter = new THREE.Vector3(4.3, 0.8, 0.6);
  readonly opponentSeat = new THREE.Vector3(5.62, 0, 0.6);
  readonly plaques: { odds: Text; hands: Text; souls: Text; oddsLabel: Text; handsLabel: Text; soulsLabel: Text; group: THREE.Group };
  readonly sign: { group: THREE.Group; text: Text; flames: number[]; mat: THREE.MeshBasicMaterial };
  readonly chandelierFlames: number[] = [];
  readonly tableCandleFlames: number[] = [];
  private flickers: Array<{ light: THREE.Light; base: number; amp: number; speed: number; seed: number }> = [];

  constructor(cardBack: THREE.Texture) {
    this.mats = buildMaterials();
    const g = this.group;
    g.add(this.flames.mesh);

    this.buildRoom();
    this.menuProps = this.buildBar(cardBack);
    this.barkeep = new Figure({ cloak: '#2e2620', eyes: '#ffc46b', seated: false, scale: 1.06 });
    this.barkeep.root.position.set(-2.45, 0, -4.55);
    this.barkeep.setReach(0.35, 'L');
    this.barkeep.setReach(0.25, 'R');
    g.add(this.barkeep.root);
    this.buildHearth();
    this.buildBoard();
    const den = this.buildDen(cardBack);
    this.plaques = den.plaques;
    this.sign = den.sign;

    // ---------------------------------------------------------------- lights
    const hemi = new THREE.HemisphereLight('#4a4060', '#1a0e08', 0.9);
    g.add(hemi);
    const moon = new THREE.DirectionalLight('#7d9ae0', 0.7);
    moon.position.set(12, 9, 4);
    g.add(moon);
    const hearth = new THREE.PointLight('#ff8a44', 20, 15, 1.6);
    hearth.position.set(-7.0, 0.9, -1.4);
    hearth.castShadow = false;
    g.add(hearth);
    const bar = new THREE.PointLight('#ffad5c', 9, 8, 1.7);
    bar.position.set(-2.6, 2.25, -3.3);
    g.add(bar);
    const tableSpot = new THREE.SpotLight('#ffc27a', 34, 6, 0.78, 0.65, 1.4);
    tableSpot.position.set(4.3, 2.75, 0.6);
    tableSpot.target.position.copy(this.tableCenter);
    tableSpot.castShadow = true;
    tableSpot.shadow.mapSize.set(1024, 1024);
    tableSpot.shadow.bias = -0.0008;
    tableSpot.shadow.normalBias = 0.02;
    tableSpot.shadow.camera.near = 0.5;
    tableSpot.shadow.camera.far = 5;
    g.add(tableSpot, tableSpot.target);
    const tableFill = new THREE.PointLight('#ff9a4a', 2.2, 4, 1.8);
    tableFill.position.set(4.25, 1.05, 0.6);
    g.add(tableFill);
    const stage = new THREE.PointLight('#ffae5a', 5, 6, 1.7);
    stage.position.set(7.2, 1.15, 0.6);
    g.add(stage);
    this.lights = { hearth, bar, tableSpot, tableFill, stage, moon, hemi };
    for (const l of Object.values(this.lights)) this.baseIntensity.set(l, l.intensity);
    this.flickers.push(
      { light: hearth, base: 20, amp: 0.22, speed: 6, seed: 1 },
      { light: bar, base: 9, amp: 0.08, speed: 9, seed: 2 },
      { light: tableFill, base: 2.2, amp: 0.15, speed: 11, seed: 3 },
      { light: stage, base: 5, amp: 0.1, speed: 8, seed: 4 }
    );

    // ---------------------------------------------------------------- batching
    const oppChair = this.group.children.find((o) => o.position.distanceTo(this.opponentSeat) < 0.01);
    const keep: THREE.Object3D[] = [this.barkeep.root, this.menuProps.play, this.menuProps.shop, this.menuProps.inventory, this.menuProps.challenges, this.fire.group, this.flames.mesh];
    if (oppChair) keep.push(oppChair);
    const stats = batchStatic(this.group, keep);
    console.info(`[tavern] batched ${stats.before} static meshes into ${stats.after}`);

    // ---------------------------------------------------------------- stations
    this.stations = {
      intro: { pos: new THREE.Vector3(-0.6, 1.9, 2.6), target: new THREE.Vector3(-2.6, 1.3, -4.6), look: [0.05, 0.03], fov: 50 },
      menu: { pos: new THREE.Vector3(-2.64, 1.62, -1.92), target: new THREE.Vector3(-2.62, 1.3, -4.6), look: [0.16, 0.08], fov: 50 },
      play: { pos: new THREE.Vector3(-4.25, 1.7, 0.55), target: new THREE.Vector3(-7.9, 1.66, 0.55), look: [0.14, 0.07], fov: 48 },
      table: { pos: new THREE.Vector3(2.9, 1.42, 0.6), target: new THREE.Vector3(6.4, 1.3, 0.6), look: [0.42, 0.16], fov: 52 },
    };
  }

  // ------------------------------------------------------------------ room

  private buildRoom(): void {
    const m = this.mats;
    const g = this.group;
    const W = 16;
    const D = 12;
    const H = 4.4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    g.add(ceil);

    // Walls: stone up to 1.5 m, plaster above, framed by dark timber.
    const wall = (len: number, pos: THREE.Vector3, rotY: number) => {
      const grp = new THREE.Group();
      grp.position.copy(pos);
      grp.rotation.y = rotY;
      const stoneH = 1.5;
      const st = new THREE.Mesh(new THREE.PlaneGeometry(len, stoneH), m.stone.clone());
      (st.material as THREE.MeshStandardMaterial).map = m.stone.map!.clone();
      (st.material as THREE.MeshStandardMaterial).map!.repeat.set(len / 4, 1);
      (st.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
      const nm = m.stone.normalMap!.clone();
      nm.repeat.set(len / 4, 1);
      nm.needsUpdate = true;
      (st.material as THREE.MeshStandardMaterial).normalMap = nm;
      st.position.y = stoneH / 2;
      st.receiveShadow = true;
      grp.add(st);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(len, H - stoneH), m.plaster);
      pl.position.y = stoneH + (H - stoneH) / 2;
      pl.receiveShadow = true;
      grp.add(pl);
      // Timber: sill beam, top beam, posts and braces.
      const sill = plank(len, 0.16, 0.12, m.timber, 1);
      sill.position.set(0, stoneH + 0.04, 0.05);
      grp.add(sill);
      const top = plank(len, 0.22, 0.16, m.timber, 1);
      top.position.set(0, H - 0.11, 0.07);
      grp.add(top);
      const posts = Math.round(len / 2.6);
      for (let i = 0; i <= posts; i++) {
        const x = -len / 2 + (i / posts) * len;
        const p = plank(0.18, H - stoneH, 0.12, m.timber, 1);
        p.position.set(x, stoneH + (H - stoneH) / 2, 0.06);
        grp.add(p);
        if (i < posts && i % 2 === 0) {
          const span = len / posts;
          const brace = plank(0.12, Math.hypot(span, H - stoneH - 0.3) * 0.98, 0.09, m.timber, 1);
          brace.position.set(x + span / 2, stoneH + (H - stoneH) / 2, 0.05);
          brace.rotation.z = Math.atan2(span, H - stoneH - 0.3) * (i % 4 === 0 ? 1 : -1);
          grp.add(brace);
        }
      }
      g.add(grp);
      return grp;
    };
    wall(W, new THREE.Vector3(0, 0, -D / 2), 0);
    wall(W, new THREE.Vector3(0, 0, D / 2), Math.PI);
    wall(D, new THREE.Vector3(-W / 2, 0, 0), Math.PI / 2);
    const east = wall(D, new THREE.Vector3(W / 2, 0, 0), -Math.PI / 2);
    void east;

    // Ceiling beams.
    for (let i = 0; i < 6; i++) {
      const x = -W / 2 + 1.4 + i * 2.65;
      const beam = plank(0.3, 0.34, D, m.timber, 1);
      beam.position.set(x, H - 0.17, 0);
      g.add(beam);
    }
    const ridge = plank(W, 0.3, 0.28, m.timber, 1);
    ridge.position.set(0, H - 0.5, 0);
    g.add(ridge);

    // Arched windows with moonlight.
    const win = (pos: THREE.Vector3, rotY: number, w = 1.1, h = 1.7) => {
      const grp = new THREE.Group();
      grp.position.copy(pos);
      grp.rotation.y = rotY;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(-w / 2, h - w / 2);
      shape.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
      shape.lineTo(w / 2, 0);
      shape.closePath();
      const glass = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), m.moonGlass);
      glass.position.z = 0.01;
      grp.add(glass);
      // Night sky gradient with stars painted on.
      const sky = paint(128, 256, (ctx, cw, ch) => {
        const gr = ctx.createLinearGradient(0, 0, 0, ch);
        gr.addColorStop(0, '#0a1430');
        gr.addColorStop(0.7, '#1d3366');
        gr.addColorStop(1, '#3a4f80');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, cw, ch);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(255,255,240,${0.3 + Math.random() * 0.7})`;
          ctx.fillRect(Math.random() * cw, Math.random() * ch * 0.7, 1.5, 1.5);
        }
        // Distant rooftops.
        ctx.fillStyle = '#05070d';
        let x = 0;
        while (x < cw) {
          const bw = 14 + Math.random() * 26;
          const bh = 30 + Math.random() * 50;
          ctx.beginPath();
          ctx.moveTo(x, ch);
          ctx.lineTo(x, ch - bh);
          ctx.lineTo(x + bw / 2, ch - bh - 16);
          ctx.lineTo(x + bw, ch - bh);
          ctx.lineTo(x + bw, ch);
          ctx.fill();
          if (Math.random() < 0.5) {
            ctx.fillStyle = '#ffb347';
            ctx.fillRect(x + bw * 0.4, ch - bh * 0.6, 3, 4);
            ctx.fillStyle = '#05070d';
          }
          x += bw;
        }
      });
      (glass.material as THREE.MeshBasicMaterial) = new THREE.MeshBasicMaterial({ map: sky, color: new THREE.Color(1.25, 1.25, 1.35) });
      const uvs = glass.geometry.attributes.uv as THREE.BufferAttribute;
      const ps = glass.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, ps.getX(i) / w + 0.5, ps.getY(i) / h);
      // Mullions.
      const mull = plank(0.05, h, 0.06, m.timber, 1);
      mull.position.set(0, h / 2, 0.04);
      grp.add(mull);
      for (const y of [h * 0.35, h * 0.62]) {
        const tr = plank(w, 0.045, 0.06, m.timber, 1);
        tr.position.set(0, y, 0.04);
        grp.add(tr);
      }
      // Stone surround.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.05, 0.08, 6, 20, Math.PI), m.stoneHearth);
      ring.position.set(0, h - w / 2, 0.02);
      grp.add(ring);
      for (const x of [-w / 2 - 0.05, w / 2 + 0.05]) {
        const side = box(0.16, h - w / 2, 0.14, m.stoneHearth);
        side.position.set(x, (h - w / 2) / 2, 0.02);
        grp.add(side);
      }
      const sillB = box(w + 0.36, 0.08, 0.24, m.stoneHearth);
      sillB.position.set(0, -0.04, 0.08);
      grp.add(sillB);
      // Moonbeam glow.
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 1.6, h * 1.4),
        new THREE.MeshBasicMaterial({ map: this.glowTex, color: new THREE.Color(0.18, 0.26, 0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      beam.position.set(0, h * 0.55, 0.05);
      grp.add(beam);
      this.group.add(grp);
      return grp;
    };
    win(new THREE.Vector3(-6.0, 1.7, -D / 2 + 0.02), 0);
    win(new THREE.Vector3(2.0, 1.7, -D / 2 + 0.02), 0);
    win(new THREE.Vector3(W / 2 - 0.02, 1.6, -3.3), -Math.PI / 2, 1.0, 1.8);
    win(new THREE.Vector3(W / 2 - 0.02, 1.6, 4.5), -Math.PI / 2, 1.0, 1.8);
    win(new THREE.Vector3(-W / 2 + 0.02, 1.7, 4.4), Math.PI / 2);

    // Scattered tables & stools in the shadows for depth.
    const furn = (x: number, z: number, r = 0.55) => {
      const t = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 24), m.wood);
      top.position.y = 0.76;
      top.castShadow = top.receiveShadow = true;
      t.add(top);
      const leg = cyl(0.06, 0.09, 0.74, m.woodDark, 10);
      leg.position.y = 0.37;
      t.add(leg);
      const foot = cyl(0.3, 0.32, 0.05, m.woodDark, 12);
      foot.position.y = 0.025;
      t.add(foot);
      const tk = tankard(m, 1.1);
      tk.position.set(0.15, 0.79, 0.1);
      t.add(tk);
      const c = candle(m, this.flames, new THREE.Vector3(x - 0.12, 0.79, z - 0.08), 0.1, 0.02);
      this.group.add(c.group);
      t.position.set(x, 0, z);
      g.add(t);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + x;
        const st = new THREE.Group();
        const seat = cyl(0.19, 0.19, 0.05, m.wood, 14);
        seat.position.y = 0.46;
        st.add(seat);
        for (let k = 0; k < 3; k++) {
          const b = (k / 3) * Math.PI * 2;
          const l = cyl(0.02, 0.025, 0.46, m.woodDark, 6);
          l.position.set(Math.cos(b) * 0.12, 0.23, Math.sin(b) * 0.12);
          st.add(l);
        }
        st.position.set(x + Math.cos(a) * 0.85, 0, z + Math.sin(a) * 0.85);
        g.add(st);
      }
    };
    furn(-1.2, 3.2);
    furn(-4.4, 3.8);
    furn(1.6, 4.6, 0.5);

    // Barrels and crates in corners.
    for (const [x, z, s] of [
      [7.3, -5.3, 1],
      [6.6, -5.4, 0.9],
      [7.2, 5.3, 1],
      [-7.3, 5.4, 1],
    ]) {
      const b = barrel(m, 0.9 * s, 0.34 * s);
      b.position.set(x, 0, z);
      b.rotation.y = x;
      g.add(b);
    }
  }

  // ------------------------------------------------------------------ bar (main menu)

  private buildBar(cardBack: THREE.Texture) {
    const m = this.mats;
    const g = this.group;
    const x0 = -6.1;
    const x1 = 0.7;
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    const zFront = -3.02;
    const topY = 1.12;
    // Counter body (vertical planks).
    const front = plank(len, topY - 0.08, 0.08, m.woodDark, 1.4);
    front.position.set(cx, (topY - 0.08) / 2, zFront - 0.04);
    g.add(front);
    for (let i = 0; i < 18; i++) {
      const x = x0 + 0.2 + (i / 17) * (len - 0.4);
      const batten = plank(0.06, topY - 0.2, 0.03, m.timber, 1);
      batten.position.set(x, (topY - 0.2) / 2 + 0.08, zFront + 0.01);
      g.add(batten);
    }
    const top = plank(len + 0.2, 0.08, 0.78, m.wood, 1);
    top.position.set(cx, topY - 0.04, zFront - 0.33);
    g.add(top);
    const lip = plank(len + 0.24, 0.05, 0.06, m.woodDark, 1);
    lip.position.set(cx, topY - 0.06, zFront + 0.06);
    g.add(lip);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 10), m.brass);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(cx, 0.22, zFront + 0.2);
    g.add(rail);
    // Back bar: shelves with bottles, barrels on racks.
    const backZ = -5.82;
    const shelfBack = plank(len, 1.6, 0.06, m.woodDark, 1.2);
    shelfBack.position.set(cx, 1.6, backZ);
    g.add(shelfBack);
    for (const y of [1.25, 1.72, 2.2]) {
      const s = plank(len, 0.05, 0.34, m.wood, 1);
      s.position.set(cx, y, backZ + 0.18);
      g.add(s);
      for (let i = 0; i < 26; i++) {
        if (Math.random() < 0.25) continue;
        const b = bottle(m, (i * 7 + Math.round(y * 10)) % 3, 0.2 + Math.random() * 0.12);
        b.position.set(x0 + 0.2 + (i / 25) * (len - 0.4) + (Math.random() - 0.5) * 0.05, y + 0.025, backZ + 0.15 + (Math.random() - 0.5) * 0.08);
        g.add(b);
      }
    }
    const lowCab = plank(len, 0.9, 0.5, m.wood, 1.2);
    lowCab.position.set(cx, 0.45, backZ + 0.25);
    g.add(lowCab);
    for (let i = 0; i < 3; i++) {
      const b = barrel(m, 0.55, 0.22);
      b.rotation.z = Math.PI / 2;
      b.position.set(-5.6 + i * 0.5, 1.15, backZ + 0.25);
      g.add(b);
    }
    // Lanterns over the bar.
    lantern(m, this.flames, g, new THREE.Vector3(-4.4, 2.35, -3.35), 1.8);
    lantern(m, this.flames, g, new THREE.Vector3(-0.9, 2.35, -3.35), 1.8);
    // Candles along the counter.
    for (const x of [-5.4, -4.6, -0.3]) {
      const c = candle(m, this.flames, new THREE.Vector3(x, topY, -3.45), 0.12 + Math.random() * 0.08, 0.024);
      g.add(c.group);
    }
    // Tankards, a cloth.
    for (const [x, z] of [
      [-5.1, -3.6],
      [-4.9, -3.3],
      [-0.6, -3.55],
      [0.1, -3.3],
    ]) {
      const t = tankard(m, 1.2);
      t.position.set(x, topY, z);
      t.rotation.y = x * 3;
      g.add(t);
    }

    // ---- Menu props on the counter, in front of the camera.
    const counterZ = -3.38;
    // PLAY: card box, fanned cards, dice.
    const play = new THREE.Group();
    play.position.set(-2.62, topY, counterZ);
    play.scale.setScalar(1.7);
    const cardMat = new THREE.MeshStandardMaterial({ map: cardBack, roughness: 0.5 });
    const cardGeo = new THREE.BoxGeometry(0.063, 0.0012, 0.088);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(cardGeo, [m.parchment, m.parchment, cardMat, m.parchment, m.parchment, m.parchment]);
      c.position.set(-0.06 + i * 0.03, 0.002 + i * 0.0013, 0.03 - Math.abs(i - 2) * 0.006);
      c.rotation.y = -0.5 + i * 0.22;
      c.castShadow = true;
      play.add(c);
    }
    const deckBox = new THREE.Group();
    const db = plank(0.08, 0.035, 0.105, m.woodLight, 2);
    db.position.y = 0.0175;
    deckBox.add(db);
    const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.085), cardMat);
    crest.rotation.x = -Math.PI / 2;
    crest.position.y = 0.0356;
    deckBox.add(crest);
    deckBox.position.set(0.11, 0, -0.04);
    deckBox.rotation.y = 0.4;
    play.add(deckBox);
    const d1 = dice();
    d1.position.set(-0.13, 0.0225, 0.07);
    d1.rotation.set(0.1, 0.6, 0);
    play.add(d1);
    const d2 = dice();
    d2.position.set(-0.07, 0.0225, 0.11);
    d2.rotation.set(Math.PI / 2, 0.2, 0.3);
    play.add(d2);
    g.add(play);

    // SHOP: purse and coins.
    const shop = new THREE.Group();
    shop.position.set(-3.42, topY, counterZ + 0.04);
    shop.scale.setScalar(1.5);
    const p = purse(m);
    p.scale.setScalar(1.2);
    shop.add(p);
    for (const [x, z, n] of [
      [0.13, 0.05, 9],
      [0.18, -0.03, 5],
      [0.09, 0.11, 3],
      [-0.12, 0.08, 6],
    ]) {
      const cs = coinStack(m, n);
      cs.position.set(x, 0, z);
      shop.add(cs);
    }
    g.add(shop);

    // INVENTORY: iron-bound chest.
    const inv = chest(m);
    inv.position.set(-1.84, topY, counterZ - 0.06);
    inv.scale.setScalar(1.25);
    inv.rotation.y = -0.35;
    g.add(inv);

    // CHALLENGES: pinned parchment with a dagger on the back-bar post.
    const chal = new THREE.Group();
    chal.position.set(-3.85, 2.55, backZ + 0.05);
    const notice = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.55),
      new THREE.MeshStandardMaterial({
        roughness: 0.9,
        map: paint(256, 336, (ctx, w, h) => {
          ctx.fillStyle = '#e4d2a8';
          ctx.fillRect(0, 0, w, h);
          const gr = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.8);
          gr.addColorStop(0, 'rgba(0,0,0,0)');
          gr.addColorStop(1, 'rgba(90,50,10,0.55)');
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#3a1a0a';
          ctx.font = '44px "Grenze Gotisch"';
          ctx.textAlign = 'center';
          ctx.fillText('Wanted', w / 2, 62);
          ctx.font = '22px "Alegreya"';
          for (let i = 0; i < 6; i++) {
            ctx.fillRect(40, 110 + i * 30, w - 80 - (i % 3) * 30, 3);
          }
          ctx.font = '28px "Grenze Gotisch"';
          ctx.fillText('Reward', w / 2, 310);
        }),
      })
    );
    chal.add(notice);
    const knife = new THREE.Group();
    const blade = box(0.012, 0.16, 0.004, m.iron);
    blade.position.y = -0.08;
    knife.add(blade);
    const grip = cyl(0.012, 0.012, 0.09, m.leather, 8);
    grip.position.y = 0.05;
    knife.add(grip);
    knife.position.set(0.13, 0.2, 0.03);
    knife.rotation.set(-0.6, 0, 0.5);
    chal.add(knife);
    g.add(chal);

    return { play, shop, inventory: inv, challenges: chal };
  }

  // ------------------------------------------------------------------ hearth

  private buildHearth(): void {
    const m = this.mats;
    const grp = new THREE.Group();
    grp.position.set(-7.75, 0, -1.4);
    grp.rotation.y = Math.PI / 2;
    // Stone surround.
    const left = box(0.5, 1.4, 0.7, m.stoneHearth);
    left.position.set(-0.95, 0.7, 0.2);
    const right = left.clone();
    right.position.x = 0.95;
    const lintel = box(2.5, 0.42, 0.78, m.stoneHearth);
    lintel.position.set(0, 1.55, 0.22);
    const mantle = plank(2.8, 0.12, 0.42, m.timber, 1);
    mantle.position.set(0, 1.82, 0.36);
    const chimney = box(2.1, 2.5, 0.6, m.stoneHearth);
    chimney.position.set(0, 3.1, 0.1);
    const back = box(1.5, 1.4, 0.1, m.soot);
    back.position.set(0, 0.7, -0.05);
    const hearthStone = box(2.6, 0.08, 1.1, m.stoneHearth);
    hearthStone.position.set(0, 0.04, 0.45);
    grp.add(left, right, lintel, mantle, chimney, back, hearthStone);
    // Logs.
    for (let i = 0; i < 4; i++) {
      const log = cyl(0.07, 0.08, 0.8, m.woodDark, 8);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i - 1.5) * 0.4;
      log.position.set(0, 0.14 + (i % 2) * 0.1, 0.18 + (i - 1.5) * 0.06);
      grp.add(log);
    }
    // Glowing coals.
    const coals = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ map: this.glowTex, color: new THREE.Color(3, 0.9, 0.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    coals.rotation.x = -Math.PI / 2;
    coals.position.set(0, 0.1, 0.2);
    grp.add(coals);
    this.fire.group.position.set(0, 0.12, 0.18);
    grp.add(this.fire.group);
    // Mantle dressing: candles, a tankard, a skull-free but sinister sword.
    for (const x of [-1.1, -0.85, 1.0]) {
      candle(m, this.flames, new THREE.Vector3(x, 1.88, 0.36), 0.14 + Math.random() * 0.1, 0.024, grp);
    }
    const tk = tankard(m, 1.3);
    tk.position.set(0.6, 1.88, 0.4);
    grp.add(tk);
    const sword = new THREE.Group();
    const bl = box(1.0, 0.05, 0.008, m.iron);
    sword.add(bl);
    const gd = box(0.03, 0.2, 0.03, m.brass);
    gd.position.x = -0.5;
    sword.add(gd);
    const hilt = cyl(0.015, 0.015, 0.18, m.leather, 8);
    hilt.rotation.z = Math.PI / 2;
    hilt.position.x = -0.6;
    sword.add(hilt);
    sword.position.set(0.1, 2.25, 0.42);
    grp.add(sword);
    this.group.add(grp);
  }

  // ------------------------------------------------------------------ notice board (play menu)

  private buildBoard(): void {
    const m = this.mats;
    const b = this.board;
    b.position.set(-7.9, 1.62, 1.2);
    b.rotation.y = Math.PI / 2;
    const backing = plank(2.7, 1.75, 0.05, m.woodLight, 1.2);
    backing.position.z = 0.025;
    b.add(backing);
    const frameMat = m.woodDark;
    for (const [w, h, x, y] of [
      [2.9, 0.12, 0, 0.93],
      [2.9, 0.12, 0, -0.93],
      [0.12, 1.98, -1.4, 0],
      [0.12, 1.98, 1.4, 0],
    ]) {
      const f = plank(w, h, 0.08, frameMat, 1);
      f.position.set(x, y, 0.05);
      b.add(f);
    }
    // Carved header.
    const header = plank(1.5, 0.26, 0.06, frameMat, 1);
    header.position.set(0, 1.12, 0.06);
    b.add(header);
    const title = makeText('Tables of Chance', { size: 0.13, color: '#e8c068', glow: 1.3, font: FONT3D.gothicBlack });
    title.position.set(0, 1.12, 0.1);
    b.add(title);
    // Candle sconces on both sides.
    for (const x of [-1.65, 1.65]) {
      const sconce = cyl(0.05, 0.03, 0.05, m.brass, 10);
      sconce.position.set(x, 0.2, 0.15);
      b.add(sconce);
      const arm = box(0.02, 0.02, 0.14, m.brass);
      arm.position.set(x, 0.17, 0.08);
      b.add(arm);
      b.updateWorldMatrix(true, true);
      const c = candle(m, this.flames, new THREE.Vector3(x, 0.225, 0.15), 0.16, 0.025, b);
      void c;
    }
    const boardLight = new THREE.PointLight('#ffb062', 3.2, 3.5, 1.8);
    boardLight.position.set(0, 0.4, 0.9);
    b.add(boardLight);
    this.group.add(b);
  }

  // ------------------------------------------------------------------ the den (card table)

  private buildDen(cardBack: THREE.Texture) {
    const m = this.mats;
    const g = this.group;
    const T = this.tableCenter;
    // Round table: wooden rim, felt inlay, pedestal.
    const t = this.table;
    t.position.set(T.x, 0, T.z);
    const rimGeo = new THREE.CylinderGeometry(1.1, 1.08, 0.08, 48);
    const rim = new THREE.Mesh(rimGeo, m.wood);
    rim.position.y = this.tableTop - 0.04;
    rim.castShadow = rim.receiveShadow = true;
    t.add(rim);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.035, 10, 64), m.woodDark);
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = this.tableTop + 0.005;
    rimRing.castShadow = true;
    t.add(rimRing);
    const felt = new THREE.Mesh(new THREE.CircleGeometry(1.0, 64), m.felt);
    felt.rotation.x = -Math.PI / 2;
    felt.rotation.z = Math.PI / 2;
    felt.position.y = this.tableTop + 0.001;
    felt.receiveShadow = true;
    t.add(felt);
    const ped = cyl(0.14, 0.2, 0.72, m.woodDark, 16);
    ped.position.y = 0.36;
    t.add(ped);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const foot = plank(0.7, 0.08, 0.12, m.woodDark, 1);
      foot.position.set(Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3);
      foot.rotation.y = -a;
      t.add(foot);
    }
    g.add(t);
    // Table candles (two short clusters).
    for (const [dx, dz] of [
      [0.62, -0.62],
      [0.62, 0.62],
    ]) {
      for (let k = 0; k < 2; k++) {
        const c = candle(m, this.flames, new THREE.Vector3(T.x + dx + k * 0.05, this.tableTop, T.z + dz + (k ? 0.05 : -0.02)), 0.06 + k * 0.04, 0.02);
        g.add(c.group);
        this.tableCandleFlames.push(c.flame);
      }
    }

    // Chairs.
    const oppChair = chair(m);
    oppChair.position.copy(this.opponentSeat);
    oppChair.rotation.y = -Math.PI / 2;
    g.add(oppChair);
    const myChair = chair(m);
    myChair.position.set(2.85, 0, T.z);
    myChair.rotation.y = Math.PI / 2;
    g.add(myChair);

    // Chandelier above the table.
    const ch = new THREE.Group();
    ch.position.set(T.x, 2.55, T.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 40), m.iron);
    ring.rotation.x = Math.PI / 2;
    ch.add(ring);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const chain = cyl(0.006, 0.006, 1.0, m.iron, 4);
      chain.position.set(Math.cos(a) * 0.25, 0.45, Math.sin(a) * 0.25);
      chain.rotation.z = Math.cos(a) * 0.45;
      chain.rotation.x = -Math.sin(a) * 0.45;
      ch.add(chain);
    }
    g.add(ch);
    ch.updateWorldMatrix(true, true);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cup = cyl(0.035, 0.02, 0.03, m.iron, 8);
      cup.position.set(Math.cos(a) * 0.5, 0.02, Math.sin(a) * 0.5);
      ch.add(cup);
      const c = candle(m, this.flames, new THREE.Vector3(Math.cos(a) * 0.5, 0.035, Math.sin(a) * 0.5), 0.1, 0.018, ch);
      this.chandelierFlames.push(c.flame);
    }

    // ---- Minstrels' stage behind the opponent.
    const stage = new THREE.Group();
    const stageX = 6.55;
    const platform = plank(1.6, 0.42, 6.4, m.woodDark, 1);
    platform.position.set(stageX + 0.8, 0.21, 0.6);
    stage.add(platform);
    const edge = plank(0.08, 0.1, 6.4, m.timber, 1);
    edge.position.set(stageX + 0.02, 0.44, 0.6);
    stage.add(edge);
    // Velvet curtains framing the stage.
    for (const z of [-2.55, 3.75]) {
      const c = drape(1.3, 3.9, m.velvet, 5, 0.07);
      c.position.set(stageX + 0.25, 2.2, z);
      c.rotation.y = -Math.PI / 2;
      stage.add(c);
    }
    const valance = drape(6.6, 0.55, m.velvet, 22, 0.05);
    valance.position.set(stageX + 0.2, 3.9, 0.6);
    valance.rotation.y = -Math.PI / 2;
    stage.add(valance);
    // Tapestry behind (dark, with a hooded crest).
    const tapTex = paint(512, 768, (ctx, w, h) => {
      ctx.fillStyle = '#2a0c0e';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2200; i++) {
        ctx.fillStyle = `rgba(${60 + Math.random() * 40},${10 + Math.random() * 10},${12},${Math.random() * 0.25})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 6);
      }
      ctx.strokeStyle = '#b8903e';
      ctx.lineWidth = 10;
      ctx.strokeRect(24, 24, w - 48, h - 48);
      ctx.lineWidth = 3;
      ctx.strokeRect(44, 44, w - 88, h - 88);
      ctx.fillStyle = '#b8903e';
      ctx.beginPath();
      ctx.moveTo(w / 2 + 20, h * 0.28);
      ctx.bezierCurveTo(w * 0.3, h * 0.33, w * 0.28, h * 0.55, w * 0.33, h * 0.62);
      ctx.lineTo(w * 0.67, h * 0.62);
      ctx.bezierCurveTo(w * 0.72, h * 0.55, w * 0.66, h * 0.36, w / 2 + 20, h * 0.28);
      ctx.fill();
      ctx.fillRect(w * 0.2, h * 0.62, w * 0.6, h * 0.12);
      ctx.fillStyle = '#12040a';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.49, w * 0.09, h * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9a3a';
      ctx.fillRect(w / 2 - 26, h * 0.48, 16, 6);
      ctx.fillRect(w / 2 + 10, h * 0.48, 16, 6);
    });
    const tap = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.6), new THREE.MeshStandardMaterial({ map: tapTex, roughness: 1 }));
    tap.position.set(7.95, 2.3, 0.6);
    tap.rotation.y = -Math.PI / 2;
    stage.add(tap);
    // Instruments: lute on a stand, a drum, a harp silhouette.
    const lute = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.woodLight);
    bowl.scale.set(1, 0.9, 1.35);
    bowl.rotation.x = Math.PI / 2;
    lute.add(bowl);
    const neck = box(0.06, 0.02, 0.5, m.woodDark);
    neck.position.set(0, 0, -0.45);
    lute.add(neck);
    lute.position.set(7.1, 0.95, -1.2);
    lute.rotation.set(-1.2, 0.4, 0);
    stage.add(lute);
    const drum = cyl(0.28, 0.28, 0.35, m.woodLight, 20);
    drum.position.set(7.2, 0.62, 2.6);
    stage.add(drum);
    const skin = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), m.parchment);
    skin.rotation.x = -Math.PI / 2;
    skin.position.set(7.2, 0.8, 2.6);
    stage.add(skin);
    // Candelabras on stage edge.
    for (const z of [-1.7, 2.9]) {
      const stand = cyl(0.02, 0.06, 1.2, m.iron, 8);
      stand.position.set(stageX + 0.35, 1.02, z);
      stage.add(stand);
      for (let k = -1; k <= 1; k++) {
        const c = candle(m, this.flames, new THREE.Vector3(stageX + 0.35, 1.62, z + k * 0.12), 0.12, 0.02);
        stage.add(c.group);
      }
    }
    g.add(stage);

    // ---- Three hanging plaques: odds, hands left, souls left.
    const plaqueGroup = new THREE.Group();
    plaqueGroup.position.set(stageX - 0.05, 1.86, 0.6);
    plaqueGroup.rotation.y = -Math.PI / 2;
    const mkPlaque = (x: number, label: string, color: string) => {
      const p = new THREE.Group();
      p.position.x = x;
      const board = plank(0.86, 0.6, 0.05, m.woodDark, 2);
      p.add(board);
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.48), new THREE.MeshStandardMaterial({ color: '#120a07', roughness: 1 }));
      inner.position.z = 0.026;
      p.add(inner);
      for (const [w, h, xx, yy] of [
        [0.86, 0.035, 0, 0.29],
        [0.86, 0.035, 0, -0.29],
        [0.035, 0.6, -0.42, 0],
        [0.035, 0.6, 0.42, 0],
      ]) {
        const f = box(w, h, 0.02, m.gold, false, false);
        f.position.set(xx, yy, 0.03);
        p.add(f);
      }
      for (const cx of [-0.3, 0.3]) {
        const chain = cyl(0.005, 0.005, 1.6, m.iron, 4);
        chain.position.set(cx, 1.1, 0);
        p.add(chain);
      }
      const lab = makeText(label, { size: 0.072, color: color, glow: 1.6, font: FONT3D.gothicBlack, letterSpacing: 0.02 });
      lab.position.set(0, 0.16, 0.035);
      p.add(lab);
      const val = makeText('—', { size: 0.24, color: color, glow: 3.2, font: FONT3D.gothicBlack });
      val.position.set(0, -0.05, 0.035);
      p.add(val);
      plaqueGroup.add(p);
      return { lab, val };
    };
    const odds = mkPlaque(-1.0, "DEATH'S ODDS", '#ff4a3a');
    const hands = mkPlaque(0, 'HANDS LEFT', '#ffc94a');
    const souls = mkPlaque(1.0, 'SOULS LEFT', '#9fe07a');
    g.add(plaqueGroup);

    // ---- Turn sign: carved board with candle "bulbs" around gilt letters.
    const signGroup = new THREE.Group();
    signGroup.position.set(stageX - 0.08, 2.52, 0.6);
    signGroup.rotation.y = -Math.PI / 2;
    const sb = plank(2.1, 0.5, 0.06, m.woodDark, 1);
    signGroup.add(sb);
    const sbIn = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 0.38), new THREE.MeshStandardMaterial({ color: '#160b07', roughness: 1 }));
    sbIn.position.z = 0.031;
    signGroup.add(sbIn);
    const signText = makeText('Your Turn', { size: 0.27, color: '#ffd27a', glow: 0.25, font: FONT3D.gothicBlack, letterSpacing: 0.03 });
    signText.position.set(0, 0.0, 0.04);
    signGroup.add(signText);
    for (const cx of [-0.8, 0.8]) {
      const chain = cyl(0.005, 0.005, 1.0, m.iron, 4);
      chain.position.set(cx, 0.75, 0);
      signGroup.add(chain);
    }
    g.add(signGroup);
    signGroup.updateWorldMatrix(true, true);
    // Small flames along top and bottom edges (they act like marquee bulbs).
    const signFlames: number[] = [];
    const nb = 11;
    for (let i = 0; i < nb; i++) {
      for (const y of [0.25, -0.25]) {
        const x = -0.95 + (i / (nb - 1)) * 1.9;
        const holder = cyl(0.012, 0.012, 0.02, m.brass, 6);
        holder.position.set(x, y + (y > 0 ? 0.01 : -0.01), 0.04);
        signGroup.add(holder);
        const wp = new THREE.Vector3(x, y + (y > 0 ? 0.02 : 0.0), 0.05).applyMatrix4(signGroup.matrixWorld);
        signFlames.push(this.flames.add(wp, 0.55));
      }
    }
    for (const f of signFlames) this.flames.setLit(f, 0);

    return {
      plaques: { odds: odds.val, hands: hands.val, souls: souls.val, oddsLabel: odds.lab, handsLabel: hands.lab, soulsLabel: souls.lab, group: plaqueGroup },
      sign: { group: signGroup, text: signText, flames: signFlames, mat: signText.material as THREE.MeshBasicMaterial },
    };
  }

  // ------------------------------------------------------------------ runtime

  /** Scale all practical lights (e.g. dim for drama). */
  setLightLevel(k: number): void {
    for (const f of this.flickers) f.base = (this.baseIntensity.get(f.light) ?? f.base) * k;
    this.lights.tableSpot.intensity = (this.baseIntensity.get(this.lights.tableSpot) ?? 30) * k;
    this.lights.hemi.intensity = (this.baseIntensity.get(this.lights.hemi) ?? 0.5) * Math.max(0.3, k);
  }

  update(t: number, dt: number): void {
    this.flames.update(t);
    this.fire.update(t, dt);
    for (const f of this.flickers) {
      const n = Math.sin(t * f.speed + f.seed) * 0.5 + Math.sin(t * f.speed * 2.3 + f.seed * 3) * 0.3 + Math.sin(t * f.speed * 5.1) * 0.2;
      f.light.intensity = f.base * (1 + n * f.amp);
    }
    this.barkeep.update(t, dt);
    // Barkeep polishes a tankard.
    this.barkeep.setReach(0.35 + Math.sin(t * 2.2) * 0.12, 'L');
  }
}
