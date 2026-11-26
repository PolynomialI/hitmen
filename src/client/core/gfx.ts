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
  SMAAEffect,
  SMAAPreset,
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

/** Most pixels each quality renders per frame; bigger screens are upscaled from this (bloom and grain hide it). */
const PIXEL_BUDGET: Record<Quality, number> = { high: 2.4e6, medium: 1.4e6, low: 0.85e6 };
/** Highest device-pixel ratio each quality renders at (above it, the extra sharpness costs more than it shows). */
const DPR_CAP: Record<Quality, number> = { high: 1.5, medium: 1.25, low: 1 };
const BLOOM_LEVELS: Record<Quality, number> = { high: 7, medium: 5, low: 4 };
/** Shadow map redrawn every Nth frame while the card table is in view. */
const SHADOW_EVERY: Record<Quality, number> = { high: 1, medium: 2, low: 3 };

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
  /** Where the shadow-casting light's shadows can be seen. The shadow map is only redrawn while this is on screen. */
  shadowFocus: THREE.Sphere | null = null;
  /** Called just before / after the scene is drawn (light budget). */
  beforeRender?: (camera: THREE.Camera, dt: number) => void;
  afterRender?: () => void;
  /** Anti-aliasing pass (high quality on standard-density screens only; replaces 4x MSAA at a fraction of the cost). */
  private aa: EffectPass;
  private aaOn = false;
  /** Current render scale (fraction of device pixel ratio). */
  private scale = 1;
  private maxScale = 1;
  private minScale = 0.5;
  /** Ceiling found by probing upwards: a step up that made frames slow is not tried again. */
  private ceiling = 1;
  private probeAt = 0;
  private frameEma = 16;
  /** The display's refresh period, estimated from the quick end of recent frame intervals. */
  private vsync = 1000 / 60;
  private intervals = new Float32Array(90);
  private nIntervals = 0;
  private sinceAdjust = 0;
  private clock = 0;
  private frameNo = 0;
  private fixedQuality: boolean;
  private shadowWasInView = false;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
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
    // Checking every shader for errors forces a synchronous wait on each compile: development builds only.
    r.debug.checkShaderErrors = import.meta.env.DEV;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    container.appendChild(r.domElement);

    this.quality = forced ?? guessQuality(r);
    // Floors and walls seen at a grazing angle: 8x filtering is costly texture bandwidth on small GPUs.
    setMaxAnisotropy(Math.min({ high: 8, medium: 4, low: 2 }[this.quality], r.capabilities.getMaxAnisotropy()));
    // Chosen once: switching shadows or their filter later recompiles every shader.
    r.shadowMap.enabled = this.quality !== 'low';
    r.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.05, 60);
    this.scene.background = new THREE.Color('#050302');
    this.scene.fog = new THREE.FogExp2('#0b0604', 0.035);

    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({
      intensity: 1.15,
      luminanceThreshold: 0.62,
      luminanceSmoothing: 0.28,
      mipmapBlur: true,
      radius: 0.72,
      levels: BLOOM_LEVELS[this.quality],
    });
    this.vignette = new VignetteEffect({ offset: 0.28, darkness: 0.72 });
    this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.25 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.composer.addPass(new EffectPass(this.camera, this.bloom, tone, this.grade, this.chroma, this.vignette));
    this.aa = new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }));
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
    this.bloom.mipmapBlurPass.levels = BLOOM_LEVELS[q];
    this.grade.u('uGrain').value = q === 'low' ? 0.02 : 0.035;
    this.ceiling = 1;
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
    const q = this.quality;
    const dpr = this.dpr;
    const budget = Math.sqrt(PIXEL_BUDGET[q] / (w * h));
    this.maxScale = Math.min(DPR_CAP[q], dpr, budget) / dpr;
    this.minScale = Math.min(this.maxScale, (q === 'low' ? 0.5 : 0.6) / dpr);
    this.scale = Math.min(Math.max(this.scale, this.minScale), this.maxScale);
    this.renderer.setPixelRatio(dpr * this.scale);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    // Rendering above ~1.4 pixels per CSS pixel already smooths edges; below it, high quality adds SMAA.
    const aa = q === 'high' && dpr * this.scale < 1.4;
    if (aa !== this.aaOn) {
      this.aaOn = aa;
      if (aa) this.composer.addPass(this.aa);
      else this.composer.removePass(this.aa);
    }
    this.composer.setSize(w, h);
  }

  /**
   * Adaptive quality, judged on the time between frames. When frames run slow: first drop the high-only extras
   * (SMAA, wide bloom, shadows every frame), then render fewer pixels, then drop to low. When frames keep up with the
   * display, creep the resolution back up, remembering any step that proved too much.
   */
  private adapt(dt: number): void {
    const ms = dt * 1000;
    this.clock += dt;
    if (ms > 250 || ms <= 0) return; // tab switch / hitch
    this.intervals[this.nIntervals++ % this.intervals.length] = ms;
    this.frameEma = this.frameEma * 0.9 + ms * 0.1;
    this.sinceAdjust += dt;
    if (this.sinceAdjust < 1.25) return;
    // 10th percentile of the last 90 intervals (stray double frames don't count), capped at a 57 Hz period: a device
    // that never reaches its refresh rate must still read as slow.
    const recent = Array.from(this.intervals.subarray(0, Math.min(this.nIntervals, this.intervals.length))).sort((a, b) => a - b);
    this.vsync = Math.min(17.5, Math.max(6, recent[Math.floor(recent.length * 0.1)]));
    const slow = this.frameEma > Math.max(this.vsync * 1.3, 19);
    const keepingUp = this.frameEma < this.vsync * 1.1;
    if (slow) {
      if (this.clock - this.probeAt < 4) {
        // A step up that turned out too slow: step back and stay below it from now on.
        this.ceiling = Math.max(this.minScale, this.scale / 1.08);
        this.scale = this.ceiling;
        this.probeAt = -1e9;
      } else if (this.quality === 'high' && !this.fixedQuality) {
        this.quality = 'medium';
        this.applyQuality();
      } else if (this.scale > this.minScale + 0.01) this.scale = Math.max(this.minScale, this.scale * 0.86);
      else if (this.quality === 'medium' && !this.fixedQuality) {
        this.quality = 'low';
        this.applyQuality();
      } else return;
    } else if (keepingUp && this.scale < Math.min(this.maxScale, this.ceiling) - 0.01) {
      this.scale = Math.min(this.maxScale, this.ceiling, this.scale * 1.08);
      this.probeAt = this.clock;
    } else return;
    this.sinceAdjust = 0;
    this.frameEma = Math.max(this.vsync, 16);
    this.resize();
  }

  /** Redraw the shadow map only while its area is on screen, every Nth frame on weaker settings. */
  private scheduleShadows(): void {
    const sm = this.renderer.shadowMap;
    if (!sm.enabled) return;
    let inView = true;
    if (this.shadowFocus) {
      this.camera.updateMatrixWorld();
      this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projView);
      inView = this.frustum.intersectsSphere(this.shadowFocus);
    }
    if (inView && (!this.shadowWasInView || this.frameNo % SHADOW_EVERY[this.quality] === 0)) sm.needsUpdate = true;
    this.shadowWasInView = inView;
  }

  render(dt: number, time: number): void {
    this.frameNo++;
    this.grade.u('uTime').value = time;
    this.adapt(dt);
    this.scheduleShadows();
    this.beforeRender?.(this.camera, dt);
    this.composer.render(dt);
    this.afterRender?.();
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
  // Most Chromebooks (school ones above all) pair a 2-4 core CPU with a small integrated GPU.
  if (cros && (cores <= 4 || /mali|powervr|adreno|uhd graphics 6\d\d|hd graphics [2-6]\d\d/.test(name))) return 'low';
  if (cros || cores <= 4 || /mali|adreno [1-5]|powervr|intel.*(hd|uhd)/.test(name)) return 'medium';
  return 'high';
}
