import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Side of the floor cells meshes are merged within (metres): the room splits into quarters. */
const CELL = 8;
const _box = new THREE.Box3();
const _c = new THREE.Vector3();

/**
 * Merge static meshes that share a material and a floor cell (a quarter of the room) into single meshes (one draw call per material per
 * cell). Big win on Chromebooks, where draw calls cost more than triangles. Merging per cell, not across the whole
 * room, keeps the pieces small enough to be culled: off-screen corners of the tavern are not drawn, nor drawn into the
 * card table's shadow map.
 * Skips anything under `exclude`, text, instanced meshes, shader materials and multi-material meshes.
 */
export function batchStatic(root: THREE.Object3D, exclude: THREE.Object3D[]): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const skip = new Set(exclude);
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  let before = 0;
  const visit = (o: THREE.Object3D) => {
    if (skip.has(o)) return;
    for (const c of [...o.children]) visit(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    if ((m as unknown as { text?: unknown }).text !== undefined) return; // troika Text
    if (Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial)) return;
    if (m.userData.noBatch || !m.visible) return;
    before++;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = src.getAttribute(name);
      if (a) g.setAttribute(name, a);
    }
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(m.matrixWorld);
    _box.setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute).getCenter(_c);
    const cell = Math.floor(_c.x / CELL) + ',' + Math.floor(_c.z / CELL);
    const key = mat.uuid + '|' + m.castShadow + '|' + m.receiveShadow + '|' + cell;
    let grp = groups.get(key);
    if (!grp) {
      grp = { mat, cast: m.castShadow, recv: m.receiveShadow, geos: [], meshes: [] };
      groups.set(key, grp);
    }
    grp.geos.push(g);
    grp.meshes.push(m);
  };
  visit(root);
  let after = 0;
  for (const grp of groups.values()) {
    if (grp.meshes.length < 2) continue;
    const merged = mergeGeometries(grp.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, grp.mat);
    mesh.castShadow = grp.cast;
    mesh.receiveShadow = grp.recv;
    mesh.matrixAutoUpdate = false;
    for (const m of grp.meshes) m.parent?.remove(m);
    root.add(mesh);
    after++;
  }
  for (const grp of groups.values()) if (grp.meshes.length < 2) after++;
  return { before, after };
}

/**
 * Merge the static meshes under `root` that share a material into one mesh each, in `root`'s own space, so the merged
 * parts still move with it. Subtrees in `keep` (animated parts) and anything batchStatic would skip stay as they are.
 */
export function mergeLocal(root: THREE.Object3D, keep: THREE.Object3D[] = []): void {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const skip = new Set(keep);
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  const visit = (o: THREE.Object3D) => {
    if (skip.has(o)) return;
    for (const c of [...o.children]) visit(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh || Array.isArray(m.material)) return;
    if ((m as unknown as { text?: unknown }).text !== undefined || m.userData.noBatch || !m.visible) return;
    const mat = m.material as THREE.Material;
    if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial)) return;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = src.getAttribute(name);
      if (a) g.setAttribute(name, a);
    }
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
    const key = mat.uuid + '|' + m.castShadow + '|' + m.receiveShadow;
    let grp = groups.get(key);
    if (!grp) groups.set(key, (grp = { mat, cast: m.castShadow, recv: m.receiveShadow, geos: [], meshes: [] }));
    grp.geos.push(g);
    grp.meshes.push(m);
  };
  for (const c of [...root.children]) visit(c);
  for (const grp of groups.values()) {
    if (grp.meshes.length < 2) continue;
    const merged = mergeGeometries(grp.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, grp.mat);
    mesh.castShadow = grp.cast;
    mesh.receiveShadow = grp.recv;
    for (const m of grp.meshes) m.parent?.remove(m);
    root.add(mesh);
  }
}
