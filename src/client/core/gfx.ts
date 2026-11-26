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

export type Quality = 'lowest' | 'low' | 'medium' | 'high' | 'ultra';

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

export const QUALITIES: readonly Quality[] = ['lowest', 'low', 'medium', 'high', 'ultra'];

/** What each quality tier renders. */
export interface Tier {
  /** Most pixels rendered per frame in Auto resolution; bigger screens are upscaled (bloom and grain hide it). */
  budget: number;
  /** Highest render pixels per CSS pixel. Ultra may go above the screen's own density (supersampling). */
  dprCap: number;
  supersample: boolean;
  /** Lowest render pixels per CSS pixel that Auto resolution drops to. */
  minDensity: number;
  /** Bloom mip levels (0: no bloom at all). */
  bloom: number;
  shadows: 'soft' | 'hard' | 'off';
  /** Shadow map redrawn every Nth frame while the card table is in view. */
  shadowEvery: number;
  shadowSize: number;
  anisotropy: number;
  /** Live point / spot lights (see LightBudget). */
  points: number;
  spots: number;
  /** SMAA preset when rendering below 1.4 pixels per CSS pixel, or none. */
  smaa: SMAAPreset | null;
  grain: number;
}

export const TIERS: Record<Quality, Tier> = {
  ultra: { budget: 5.5e6, dprCap: 2, supersample: true, minDensity: 0.75, bloom: 8, shadows: 'soft', shadowEvery: 1, shadowSize: 2048, anisotropy: 16, points: 4, spots: 2, smaa: SMAAPreset.HIGH, grain: 0.035 },
  high: { budget: 2.4e6, dprCap: 1.5, supersample: false, minDensity: 0.6, bloom: 7, shadows: 'soft', shadowEvery: 1, shadowSize: 1024, anisotropy: 8, points: 3, spots: 1, smaa: SMAAPreset.MEDIUM, grain: 0.035 },
  medium: { budget: 1.4e6, dprCap: 1.25, supersample: false, minDensity: 0.6, bloom: 5, shadows: 'hard', shadowEvery: 2, shadowSize: 1024, anisotropy: 4, points: 3, spots: 1, smaa: null, grain: 0.035 },
  low: { budget: 0.85e6, dprCap: 1, supersample: false, minDensity: 0.5, bloom: 4, shadows: 'off', shadowEvery: 3, shadowSize: 512, anisotropy: 2, points: 2, spots: 1, smaa: null, grain: 0.02 },
  // For the weakest Chromebooks: few pixels (upscaled), no bloom, no shadows, one live lamp.
  lowest: { budget: 0.45e6, dprCap: 0.85, supersample: false, minDensity: 0.4, bloom: 0, shadows: 'off', shadowEvery: 3, shadowSize: 512, anisotropy: 1, points: 1, spots: 0, smaa: null, grain: 0 },
};

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
  /** The tier in use (Auto may have lowered it from the guess). */
  quality: Quality;
  /** Where the shadow-casting light's shadows can be seen. The shadow map is only redrawn while this is on screen. */
  shadowFocus: THREE.Sphere | null = null;
  /** Called just before / after the scene is drawn (light budget). */
  beforeRender?: (camera: THREE.Camera, dt: number) => void;
  afterRender?: () => void;
  /** A tier change. `full`: the player chose it, so lights and shadows follow too (one-off shader rebuild). */
  onQualityChange?: (q: Quality, full: boolean) => void;
  /** Shortest time between rendered frames in ms (a frame-rate cap), 0 for none. */
  minInterval = 0;
  /** Anti-aliasing pass (on standard-density screens; replaces 4x MSAA at a fraction of the cost). */
  private aa: EffectPass;
  private smaa: SMAAEffect;
  private aaOn = false;
  private bloomBlend: BlendFunction;
  private bloomOff = false;
  /** Current render scale (fraction of device pixel ratio). */
  private scale = 1;
  private maxScale = 1;
  private minScale = 0.5;
  /** A fixed share of the native resolution chosen by the player, or null for Auto. */
  private fixedScale: number | null = null;
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
  /** The player picked a tier (or ?q= forced one): Auto may not change it. */
  private fixedQuality: boolean;
  private shadowWasInView = false;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();

  constructor(container: HTMLElement, choice: { quality: 'auto' | Quality; resolution: 'auto' | number }) {
    const params = new URLSearchParams(location.search);
    const forced = params.get('q') as Quality | null;
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

    const picked = forced && QUALITIES.includes(forced) ? forced : choice.quality;
    this.fixedQuality = picked !== 'auto';
    this.quality = picked === 'auto' ? guessQuality(r) : picked;
    this.fixedScale = typeof choice.resolution === 'number' ? choice.resolution : null;
    r.shadowMap.autoUpdate = false;
    this.applyShadowSettings(false);
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
      levels: Math.max(1, TIERS[this.quality].bloom),
    });
    this.bloomBlend = this.bloom.blendMode.blendFunction;
    this.vignette = new VignetteEffect({ offset: 0.28, darkness: 0.72 });
    this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.25 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.composer.addPass(new EffectPass(this.camera, this.bloom, tone, this.grade, this.chroma, this.vignette));
    this.smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM });
    this.aa = new EffectPass(this.camera, this.smaa);
    void KernelSize;

    this.applyQuality(false);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  get dpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  /** Render size in pixels (for the frame-rate readout). */
  get renderSize(): string {
    return `${this.renderer.domElement.width}×${this.renderer.domElement.height}`;
  }

  /** The player's quality choice: a fixed tier, or Auto (guessed, then adapted to the frame rate). */
  setQuality(choice: 'auto' | Quality): void {
    this.fixedQuality = choice !== 'auto';
    const q = choice === 'auto' ? guessQuality(this.renderer) : choice;
    const was = this.quality;
    this.quality = q;
    if (q !== was || choice === 'auto') this.applyQuality(true);
    this.resize();
  }

  /** The player's resolution choice: a share of the screen's native resolution, or Auto (adapted). */
  setResolution(choice: 'auto' | number): void {
    this.fixedScale = typeof choice === 'number' ? choice : null;
    this.ceiling = 1;
    this.resize();
  }

  /** Shadows on/off and their filter: changing either recompiles every lit shader (players' choice only). */
  private applyShadowSettings(rebuild: boolean): void {
    const sm = this.renderer.shadowMap;
    const t = TIERS[this.quality];
    const enabled = t.shadows !== 'off';
    const type = t.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (sm.enabled === enabled && (!enabled || sm.type === type)) return;
    sm.enabled = enabled;
    sm.type = type;
    sm.needsUpdate = true;
    if (rebuild)
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
  }

  /** Apply the current tier. `full` (the player chose it) also switches shadows and lights. */
  private applyQuality(full: boolean): void {
    const t = TIERS[this.quality];
    setMaxAnisotropy(Math.min(t.anisotropy, this.renderer.capabilities.getMaxAnisotropy()));
    const off = t.bloom === 0;
    if (off !== this.bloomOff) {
      this.bloomOff = off;
      // A skipped effect still runs its blur passes unless told not to.
      this.bloom.blendMode.blendFunction = off ? BlendFunction.SKIP : this.bloomBlend;
      this.bloom.update = off ? () => {} : BloomEffect.prototype.update;
    }
    if (!off) this.bloom.mipmapBlurPass.levels = t.bloom;
    if (t.smaa) this.smaa.applyPreset(t.smaa);
    this.grade.u('uGrain').value = t.grain;
    this.ceiling = 1;
    if (full) this.applyShadowSettings(true);
    this.onQualityChange?.(this.quality, full);
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
    const t = TIERS[this.quality];
    const dpr = this.dpr;
    const budget = Math.sqrt(t.budget / (w * h));
    this.maxScale = Math.min(t.dprCap, budget, t.supersample ? Infinity : dpr) / dpr;
    this.minScale = Math.min(this.maxScale, t.minDensity / dpr);
    if (this.fixedScale !== null) this.scale = this.fixedScale;
    else this.scale = Math.min(Math.max(this.scale, this.minScale), this.maxScale);
    this.renderer.setPixelRatio(dpr * this.scale);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    // Rendering above ~1.4 pixels per CSS pixel already smooths edges; below it, the better tiers add SMAA.
    const aa = !!t.smaa && dpr * this.scale < 1.4;
    if (aa !== this.aaOn) {
      this.aaOn = aa;
      if (aa) this.composer.addPass(this.aa);
      else this.composer.removePass(this.aa);
    }
    this.composer.setSize(w, h);
  }

  /**
   * Adaptive quality, judged on the time between frames. When frames run slow: first drop a tier's cheap extras
   * (SMAA, wide bloom, shadows every frame), then render fewer pixels, then drop another tier. When frames keep up
   * with the display, creep the resolution back up, remembering any step that proved too much. A tier or resolution
   * the player picked is left alone; Auto tier changes never switch shadows or lights (that rebuilds every shader).
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
    // that never reaches its refresh rate must still read as slow. A frame-rate cap sets the floor.
    const recent = Array.from(this.intervals.subarray(0, Math.min(this.nIntervals, this.intervals.length))).sort((a, b) => a - b);
    this.vsync = Math.max(this.minInterval * 0.97, Math.min(17.5, Math.max(6, recent[Math.floor(recent.length * 0.1)])));
    const slow = this.frameEma > Math.max(this.vsync * 1.3, 19);
    const keepingUp = this.frameEma < this.vsync * 1.1;
    const autoScale = this.fixedScale === null;
    const lower = QUALITIES[QUALITIES.indexOf(this.quality) - 1];
    if (slow) {
      if (autoScale && this.clock - this.probeAt < 4) {
        // A step up that turned out too slow: step back and stay below it from now on.
        this.ceiling = Math.max(this.minScale, this.scale / 1.08);
        this.scale = this.ceiling;
        this.probeAt = -1e9;
      } else if (!this.fixedQuality && lower && QUALITIES.indexOf(this.quality) >= QUALITIES.indexOf('high')) {
        this.quality = lower;
        this.applyQuality(false);
      } else if (autoScale && this.scale > this.minScale + 0.01) this.scale = Math.max(this.minScale, this.scale * 0.86);
      else if (!this.fixedQuality && lower) {
        this.quality = lower;
        this.applyQuality(false);
      } else return;
    } else if (autoScale && keepingUp && this.scale < Math.min(this.maxScale, this.ceiling) - 0.01) {
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
    if (inView && (!this.shadowWasInView || this.frameNo % TIERS[this.quality].shadowEvery === 0)) sm.needsUpdate = true;
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
  // Drawing without a graphics card (acceleration off or unavailable).
  if (/swiftshader|llvmpipe|software/.test(name)) return 'lowest';
  // Most Chromebooks (school ones above all) pair a 2-4 core CPU with a small integrated GPU.
  if (cros && (cores <= 2 || /mali-[gt][0-5]\d\b|powervr|adreno [1-5]\d\d/.test(name))) return 'lowest';
  if (cros && (cores <= 4 || /mali|adreno|uhd graphics 6\d\d|hd graphics [2-6]\d\d/.test(name))) return 'low';
  if (cros || cores <= 4 || /mali|adreno [1-5]|powervr|intel.*(hd|uhd)/.test(name)) return 'medium';
  return 'high';
}
