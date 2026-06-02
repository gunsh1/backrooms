// =============================================================
//  FluorescentSystem.js
//  天井の光パネルに対し、限られた数の RectAreaLight をプール
//  してプレイヤー近傍のパネルだけを点灯。emissive 板（常時）と
//  併用して負荷を抑えつつ柔らかい面光を得る。
//  - 不規則明滅（ノイズ）
//  - 一部パネルは死亡（暗闇ゾーン、ChunkManager 側で除外済み）
//  - 最も近い点灯パネルの位置を返し、ハム音の定位に使う。
// =============================================================

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { CONFIG } from '../config.js';

export class FluorescentSystem {
  constructor(scene, materials) {
    RectAreaLightUniformsLib.init();
    this.scene = scene;
    this.materials = materials;
    this.t = 0;

    // ベース照明
    this.ambient = new THREE.AmbientLight(CONFIG.light.ambient, CONFIG.light.ambientIntensity);
    this.hemi = new THREE.HemisphereLight(
      CONFIG.light.hemiSky, CONFIG.light.hemiGround, CONFIG.light.hemiIntensity);
    scene.add(this.ambient, this.hemi);

    // RectAreaLight プール（柔らかい面光・影なし）
    this.pool = [];
    for (let i = 0; i < CONFIG.light.rectLightPool; i++) {
      const rl = new THREE.RectAreaLight(
        CONFIG.light.panelColor, 0, 1.2, 1.2);
      rl.visible = false;
      rl.lookAt(0, -1, 0); // 下向き（位置決めは update で）
      scene.add(rl);
      this.pool.push({ light: rl, flick: 1, phase: i * 1.7 });
    }

    // 影付き SpotLight プール（最寄りパネルに追従して接地影を落とす）
    this.shadowPool = [];
    for (let i = 0; i < CONFIG.light.shadowLightPool; i++) {
      const sl = new THREE.SpotLight(
        CONFIG.light.panelColor, 0, 0,
        Math.PI / 2.6, 0.7, 1.2); // angle, penumbra(柔らか), decay
      sl.castShadow = true;
      sl.shadow.mapSize.set(CONFIG.light.shadowMapSize, CONFIG.light.shadowMapSize);
      sl.shadow.camera.near = 0.3;
      sl.shadow.camera.far = CONFIG.world.wallHeight + 1.0;
      sl.shadow.bias = -0.0006;
      sl.shadow.normalBias = 0.04;
      sl.visible = false;
      const target = new THREE.Object3D();
      scene.add(sl, target, sl.target = target);
      this.shadowPool.push({ light: sl, target });
    }

    this._tmp = new THREE.Vector3();
    this.nearestLitPos = new THREE.Vector3();
  }

  // panels: ChunkManager.activePanels（生きたパネルのみ）
  update(dt, playerPos, panels, threat = 0) {
    this.t += dt;
    // 脅威が高いほど明滅しやすく・落ち込みも深い（接近の予兆）
    const flickerChance = CONFIG.light.flickerChance + threat * 0.35;
    const flickerFloor = 0.15 - threat * 0.13; // 脅威時はより暗く落ちる

    // プレイヤーに近い順に上位 N 個を選ぶ
    // （簡易: 距離でソートせず、しきい値内を距離評価して上位採用）
    const candidates = [];
    for (const p of panels) {
      const dx = p.x - playerPos.x;
      const dz = p.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 24 * 24) candidates.push({ p, d2 });
    }
    candidates.sort((a, b) => a.d2 - b.d2);

    let nearestSet = false;
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      const c = candidates[i];
      if (!c) { slot.light.visible = false; continue; }

      const { p } = c;
      slot.light.visible = true;
      slot.light.position.set(p.x, p.y - 0.05, p.z);
      slot.light.lookAt(p.x, 0, p.z); // 真下を照らす

      // 不規則明滅：脅威が高いほど頻繁・深く落ち込む
      if (Math.random() < flickerChance) {
        slot.flick = Math.max(0.02, flickerFloor) + Math.random() * 0.5;
      } else {
        const wobble = 0.92 + 0.08 * Math.sin(this.t * 37 + slot.phase);
        slot.flick += (wobble - slot.flick) * Math.min(1, dt * 6);
      }
      slot.light.intensity = CONFIG.light.rectLightIntensity * slot.flick;

      if (!nearestSet) {
        this.nearestLitPos.set(p.x, p.y, p.z);
        nearestSet = true;
      }
    }

    // 影付き SpotLight を最寄りパネルに割当て（接地影）
    for (let i = 0; i < this.shadowPool.length; i++) {
      const s = this.shadowPool[i];
      const c = candidates[i];
      if (!c) { s.light.visible = false; continue; }
      const { p } = c;
      s.light.visible = true;
      s.light.position.set(p.x, p.y - 0.05, p.z);
      s.target.position.set(p.x, 0, p.z); // 真下へ
      // RectAreaの明滅に同期させる
      const flick = this.pool[i]?.flick ?? 1;
      s.light.intensity = CONFIG.light.shadowLightIntensity * flick;
    }

    // emissive 板の全体的な明滅（共有マテリアル）。脅威で大きく落ち込む。
    const dropChance = 0.01 + threat * 0.18;
    const globalFlick = 0.9 + 0.1 * Math.sin(this.t * 11.3)
      + (Math.random() < dropChance ? -(0.5 + threat * 0.5) : 0);
    this.materials.panel.emissiveIntensity =
      CONFIG.light.panelEmissive * Math.max(0.15, globalFlick);

    return nearestSet;
  }

  // 暗転イベント等から照明レベルを一時的に落とす
  setBlackout(factor) {
    this.ambient.intensity = CONFIG.light.ambientIntensity * factor;
    this.hemi.intensity = CONFIG.light.hemiIntensity * factor;
    for (const slot of this.pool) {
      slot.light.intensity *= factor;
    }
    for (const s of this.shadowPool) {
      s.light.intensity *= factor;
    }
  }
}
