import * as THREE from 'three';

const NOISE = /* glsl */ `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float s=0.0; float a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
`;

/**
 * Many small candle flames in one draw call. Each flame is a camera-facing (around Y) quad with a
 * procedural teardrop shader that flickers; brightness > 1 so bloom picks it up.
 */
export class FlameField {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uLit: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  };
  private count = 0;
  private seeds: Float32Array;
  private lit: Float32Array;
  private seedAttr: THREE.InstancedBufferAttribute;
  private litAttr: THREE.InstancedBufferAttribute;

  constructor(max = 256) {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.translate(0, 0.42, 0);
    this.seeds = new Float32Array(max);
    this.lit = new Float32Array(max).fill(1);
    this.seedAttr = new THREE.InstancedBufferAttribute(this.seeds, 1);
    this.litAttr = new THREE.InstancedBufferAttribute(this.lit, 1);
    this.litAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSeed', this.seedAttr);
    geo.setAttribute('aLit', this.litAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        attribute float aLit;
        uniform float uTime;
        varying vec2 vUv;
        varying float vSeed;
        varying float vLit;
        void main(){
          vUv = uv; vSeed = aSeed; vLit = aLit;
          vec4 center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          vec4 wc = modelMatrix * center;
          // Cylindrical billboard: face the camera around the world Y axis.
          vec3 toCam = cameraPosition - wc.xyz; toCam.y = 0.0;
          vec3 right = normalize(cross(vec3(0.0,1.0,0.0), normalize(toCam + vec3(1e-4))));
          float sway = sin(uTime * 3.1 + aSeed * 17.0) * 0.06 + sin(uTime * 7.3 + aSeed * 5.0) * 0.03;
          vec3 p = wc.xyz + right * (position.x + sway * position.y) * sx + vec3(0.0, 1.0, 0.0) * position.y * sy;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uLit;
        uniform vec3 uTint;
        varying vec2 vUv;
        varying float vSeed;
        varying float vLit;
        ${NOISE}
        void main(){
          vec2 p = vUv - vec2(0.5, 0.0);
          float t = uTime * (1.6 + vSeed * 0.4) + vSeed * 40.0;
          float flick = 0.85 + 0.15 * vnoise(vec2(t * 2.0, vSeed * 9.0));
          float hgt = 0.82 * flick;
          // Teardrop: wide near base, pointed at the top.
          float y = vUv.y / hgt;
          float w = 0.23 * sqrt(max(0.0, y)) * pow(max(0.0, 1.0 - y), 0.9) * 2.1;
          w *= 1.0 + 0.18 * (vnoise(vec2(vUv.y * 6.0 - t * 3.0, vSeed)) - 0.5);
          float d = abs(p.x + 0.04 * (vnoise(vec2(vUv.y * 3.0 - t, vSeed * 3.0)) - 0.5) * vUv.y) / max(w, 1e-3);
          float body = smoothstep(1.0, 0.55, d) * step(0.0, y) * smoothstep(1.02, 0.85, y);
          float core = smoothstep(0.55, 0.0, d) * smoothstep(0.75, 0.15, y) * step(0.02, y);
          float blueBase = smoothstep(0.18, 0.0, y) * smoothstep(1.0, 0.2, d);
          vec3 col = vec3(1.0, 0.42, 0.08) * body * 2.2 + vec3(1.0, 0.86, 0.55) * core * 4.0 + vec3(0.25, 0.35, 1.0) * blueBase * 0.6;
          // Soft halo.
          float halo = exp(-length((vUv - vec2(0.5, 0.35)) * vec2(2.2, 1.6)) * 3.2) * 0.35;
          col += vec3(1.0, 0.55, 0.2) * halo;
          col *= uTint;
          float lit = vLit * uLit;
          gl_FragColor = vec4(col * lit, 1.0);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  /** Add a flame at a world position. Returns its index (for lighting/extinguishing individually). */
  add(pos: THREE.Vector3, size = 1): number {
    const i = this.count++;
    const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion(), new THREE.Vector3(0.05 * size, 0.11 * size, 1));
    this.mesh.setMatrixAt(i, m);
    this.seeds[i] = Math.random();
    this.seedAttr.needsUpdate = true;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    return i;
  }

  setLit(i: number, v: number): void {
    this.lit[i] = v;
    this.litAttr.needsUpdate = true;
  }

  update(t: number): void {
    this.uniforms.uTime.value = t;
  }
}

/** Hearth fire: crossed animated flame sheets + rising embers. */
export class HearthFire {
  readonly group = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 }, uPower: { value: 1 } };
  private embers: THREE.Points;
  private emberData: Float32Array;

  constructor(width = 1.1, height = 0.95) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uPower; varying vec2 vUv;
        ${NOISE}
        void main(){
          vec2 uv = vUv;
          float t = uTime;
          float n = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - t * 2.2));
          float n2 = fbm(vec2(uv.x * 7.0 + 3.0, uv.y * 5.0 - t * 3.4));
          float shape = 1.0 - abs(uv.x - 0.5) * 2.0;
          shape = pow(max(shape, 0.0), 0.8);
          float flame = shape * (1.15 - uv.y) * 1.4 - (n * 0.75 + n2 * 0.35) * uv.y * 1.6;
          flame = smoothstep(0.1, 0.6, flame);
          float hot = smoothstep(0.45, 1.0, flame) * (1.0 - uv.y);
          vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.55, 0.12), flame) * flame * 1.6 + vec3(1.0, 0.85, 0.5) * hot * 2.5;
          gl_FragColor = vec4(col * uPower, 1.0);
        }`,
    });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.PlaneGeometry(width * (1 - i * 0.12), height * (1 - i * 0.08));
      g.translate(0, height * 0.5, 0);
      const m = new THREE.Mesh(g, mat);
      m.rotation.y = (i / 3) * Math.PI;
      m.renderOrder = 11;
      this.group.add(m);
    }
    // Embers.
    const N = 60;
    this.emberData = new Float32Array(N * 4);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.emberData[i * 4] = (Math.random() - 0.5) * width * 0.7;
      this.emberData[i * 4 + 1] = Math.random();
      this.emberData[i * 4 + 2] = (Math.random() - 0.5) * 0.4;
      this.emberData[i * 4 + 3] = 0.4 + Math.random() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({
      color: new THREE.Color(3, 1.2, 0.3),
      size: 0.025,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.embers = new THREE.Points(geo, pm);
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
  }

  update(t: number, dt: number): void {
    this.uniforms.uTime.value = t;
    const pos = this.embers.geometry.attributes.position as THREE.BufferAttribute;
    const d = this.emberData;
    for (let i = 0; i < pos.count; i++) {
      d[i * 4 + 1] += dt * 0.35 * d[i * 4 + 3];
      if (d[i * 4 + 1] > 1) {
        d[i * 4 + 1] = 0;
        d[i * 4] = (Math.random() - 0.5) * 0.7;
      }
      const life = d[i * 4 + 1];
      pos.setXYZ(i, d[i * 4] + Math.sin(t * 2 + i) * 0.05 * life, 0.2 + life * 1.8, d[i * 4 + 2] + Math.cos(t * 1.7 + i) * 0.05 * life);
    }
    pos.needsUpdate = true;
  }
}
