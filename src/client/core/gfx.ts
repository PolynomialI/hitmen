import * as THREE from 'three';
import {
  BloomEffect,
  BlendFunction,
  ChromaticAberrationEffect,
  Effect,
  EffectComposer,
  EffectPass,
  KernelSize,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { setMaxAnisotropy } from '../gfx/textures';

export type Quality = 'low' | 'medium' | 'high';

const gradeFrag = /* glsl */ `
uniform float uDanger;
uniform float uHoly;
uniform float uFade;
uniform float uSat;
uniform float uGrain;
uniform float uTime;
uniform float uWarm;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // Warm filmic grade: amber highlights, deep umber shadows.
  vec3 warm = c * vec3(1.06, 0.98, 0.88) + vec3(0.012, 0.004, 0.0) * (1.0 - l);
  c = mix(c, warm, uWarm);
  // Saturation.
  c = mix(vec3(l), c, uSat);
  // Danger: the world drains to blood red.
  float l2 = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 red = vec3(pow(l2, 0.85) * 1.55, l2 * 0.16, l2 * 0.13);
  c = mix(c, red, uDanger * 0.88);
  // Holy flash (Guardian Angel).
  c = mix(c, vec3(1.0, 0.96, 0.84) * (0.75 + l * 0.6), uHoly);
  // Film grain.
  float g = hash(uv * 1024.0 + fract(uTime * 7.31) * 113.0) - 0.5;
  c *= 1.0 + g * uGrain * 2.0;
  // Fade to black.
  c *= (1.0 - uFade);
  outputColor = vec4(max(c, 0.0), inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uDanger', new THREE.Uniform(0)],
        ['uHoly', new THREE.Uniform(0)],
        ['uFade', new THREE.Uniform(1)],
        ['uSat', new THREE.Uniform(1.05)],
        ['uGrain', new THREE.Uniform(0.035)],
        ['uTime', new THREE.Uniform(0)],
        ['uWarm', new THREE.Uniform(1)],
      ]),
    });
  }
  u(name: string): THREE.Uniform {
    return this.uniforms.get(name)!;
  }
}

/** Renderer, post-processing chain and adaptive quality. */
export class Gfx {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly grade = new GradeEffect();
  readonly bloom: BloomEffect;
  readonly vignette: VignetteEffect;
  readonly chroma: ChromaticAberrationEffect;
  quality: Quality;
  /** Current render scale (fraction of device pixel ratio). */
  private scale = 1;
  private maxScale = 1;
  private minScale = 0.5;
  private frameEma = 16;
  private sinceAdjust = 0;
  private fixedQuality: boolean;
  onQualityChange?: (q: Quality) => void;

  constructor(container: HTMLElement) {
    const params = new URLSearchParams(location.search);
    const forced = params.get('q') as Quality | null;
    this.fixedQuality = !!forced;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));

    this.quality = forced ?? guessQuality(r);
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.05, 60);
    this.scene.background = new THREE.Color('#050302');
    this.scene.fog = new THREE.FogExp2('#0b0604', 0.035);

    this.composer = new EffectComposer(r, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: this.quality === 'high' ? 4 : 0,
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({
      intensity: 1.15,
      luminanceThreshold: 0.62,
      luminanceSmoothing: 0.28,
      mipmapBlur: true,
      radius: 0.72,
      levels: this.quality === 'low' ? 5 : 7,
    });
    this.vignette = new VignetteEffect({ offset: 0.28, darkness: 0.72 });
    this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.25 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.composer.addPass(new EffectPass(this.camera, this.bloom, tone, this.grade, this.chroma, this.vignette));
    void KernelSize;

    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  get dpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  private applyQuality(): void {
    const q = this.quality;
    this.maxScale = q === 'high' ? Math.min(1.5, this.dpr) / this.dpr : q === 'medium' ? 0.85 : 0.7;
    this.minScale = q === 'low' ? 0.45 : 0.55;
    this.scale = Math.min(this.scale, this.maxScale);
    if (this.scale <= 0) this.scale = this.maxScale;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.grade.u('uGrain').value = q === 'low' ? 0.02 : 0.035;
    this.onQualityChange?.(q);
  }

  resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    this.camera.aspect = w / h;
    // Keep a sensible horizontal field of view on narrow / portrait screens.
    const baseV = 48;
    if (this.camera.aspect < 1.25) {
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseV) / 2) * 1.25);
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect));
    } else this.camera.fov = baseV;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.dpr * this.scale);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.composer.setSize(w, h);
  }

  /** Adaptive resolution: keep frames under ~18ms on slow devices (Chromebooks). */
  private adapt(dt: number): void {
    const ms = dt * 1000;
    if (ms > 250) return; // tab switch / hitch
    this.frameEma = this.frameEma * 0.94 + ms * 0.06;
    this.sinceAdjust += dt;
    if (this.sinceAdjust < 1.5) return;
    if (this.frameEma > 21 && this.scale > this.minScale) {
      this.scale = Math.max(this.minScale, this.scale - 0.08);
      this.sinceAdjust = 0;
      this.resize();
    } else if (this.frameEma > 21 && this.scale <= this.minScale && !this.fixedQuality && this.quality !== 'low') {
      this.quality = this.quality === 'high' ? 'medium' : 'low';
      this.sinceAdjust = 0;
      this.applyQuality();
      this.resize();
    } else if (this.frameEma < 13 && this.scale < this.maxScale) {
      this.scale = Math.min(this.maxScale, this.scale + 0.05);
      this.sinceAdjust = 0;
      this.resize();
    }
  }

  render(dt: number, time: number): void {
    this.grade.u('uTime').value = time;
    this.adapt(dt);
    this.composer.render(dt);
  }
}

function guessQuality(r: THREE.WebGLRenderer): Quality {
  const gl = r.getContext();
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
  } catch {
    /* ignore */
  }
  const cores = navigator.hardwareConcurrency || 4;
  const cros = /cros/i.test(navigator.userAgent);
  if (/swiftshader|llvmpipe|software/.test(name)) return 'low';
  if (cros || cores <= 4 || /mali|adreno [1-5]|powervr|intel.*(hd|uhd)/.test(name)) return 'medium';
  return 'high';
}
