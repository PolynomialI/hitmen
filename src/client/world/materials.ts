import * as THREE from 'three';
import { feltTable, ironTex, plaster, stoneWall, woodGrain, woodPlanks, type TexSet } from '../gfx/textures';

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

export function buildMaterials(): Mats {
  const planks = woodPlanks(1024, { planks: 8 });
  const stone = stoneWall(1024);
  const pl = plaster(512);
  const grain = woodGrain(512, [118, 76, 44], 5);
  const grainDark = woodGrain(512, [70, 42, 26], 8);
  const grainLight = woodGrain(512, [150, 104, 62], 12);
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
    plaster: std({ map: pls.map, normalMap: pls.normalMap, roughness: 0.95, color: '#c9b89a' }),
    timber: std({ map: tim.map, normalMap: tim.normalMap, roughness: 0.85, color: '#8a6a52' }),
    wood: std({ map: grain.map, normalMap: grain.normalMap, roughness: 0.6, color: '#ffffff' }),
    woodLight: std({ map: grainLight.map, normalMap: grainLight.normalMap, roughness: 0.55 }),
    woodDark: std({ map: grainDark.map, normalMap: grainDark.normalMap, roughness: 0.7 }),
    ceiling: std({ map: ceil.map, normalMap: ceil.normalMap, roughness: 1, color: '#4a3a30' }),
    felt: std({ map: felt.map, normalMap: felt.normalMap, roughness: 0.95, normalScale: new THREE.Vector2(0.6, 0.6) }),
    iron: std({ map: iron.map, roughnessMap: iron.roughnessMap, metalness: 0.75, roughness: 1, color: '#9a948c' }),
    brass: std({ color: '#b8862e', metalness: 0.95, roughness: 0.32 }),
    gold: std({ color: '#e0b04a', metalness: 1, roughness: 0.25, emissive: '#3a2200', emissiveIntensity: 0.4 }),
    wax: std({ color: '#efe3c4', roughness: 0.5, emissive: '#ffb060', emissiveIntensity: 0.08 }),
    parchment: std({ color: '#e8d8b4', roughness: 0.9 }),
    velvet: std({ color: '#5a0f14', roughness: 0.82 }),
    leather: std({ color: '#4a2a18', roughness: 0.7 }),
    glass: ['#2f5a2a', '#5a2a1a', '#2a3a5a', '#6a5420', '#3a1a3a'].map((c) =>
      std({ color: c, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, emissive: c, emissiveIntensity: 0.15 })
    ),
    soot: new THREE.MeshBasicMaterial({ color: '#050302' }),
    moonGlass: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.45, 0.85) }),
    void: new THREE.MeshBasicMaterial({ color: '#000000' }),
    woodSet: grain,
  };
}
