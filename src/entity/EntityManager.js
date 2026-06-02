// =============================================================
//  EntityManager.js — 敵（影）の出現・消滅・更新＋SAN管理。
//   - 視界外に出現、徘徊→追跡
//   - 接触で SAN 低下＋画面の乱れスパイク。敵は消えて（後退）再出現。
//   - SAN が低いほど画面の乱れ(disturbance)が強まる＝精神崩壊
//   - HUD に SANITY を表示
// =============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeSilhouette } from '../world/ProceduralTextures.js';
import { MazeGenerator } from '../world/MazeGenerator.js';
import { Entity } from './Entity.js';
import { EntityModel } from './EntityModel.js';

const S = CONFIG.world.cellSize;

export class EntityManager {
  constructor(scene, chunks, modelAsset = null) {
    this.scene = scene;
    this.chunks = chunks;
    this.modelAsset = modelAsset; // FBX。null ならスプライト

    // スプライト・フォールバック用マテリアル
    this.material = new THREE.SpriteMaterial({
      map: makeSilhouette(256),
      color: 0x121210,
      transparent: true,
      depthWrite: false,
      fog: true,
      opacity: 1.0,
    });

    this.entities = [];
    this.spawnTimer = 5;       // 初回は早めに気配を出す

    // SAN / 画面の乱れ
    this.san = 100;
    this.spike = 0;            // 接触時の一時スパイク
    this.disturbance = 0;      // 0..1.5（PostProcessing に渡す）
    this.tunnel = 0;           // トンネル視野 0..1
    this.pulse = 0;            // 心音パルス 0..1
    this.heartPhase = 0;
    this.stage = 'STABLE';
    this.cooldown = 0;
    this.nearestDist = Infinity;
    this.nearestPos = new THREE.Vector3();
    this.anyChasing = false;

    this._fwd = new THREE.Vector3();
    this.elSan = document.getElementById('hud-san');
    this.onContact = null;     // コールバック（音など）
    this.onLunge = null;       // 突進開始のコールバック
    this.threat = 0;           // 照明予兆用（0..1、最近接の脅威度）
  }

  update(dt, player) {
    if (!CONFIG.entity.enabled) return;
    const cfg = CONFIG.entity;

    // 遠すぎる影を消す
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (this.entities[i].pos.distanceTo(player.pos) > cfg.despawnDist) {
        this.entities[i].dispose();
        this.entities.splice(i, 1);
      }
    }

