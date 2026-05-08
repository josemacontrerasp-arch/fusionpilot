// Three.js plasma particle field for FusionPilot.
//
// Visual direction:
// - clean premium particle generative art
// - many small sharp dots, not cloudy blobs
// - coherent toroidal/orbital motion for stable plasma
// - fragmented sparks and broken clusters during disruption
// - restrained glow, strong negative space, cyan/violet/magenta palette

import * as THREE from "three";

export const PLASMA_VISUALS = Object.freeze({
  palette: {
    cool: "#65e8ff",
    warm: "#a58cff",
    hot: "#ff64dc",
    danger: "#ff4c9d",
    bgTop: "#050714",
    bgBot: "#090b16",
    ring: "#6de7ff",
  },
  geometry: {
    particleCount: 12000,
    majorRadius: 2.12,
    minorRadius: 0.58,
    shellFraction: 0.80,
    innerStreamFraction: 0.15,
  },
  particles: {
    pointScale: 0.92,
    opacity: 0.96,
    exposure: 1.65,
    coreSharpness: 74.0,
    haloSharpness: 18.0,
    haloMix: 0.24,
    energyLift: 0.38,
  },
  motion: {
    toroidalRate: 0.72,
    poloidalFlow: 0.13,
    swirlStrength: 0.10,
    turbulenceStable: 0.045,
    turbulenceUnstable: 0.36,
    pulseStrength: 0.26,
    densityScale: 0.13,
  },
  disruption: {
    scatter: 0.82,
    expansion: 0.36,
    decay: 0.982,
  },
  ring: {
    tubeScale: 0.055,
    opacityStable: 0.13,
    opacityDisrupted: 0.035,
  },
});

const COLOR_COOL = new THREE.Color(PLASMA_VISUALS.palette.cool);
const COLOR_WARM = new THREE.Color(PLASMA_VISUALS.palette.warm);
const COLOR_HOT = new THREE.Color(PLASMA_VISUALS.palette.hot);
const COLOR_DANGER = new THREE.Color(PLASMA_VISUALS.palette.danger);
const COLOR_BG_TOP = new THREE.Color(PLASMA_VISUALS.palette.bgTop);
const COLOR_BG_BOT = new THREE.Color(PLASMA_VISUALS.palette.bgBot);

const VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aJitter;
  uniform float uTime;
  uniform float uPulse;
  uniform float uDisrupt;
  uniform float uSize;
  uniform float uChaos;
  uniform float uDensityScale;
  uniform float uToroidalRate;
  uniform float uSwirlStrength;
  uniform float uTurbulence;
  uniform float uPulseStrength;
  uniform float uDisruptScatter;
  uniform float uDisruptExpansion;
  uniform float uPoloidalFlow;
  varying float vPhase;
  varying float vEnergy;

  vec3 swirl(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.3 + t * 0.6) * cos(p.z * 0.9 + t * 0.45),
      sin(p.z * 1.1 + t * 0.7) * cos(p.x * 1.2 + t * 0.55),
      sin(p.x * 0.9 + t * 0.5) * cos(p.y * 1.4 + t * 0.65)
    );
  }

  void main() {
    vec3 p = position;
    float t = uTime;

    float toroidalRate = uToroidalRate + aJitter * 0.18;
    float c = cos(toroidalRate * t);
    float s = sin(toroidalRate * t);
    p.xy = mat2(c, -s, s, c) * p.xy;

    vec3 tangent = normalize(vec3(-p.y, p.x, 0.001));
    float stream = sin(t * 2.4 + aPhase * 37.0);
    p += tangent * stream * uPoloidalFlow;
    p.z += cos(t * 1.7 + aPhase * 24.0) * uPoloidalFlow * 0.45;

    p.xy *= uDensityScale;
    p.z *= 0.92 + (uDensityScale - 1.0) * 0.35;

    vec3 noise = swirl(p * 1.15, t * 0.78) * (uSwirlStrength + uChaos * uTurbulence);
    p += noise;

    float pulse = uPulse * (0.45 + 0.55 * sin(t * 6.0 + aPhase * 6.28));
    p += normalize(p + vec3(0.001)) * pulse * uPulseStrength;

    if (uDisrupt > 0.0) {
      vec3 jitter = vec3(
        sin(t * 14.0 + aPhase * 30.0),
        cos(t * 17.0 + aPhase * 22.0),
        sin(t * 11.0 + aPhase * 41.0)
      );
      p += jitter * uDisrupt * uDisruptScatter;
      p += tangent * sin(t * 9.0 + aPhase * 70.0) * uDisrupt * 0.32;
      p *= 1.0 + uDisrupt * uDisruptExpansion;
    }

    vPhase = fract(aPhase + stream * 0.04);
    vEnergy = clamp(length(noise) * 1.6 + abs(uPulse) * 0.42 + uDisrupt * 0.8, 0.0, 1.35);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (116.0 / -mv.z) * (0.84 + 0.16 * sin(t * 3.1 + aPhase * 12.0));
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColorCool;
  uniform vec3 uColorWarm;
  uniform vec3 uColorHot;
  uniform vec3 uColorDanger;
  uniform float uTemp;
  uniform float uDisrupt;
  uniform float uOpacity;
  uniform float uCoreSharpness;
  uniform float uHaloSharpness;
  uniform float uHaloMix;
  uniform float uEnergyLift;
  uniform float uExposure;
  varying float vPhase;
  varying float vEnergy;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;

    float core = exp(-r * r * uCoreSharpness);
    float halo = exp(-r * r * uHaloSharpness);
    float mask = 1.0 - smoothstep(0.18, 0.50, r);
    float intensity = (core + halo * uHaloMix) * mask;

    vec3 c = mix(uColorCool, uColorWarm, smoothstep(0.0, 0.5, uTemp));
    c = mix(c, uColorHot, smoothstep(0.5, 1.0, uTemp));
    c = mix(c, uColorHot, vPhase * 0.18);
    c += vec3(0.14, 0.08, 0.20) * vEnergy * uEnergyLift;
    c = mix(c, uColorDanger, uDisrupt * 0.72);
    c *= uExposure;

    gl_FragColor = vec4(c, intensity * uOpacity * (0.78 + vEnergy * 0.22));
  }
