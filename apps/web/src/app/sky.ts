import * as THREE from "three";
import type { Sky } from "./daylight";
import { PALETTE } from "./palette";

/**
 * A gradient dome with a soft sun, a moon and stars, drawn behind everything and immune
 * to fog. `apply` pushes one moment of daylight.ts into the sky, fog and lights.
 */
export function buildSky(radius: number) {
  const uniforms = {
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    haze: { value: new THREE.Color() },
    glow: { value: new THREE.Color(PALETTE.sunGlow) },
    moonColor: { value: new THREE.Color(PALETTE.moon) },
    starColor: { value: new THREE.Color(PALETTE.star) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    moonDir: { value: new THREE.Vector3(0, 1, 0) },
    night: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, haze, glow, moonColor, starColor, sunDir, moonDir;
      uniform float night;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(haze, horizon, smoothstep(0.0, 0.12, h));
        col = mix(col, zenith, smoothstep(0.08, 0.75, h));
        // The sun's glow fades out as it sets.
        float s = max(dot(d, sunDir), 0.0);
        float up = smoothstep(-0.12, 0.05, sunDir.y);
        col += glow * up * (pow(s, 5.0) * 0.28 + pow(s, 48.0) * 0.5 + smoothstep(0.9993, 0.9996, s) * 0.9);
        // Night: a small soft moon and a scatter of stars, thinning toward the horizon.
        float m = max(dot(d, moonDir), 0.0);
        col += moonColor * night * (smoothstep(0.99955, 0.9997, m) * 0.9 + pow(m, 200.0) * 0.12);
        vec3 cell = floor(d * 260.0);
        float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.3, h);
        col += starColor * star * night * (0.4 + 0.6 * hash(cell + 7.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;

  const srgb = (c: THREE.Color, v: [number, number, number]) => c.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);

  function apply(
    sky: Sky,
    scene: THREE.Scene,
    fog: THREE.FogExp2,
    hemi: THREE.HemisphereLight,
    light: THREE.DirectionalLight,
  ) {
    srgb(uniforms.zenith.value, sky.zenith);
    srgb(uniforms.horizon.value, sky.horizon);
    srgb(uniforms.haze.value, sky.fog);
    uniforms.sunDir.value.set(...sky.sunDir);
    uniforms.moonDir.value.set(...sky.moonDir);
    uniforms.night.value = sky.night;
    srgb(fog.color, sky.fog);
    fog.density = sky.fogDensity;
    if (scene.background instanceof THREE.Color) scene.background.copy(fog.color);
    srgb(hemi.color, sky.hemiSky);
    srgb(hemi.groundColor, sky.hemiGround);
    hemi.intensity = sky.hemiIntensity;
    srgb(light.color, sky.light);
    light.intensity = sky.lightIntensity;
  }

  return { object: mesh, apply };
}