    // 出現
    if (this.entities.length < cfg.maxCount) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        // 低SANほど早く再出現
        this.spawnTimer = cfg.spawnInterval * (1 - (1 - this.san / 100) * 0.4);
        this._trySpawn(player);
      }
    }

    // 低SANで脅威が増す（追跡が速く・出現が頻繁に）
    const low0 = 1 - this.san / 100;
    const threat = 1 + low0 * cfg.threatScale;

    // 更新＋最近接の集計
    this.nearestDist = Infinity;
    this.anyChasing = false;
    if (this.cooldown > 0) this.cooldown -= dt;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.threat = threat;
      e.update(dt, player);
      // 逃げ切られて気配が消える（消滅）
      if (e.expired) { e.dispose(); this.entities.splice(i, 1); continue; }
      if (e.state === 'CHASE') this.anyChasing = true;
      // 突進開始を検知して一度だけ通知
      if (e.lunging && !e._wasLunging) this.onLunge?.();
      e._wasLunging = e.lunging;
      if (e.distToPlayer < this.nearestDist) {
        this.nearestDist = e.distToPlayer;
        this.nearestPos.copy(e.pos);
      }
      // 接触処理（非致死）
      if (e.contacted && this.cooldown <= 0) {
        this.san = Math.max(0, this.san - cfg.contactDamage);
        this.spike = 1.3;
        this.cooldown = cfg.contactCooldown;
        this.onContact?.();
        // 影は触れて消える（後退）→ しばらくして再出現
        e.dispose();
        this.entities.splice(i, 1);
        this.spawnTimer = Math.max(this.spawnTimer, cfg.spawnInterval * 0.6);
        continue;
      }
      e.contacted = false;
    }

    // SAN の増減
    if (this.anyChasing && this.nearestDist < cfg.proximityRange) {
      this.san = Math.max(0, this.san - cfg.proximityDrain * dt);
    } else {
      this.san = Math.min(100, this.san + cfg.sanRegen * dt);
    }

    // 画面の乱れ：低SAN + 接触スパイク（SAN変化を強く反映）
    this.spike = Math.max(0, this.spike - dt * 1.4);
    const lowSan = 1 - this.san / 100;
    this.disturbance = Math.min(1.6, lowSan * 0.95 + this.spike);

    // トンネル視野：SAN85以下から閉じ始め、0で最大
    this.tunnel = Math.max(0, (0.85 - this.san / 100) / 0.85);

    // 心音パルス：不安/接近で速く・強く拍動
    const nearK = (this.anyChasing && Number.isFinite(this.nearestDist))
      ? Math.max(0, 1 - this.nearestDist / cfg.proximityRange) : 0;
    const intensity = Math.max(lowSan, nearK);
    this.heartPhase += dt * (1.0 + intensity * 1.4); // 拍が加速
    const ph = this.heartPhase % 1;
    const beat = Math.exp(-ph * 7) + 0.6 * Math.exp(-Math.max(0, ph - 0.28) * 9);
    this.pulse = Math.min(1, beat * (lowSan * 0.9 + nearK * 0.6));

    // 照明予兆用の脅威度（追跡中は強く、予兆距離内なら弱く）
    if (Number.isFinite(this.nearestDist)) {
      if (this.anyChasing) {
        this.threat = Math.max(0, 1 - this.nearestDist / cfg.proximityRange);
      } else {
        this.threat = Math.max(0, (cfg.telegraphDist - this.nearestDist) / cfg.telegraphDist) * 0.5;
      }
    } else {
      this.threat = 0;
    }

    // 正気度ステージ
    this.stage = this.san > 70 ? 'STABLE' : this.san > 40 ? 'UNEASY'
      : this.san > 15 ? 'PANIC' : 'BREAKDOWN';

    // HUD
    if (this.elSan) {
      const v = Math.round(this.san);
      this.elSan.textContent = `${v}% ${this.stage}`;
      this.elSan.className = this.san <= 40 ? 'bad' : '';
    }
  }

  _trySpawn(player) {
    const cfg = CONFIG.entity;
    player.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0; this._fwd.normalize();

    // アンビッシュ: 背後の至近に突然出現し、最初から追跡
    const ambush = Math.random() < cfg.ambushChance;
    const minD = ambush ? cfg.ambushMinDist : cfg.spawnMinDist;
    const maxD = ambush ? cfg.ambushMaxDist : cfg.spawnMaxDist;
    const behindDot = ambush ? -0.5 : 0.25; // アンビッシュは真後ろ寄り

    let fallback = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = minD + Math.random() * (maxD - minD);
      const x = player.pos.x + Math.cos(ang) * dist;
      const z = player.pos.z + Math.sin(ang) * dist;

      // 視界外（前方ではない／アンビッシュは真後ろ）に限定
      const tx = x - player.pos.x, tz = z - player.pos.z;
      const tl = Math.hypot(tx, tz) || 1;
      if ((tx / tl) * this._fwd.x + (tz / tl) * this._fwd.z > behindDot) continue;

      const gx = Math.floor(x / S), gy = Math.floor(z / S);
      const c = MazeGenerator.cell(gx, gy, this.chunks.generationForCell(gx, gy));
      // 通常は暗いセル優先。アンビッシュは明暗を問わない。
      if (!ambush && c.light === 'panel') { if (!fallback) fallback = [gx, gy]; continue; }
      this._spawnAt(gx, gy, ambush);
      return;
    }
    if (fallback) this._spawnAt(fallback[0], fallback[1], false);
  }

  _spawnAt(gx, gy, chasing = false) {
    const visual = this.modelAsset
      ? { type: 'model', instance: EntityModel.createInstance(this.modelAsset) }
      : { type: 'sprite', material: this.material };
    const ent = new Entity(this.scene, this.chunks, visual);
    ent.place((gx + 0.5) * S, (gy + 0.5) * S);
    if (chasing) ent.startChase();
    this.entities.push(ent);
  }
}