`;

function torusPoint(R, r, theta, phi) {
  const cx = (R + r * Math.cos(phi)) * Math.cos(theta);
  const cy = (R + r * Math.cos(phi)) * Math.sin(theta);
  const cz = r * Math.sin(phi);
  return [cx, cy, cz];
}

function clampDt(x) {
  return Math.max(0.001, Math.min(0.1, x));
}

export class PlasmaScene {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.visuals = PLASMA_VISUALS;
    this.particleCount = options.particleCount ?? this.visuals.geometry.particleCount;
    this.majorR = options.majorR ?? this.visuals.geometry.majorRadius;
    this.minorR = options.minorR ?? this.visuals.geometry.minorRadius;
    this._randSeed = options.seed ?? 1337;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._resize();

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
    this.camera.position.set(0, -4.4, 3.6);
    this.camera.lookAt(0, 0, 0);

    this._buildBackdrop();
    this._buildParticles();
    this._buildCoreRing();

    this.startTime = performance.now() / 1000;
    this.pulseEnergy = 0;
    this.disruptEnergy = 0;
    this._lastDisturbance = null;
    this._ringColor = new THREE.Color(this.visuals.palette.ring);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas);
  }

  _resize() {
    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 360;
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  _random() {
    this._randSeed = (1664525 * this._randSeed + 1013904223) >>> 0;
    return this._randSeed / 4294967296;
  }

  _buildBackdrop() {
    const geom = new THREE.SphereGeometry(20, 24, 18);
    const colors = new Float32Array(geom.attributes.position.count * 3);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y / 20 + 1) * 0.5;
      colors[i * 3] = COLOR_BG_BOT.r + (COLOR_BG_TOP.r - COLOR_BG_BOT.r) * t;
      colors[i * 3 + 1] = COLOR_BG_BOT.g + (COLOR_BG_TOP.g - COLOR_BG_BOT.g) * t;
      colors[i * 3 + 2] = COLOR_BG_BOT.b + (COLOR_BG_TOP.b - COLOR_BG_BOT.b) * t;
    }
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.backdrop = new THREE.Mesh(geom, mat);
    this.scene.add(this.backdrop);
  }

  _buildParticles() {
    const N = this.particleCount;
    const positions = new Float32Array(N * 3);
    const phases = new Float32Array(N);
    const jitters = new Float32Array(N);
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < N; i++) {
      const theta = (i * golden + this._random() * 0.18) % (Math.PI * 2);
      const phi = (i * 1.61803398875 + this._random() * Math.PI * 2) % (Math.PI * 2);
      const layer = this._random();
      let rOff = (this._random() - 0.5) * this.minorR * 0.14;
      let dr;

      if (layer < this.visuals.geometry.shellFraction) {
        dr = this.minorR * (0.78 + this._random() * 0.24);
      } else if (layer < this.visuals.geometry.shellFraction + this.visuals.geometry.innerStreamFraction) {
        dr = this.minorR * (0.38 + this._random() * 0.24);
      } else {
        rOff = this.minorR * (0.18 + this._random() * 0.15);
        dr = this.minorR * (1.02 + this._random() * 0.18);
      }

      const [x, y, z] = torusPoint(this.majorR + rOff, dr, theta, phi);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      phases[i] = this._random();
      jitters[i] = this._random() - 0.5;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geom.setAttribute("aJitter", new THREE.BufferAttribute(jitters, 1));

    this.uniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uDisrupt: { value: 0 },
      uChaos: { value: 0 },
      uTemp: { value: 0.5 },
      uSize: { value: this.visuals.particles.pointScale },
      uOpacity: { value: this.visuals.particles.opacity },
      uDensityScale: { value: 1.0 },
      uToroidalRate: { value: this.visuals.motion.toroidalRate },
      uSwirlStrength: { value: this.visuals.motion.swirlStrength },
      uTurbulence: { value: this.visuals.motion.turbulenceStable },
      uPulseStrength: { value: this.visuals.motion.pulseStrength },
      uDisruptScatter: { value: this.visuals.disruption.scatter },
      uDisruptExpansion: { value: this.visuals.disruption.expansion },
      uPoloidalFlow: { value: this.visuals.motion.poloidalFlow },
      uCoreSharpness: { value: this.visuals.particles.coreSharpness },
      uHaloSharpness: { value: this.visuals.particles.haloSharpness },
      uHaloMix: { value: this.visuals.particles.haloMix },
      uEnergyLift: { value: this.visuals.particles.energyLift },
      uExposure: { value: this.visuals.particles.exposure },
      uColorCool: { value: COLOR_COOL },
      uColorWarm: { value: COLOR_WARM },
      uColorHot: { value: COLOR_HOT },
      uColorDanger: { value: COLOR_DANGER },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(geom, mat);
    this.scene.add(this.points);
  }

  _buildCoreRing() {
    const torusGeom = new THREE.TorusGeometry(
      this.majorR,
      this.minorR * this.visuals.ring.tubeScale,
      18,
      128,
    );
    this.coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.visuals.palette.ring),
      transparent: true,
      opacity: this.visuals.ring.opacityStable,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.coreRing = new THREE.Mesh(torusGeom, this.coreMat);
    this.scene.add(this.coreRing);
  }

  _envelopeUpdate(dt, target, current, decay) {
    return current + (target - current) * Math.min(1, dt * decay);
  }

  update(state, dtSeconds = 1 / 60) {
    const now = performance.now() / 1000 - this.startTime;
    const frameDt = clampDt(dtSeconds);
    this.uniforms.uTime.value = now;

    if (!state) {
      this.uniforms.uTemp.value = 0.45;
      this.uniforms.uChaos.value = 0.05;
      this.uniforms.uPulse.value *= 0.88;
      this.uniforms.uDisrupt.value *= 0.92;
    } else {
      const t01 = Math.max(0, Math.min(1, (state.T_keV - 4) / 22));
      this.uniforms.uTemp.value = this._envelopeUpdate(frameDt, t01, this.uniforms.uTemp.value, 6);

      const chaos = Math.max(0.06, 1 - state.stability);
      this.uniforms.uChaos.value = this._envelopeUpdate(frameDt, chaos, this.uniforms.uChaos.value, 5);

      const turbulenceTarget = this.visuals.motion.turbulenceStable
        + chaos * (this.visuals.motion.turbulenceUnstable - this.visuals.motion.turbulenceStable);
      this.uniforms.uTurbulence.value = this._envelopeUpdate(
        frameDt,
        turbulenceTarget,
        this.uniforms.uTurbulence.value,
        4,
      );

      const density01 = Math.max(0, Math.min(1, (state.n / 1e20 - 0.42) / 0.72));
      const densityScale = 1.0 + (density01 - 0.5) * this.visuals.motion.densityScale;
      this.uniforms.uDensityScale.value = this._envelopeUpdate(
        frameDt,
        densityScale,
        this.uniforms.uDensityScale.value,
        5,
      );

      if (state.disturbance && state.disturbance !== this._lastDisturbance) {
        this.pulseEnergy = state.disturbance.includes("pumpout") ? -0.55 : 0.62;
      }
      this._lastDisturbance = state.disturbance;
      this.pulseEnergy *= 0.88;
      this.uniforms.uPulse.value = this.pulseEnergy;

      if (state.disrupted) this.disruptEnergy = 1.0;
      else this.disruptEnergy *= this.visuals.disruption.decay;
      this.uniforms.uDisrupt.value = this.disruptEnergy;

      this._ringColor.lerpColors(COLOR_COOL, COLOR_HOT, t01);
      this.coreMat.color.copy(this._ringColor);
      this.coreMat.opacity = this.visuals.ring.opacityDisrupted
        + (this.visuals.ring.opacityStable - this.visuals.ring.opacityDisrupted) * (1 - this.disruptEnergy);
    }

    const camAngle = now * 0.05;
    this.camera.position.x = Math.sin(camAngle) * 0.6;
    this.camera.position.z = 3.6 + Math.cos(camAngle * 0.7) * 0.25;
    this.camera.position.y = -4.4 + Math.sin(camAngle * 0.5) * 0.25;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._resizeObserver?.disconnect();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.coreRing.geometry.dispose();
    this.coreMat.dispose();
    this.backdrop.geometry.dispose();
    this.backdrop.material.dispose();
    this.renderer.dispose();
  }
}
