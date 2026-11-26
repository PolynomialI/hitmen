import type { Quality } from '../core/gfx';
import * as THREE from 'three';
import { feltTable, hammeredMetal, ironTex, parchmentTex, plaster, softGoods, stoneWall, woodGrain, woodPlanks, type TexSet } from '../gfx/textures';

function rep(set: TexSet, x: number, y: number): TexSet {
  const out: TexSet = { map: set.map.clone() };
  out.map.repeat.set(x, y);
  out.map.needsUpdate = true;
  if (set.normalMap) {
    out.normalMap = set.normalMap.clone();
    out.normalMap.repeat.set(x, y);
    out.normalMap.needsUpdate = true;
  }
  if (set.roughnessMap) {
    out.roughnessMap = set.roughnessMap.clone();
    out.roughnessMap.repeat.set(x, y);
    out.roughnessMap.needsUpdate = true;
  }
  return out;
}

export interface Mats {
  floor: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  stoneHearth: THREE.MeshStandardMaterial;
  plaster: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  woodLight: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  wax: THREE.MeshStandardMaterial;
  parchment: THREE.MeshStandardMaterial;
  velvet: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial[];
  soot: THREE.MeshBasicMaterial;
  moonGlass: THREE.MeshBasicMaterial;
  void: THREE.MeshBasicMaterial;
  /** Generic wood texture set (for objects that want their own repeat). */
  woodSet: TexSet;
}

export function buildMaterials(quality: Quality = 'medium'): Mats {
  const planks = woodPlanks(1024, { planks: 8 });
  const stone = stoneWall(1024);
  // The look-around menus put furniture wood close to the camera: give it real detail (low tier keeps it lighter).
  const fine = quality === 'low' || quality === 'lowest' ? 512 : 1024;
  const pl = plaster(512);
  // One neutral wood, tinted per material (a tint in the colour multiplies exactly like a baked-in one in sRGB):
  // a single detailed texture instead of three.
  const grain = woodGrain(fine, [200, 200, 200], 5);
  const grainDark = grain;
  const grainLight = grain;
  const tint = (r: number, g: number, b: number, over = '#ffffff') => {
    const o = new THREE.Color(over).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    return new THREE.Color().setRGB((r / 200) * o.r, (g / 200) * o.g, (b / 200) * o.b, THREE.SRGBColorSpace);
  };
  const metal = hammeredMetal(256);
  const leatherT = softGoods(256, 6, 71);
  const velvetT = softGoods(256, 24, 72);
  const parch = parchmentTex(512);
  const felt = feltTable(1024);
  const iron = ironTex(256);

  const fl = rep(planks, 4, 4);
  const st = rep(stone, 4, 1);
  const sh = rep(stone, 1.2, 1.2);
  const pls = rep(pl, 4, 2);
  const tim = rep(grainDark, 1, 4);
  const ceil = rep(planks, 3, 3);

  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

  return {
    floor: std({ map: fl.map, normalMap: fl.normalMap, roughnessMap: fl.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.5, 0.5) }),
    stone: std({ map: st.map, normalMap: st.normalMap, roughnessMap: st.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) }),
    stoneHearth: std({ map: sh.map, normalMap: sh.normalMap, roughnessMap: sh.roughnessMap, roughness: 1, color: '#a89a8c', normalScale: new THREE.Vector2(1.4, 1.4) }),
    plaster: std({ map: pls.map, normalMap: pls.normalMap, roughnessMap: pls.roughnessMap, roughness: 1, color: '#c9b89a' }),
    timber: std({ map: tim.map, normalMap: tim.normalMap, roughness: 0.85, color: tint(70, 42, 26, '#8a6a52') }),
    wood: std({ map: grain.map, normalMap: grain.normalMap, roughnessMap: grain.roughnessMap, roughness: 1, color: tint(118, 76, 44) }),
    woodLight: std({ map: grainLight.map, normalMap: grainLight.normalMap, roughnessMap: grainLight.roughnessMap, roughness: 0.95, color: tint(150, 104, 62) }),
    woodDark: std({ map: grainDark.map, normalMap: grainDark.normalMap, roughnessMap: grainDark.roughnessMap, roughness: 1, color: tint(70, 42, 26) }),
    ceiling: std({ map: ceil.map, normalMap: ceil.normalMap, roughness: 1, color: '#4a3a30' }),
    felt: std({ map: felt.map, normalMap: felt.normalMap, roughness: 0.95, normalScale: new THREE.Vector2(0.6, 0.6) }),
    iron: std({ map: iron.map, roughnessMap: iron.roughnessMap, metalness: 0.75, roughness: 1, color: '#9a948c' }),
    brass: std({ color: '#b8862e', map: metal.map, normalMap: metal.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: metal.roughnessMap, metalness: 0.95, roughness: 1 }),
    gold: std({ color: '#e0b04a', map: metal.map, normalMap: metal.normalMap, normalScale: new THREE.Vector2(0.3, 0.3), roughnessMap: metal.roughnessMap, metalness: 1, roughness: 0.85, emissive: '#3a2200', emissiveIntensity: 0.4 }),
    wax: std({ color: '#efe3c4', roughness: 0.5, emissive: '#ffb060', emissiveIntensity: 0.08 }),
    parchment: std({ color: '#f0e2c0', map: parch.map, normalMap: parch.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.9 }),
    velvet: std({ color: '#6a1218', map: velvetT.map, normalMap: velvetT.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.82 }),
    leather: std({ color: '#583420', map: leatherT.map, normalMap: leatherT.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.62 }),
    glass: ['#2f5a2a', '#5a2a1a', '#2a3a5a', '#6a5420', '#3a1a3a'].map((c) =>
      std({ color: c, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, emissive: c, emissiveIntensity: 0.15 })
    ),
    soot: new THREE.MeshBasicMaterial({ color: '#050302' }),
    moonGlass: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.45, 0.85) }),
    void: new THREE.MeshBasicMaterial({ color: '#000000' }),
    woodSet: grain,
  };
}
