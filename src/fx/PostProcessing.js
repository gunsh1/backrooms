// =============================================================
//  PostProcessing.js
//  EffectComposer による質感付け:
//   RenderPass → UnrealBloom(弱) → カスタム(グレイン/ヴィネット/
//   色収差/黄緑グレーディング) → OutputPass(トーンマップ&sRGB)
// =============================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG } from '../config.js';

// VHS質感パス：ソフトフォーカス（横方向ブラー）＋色ずれ＋オリーブ緑グレード
// ＋黒浮き＋走査線＋周辺減光＋レンズ歪み。古いカムコーダー映像の不気味さ。
const VHSShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: CONFIG.fx.vignette },
    uChromatic: { value: CONFIG.fx.chromatic },
    uDistort: { value: CONFIG.fx.distort },
    uBlur: { value: CONFIG.fx.blur },
    uChromaBleed: { value: CONFIG.fx.chromaBleed },
    uDesat: { value: CONFIG.fx.desat },
    uBlackLift: { value: CONFIG.fx.blackLift },
    uScan: { value: CONFIG.fx.scanline },
    uShadowNoise: { value: CONFIG.fx.shadowNoise },
    uGrade: { value: new THREE.Vector3(...CONFIG.fx.grade) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTunnel: { value: 0 },   // SAN低下のトンネル視野
    uPulse: { value: 0 },    // 心音パルスの明滅
    uTint: { value: new THREE.Vector3(1, 1, 1) }, // 不安の色被り
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uChromatic, uDistort, uBlur,
                  uChromaBleed, uDesat, uBlackLift, uScan, uShadowNoise,
                  uTunnel, uPulse;
    uniform vec3 uGrade, uTint;
    uniform vec2 uResolution;

    float hash13(vec3 p){
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }

    void main(){
      vec2 center = vUv - 0.5;
      float r2 = dot(center, center);

      // レンズ歪み（緩い樽型）
      vec2 uv = 0.5 + center * (1.0 + uDistort * r2);
      vec2 texel = 1.0 / uResolution;

      // ソフトフォーカス：横方向に強めのブラー（VHSの滲み）
      vec3 col = vec3(0.0);
      float wsum = 0.0;
      for (int x = -2; x <= 2; x++) {
        for (int y = -1; y <= 1; y++) {
          vec2 off = vec2(float(x) * 1.4, float(y) * 0.7) * texel * uBlur;
          float w = 1.0;
          col += texture2D(tDiffuse, uv + off).rgb * w;
          wsum += w;
        }
      }
      col /= wsum;

      // 色ずれ（クロマブリード：R/Bを水平にずらす＋周辺色収差）
      float cb = uChromaBleed + uChromatic * (1.0 + r2 * 3.0);
      col.r = texture2D(tDiffuse, uv + vec2(cb, 0.0)).r;
      col.b = texture2D(tDiffuse, uv - vec2(cb, 0.0)).b;

      // 脱色（VHSの淡さ）
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, 1.0 - uDesat);

      // オリーブ緑グレード
      col *= uGrade;

      // 黒浮き（低コントラストの退色感）
      col = uBlackLift + (1.0 - uBlackLift) * col;

      // 走査線（控えめ）
      float scan = 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * uResolution.y * 3.14159));
      col *= scan;

      // 周辺減光
      float r = length(center);
      float vig = smoothstep(0.98, 0.18, r);
      col *= mix(1.0 - uVignette, 1.0, vig);

      // 暗部のみの微ノイズ（既定0）
      if (uShadowNoise > 0.0) {
        float n = hash13(vec3(vUv * uResolution, uTime * 1000.0)) - 0.5;
        col += n * uShadowNoise * (1.0 - smoothstep(0.0, 0.35, lum));
      }

      // トンネル視野（SAN低下で視界が狭まる）
      if (uTunnel > 0.001) {
        float tv = smoothstep(0.82 - uTunnel * 0.6, 0.04, r);
        col *= mix(1.0, tv, clamp(uTunnel, 0.0, 1.0));
      }
      // 心音パルス（明滅）
      col *= 1.0 - uPulse * 0.16;
      // 不安の色被り
      col *= uTint;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostProcessing {
  constructor(renderer, scene, camera) {
    const full = renderer.getSize(new THREE.Vector2());
    // VHSのソフトフォーカス：内部を低解像度でレンダ→引き伸ばしで滲ませる
    this.renderScale = CONFIG.fx.renderScale;
    const size = full.clone().multiplyScalar(this.renderScale).floor();
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // --- アンビエントオクルージョン（GTAO）: 角・接地の陰影 ---
    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = CONFIG.fx.aoIntensity;
    this.gtao.updateGtaoMaterial({
      radius: CONFIG.fx.aoRadius,   // ワールド単位の遮蔽半径
      distanceExponent: 1.0,
      thickness: 1.0,
      scale: 1.0,
      samples: 16,
      distanceFallOff: 1.0,
      screenSpaceRadius: false,
    });
    this.gtao.updatePdMaterial({   // デノイズ（ぼかし）
      lumaPhi: 10, depthPhi: 2, normalPhi: 3,
      radius: 4, radiusExponent: 1, rings: 2, samples: 16,
    });
    this.composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(
      size, CONFIG.fx.bloomStrength, CONFIG.fx.bloomRadius, CONFIG.fx.bloomThreshold);
    this.composer.addPass(this.bloom);

    this.vhs = new ShaderPass(VHSShader);
    this.vhs.uniforms.uResolution.value.copy(size);
    this.composer.addPass(this.vhs);

    this.composer.addPass(new OutputPass());
    this.composer.setSize(size.x, size.y);

    // ディスターブ（SAN低下/接触で画面を乱す）の基準値を保持
    this.base = {
      blur: CONFIG.fx.blur,
      chromaBleed: CONFIG.fx.chromaBleed,
      chromatic: CONFIG.fx.chromatic,
      distort: CONFIG.fx.distort,
      vignette: CONFIG.fx.vignette,
      scanline: CONFIG.fx.scanline,
      desat: CONFIG.fx.desat,
    };
  }

  // d: 0(平常)〜1.5(崩壊)。VHSの各種パラメータを増幅して精神崩壊を表現。
  setDisturbance(d) {
    const u = this.vhs.uniforms;
    u.uBlur.value = this.base.blur + d * 1.8;
    u.uChromaBleed.value = this.base.chromaBleed + d * 0.004;
    u.uChromatic.value = this.base.chromatic + d * 0.003;
    u.uDistort.value = this.base.distort + d * 0.10;
    u.uVignette.value = Math.min(0.75, this.base.vignette + d * 0.18);
    u.uScan.value = this.base.scanline + d * 0.05;
    u.uShadowNoise.value = d * 0.06;
    u.uDesat.value = this.base.desat + Math.min(0.35, d * 0.25);
  }

  // SAN由来の総合演出: 画面の乱れ・トンネル視野・心音パルス・色被り
  setSanity({ disturbance = 0, tunnel = 0, pulse = 0, san = 100 }) {
    this.setDisturbance(disturbance);
    const u = this.vhs.uniforms;
    u.uTunnel.value = tunnel;
    u.uPulse.value = pulse;
    // 低SANほど病的な色被り（わずかに暖色＋青抜け）
    const k = Math.max(0, Math.min(1, (1 - san / 100 - 0.4) / 0.6));
    u.uTint.value.set(1 + k * 0.06, 1 - k * 0.03, 1 - k * 0.14);
  }

  setSize(w, h) {
    const lw = Math.floor(w * this.renderScale);
    const lh = Math.floor(h * this.renderScale);
    this.composer.setSize(lw, lh);
    this.gtao.setSize(lw, lh);
    this.vhs.uniforms.uResolution.value.set(lw, lh);
  }

  render(dt, time) {
    this.vhs.uniforms.uTime.value = time;
    this.composer.render(dt);
  }
}
