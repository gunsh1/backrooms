// =============================================================
//  Game.js — 全システムのオーケストレーション
//  初期化 → 毎フレーム update（プレイヤー→チャンク→照明→
//  異常→オーディオ→ポストプロセス描画）。
// =============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Renderer } from './Renderer.js';
import { Player } from './Player.js';
import { Materials } from '../world/Materials.js';
import { ChunkManager } from '../world/ChunkManager.js';
import { FluorescentSystem } from '../lighting/FluorescentSystem.js';
import { PostProcessing } from '../fx/PostProcessing.js';
import { AudioManager } from '../audio/AudioManager.js';
import { AnomalyController } from '../anomaly/AnomalyController.js';
import { EntityManager } from '../entity/EntityManager.js';
import { EntityModel } from '../entity/EntityModel.js';
import { makeScaryFace } from '../world/ProceduralTextures.js';

export class Game {
  constructor(container) {
    this.r = new Renderer(container);
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this._fwd = new THREE.Vector3();
  }

  async init() {
    const { scene, camera, renderer } = this.r;

    // マテリアル（テクスチャ）構築
    this.materials = new Materials(renderer);
    await this.materials.build();

    // ワールド
    this.chunks = new ChunkManager(scene, this.materials.materials);

    // プレイヤー
    this.player = new Player(camera, renderer.domElement, this.chunks);

    // 照明
    this.fluo = new FluorescentSystem(scene, this.materials.materials);

    // 異常
    this.anomaly = new AnomalyController(this.fluo);

    // 敵（暗い人型の影）。FBXモデルを読込み（失敗時はスプライト）
    const entityModel = await EntityModel.load();
    this.entities = new EntityManager(scene, this.chunks, entityModel);

    // ジャンプスケア用の顔オーバーレイを準備
    this.jumpscareEl = document.getElementById('jumpscare');
    if (this.jumpscareEl) {
      const faceUrl = makeScaryFace(512).toDataURL();
      this.jumpscareEl.style.backgroundImage = `url(${faceUrl})`;
    }
    this._jumpTimer = null;
    // 接触＝フルジャンプスケア（顔フラッシュ＋悲鳴＋揺れ＋一瞬停止）
    this.entities.onContact = () => this._triggerJumpscare();
    // 突進開始＝小さな揺れ＋突進音
    this.entities.onLunge = () => {
      this.player.addShake(0.12);
      this.audio.playEntitySting?.();
    };

    // オーディオ
    this.audio = new AudioManager(camera);
    this.audio.attachTo(scene);
    this.player.onFootstep = () => this.audio.playFootstep();

    // 初期チャンクをロード
    this.chunks.update(this.player.pos.x, this.player.pos.z);

    // ポストプロセス
    this.post = new PostProcessing(renderer, scene, camera);

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h);
    this.post.setSize(w, h);
  }

  // クリック後にオーディオ開始
  async startAudio() {
    await this.audio.start();
  }

  // フルジャンプスケア演出
  _triggerJumpscare() {
    this.audio.playJumpscare?.();
    this.player.addShake(0.55, 0.32); // 強い揺れ＋一瞬停止
    if (this.jumpscareEl) {
      this.jumpscareEl.classList.add('on');
      if (this._jumpTimer) clearTimeout(this._jumpTimer);
      this._jumpTimer = setTimeout(() => {
        this.jumpscareEl.classList.remove('on');
        this._jumpTimer = null;
      }, 360);
    }
  }

  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    // プレイヤー移動・衝突
    this.player.update(dt);

    // チャンク streaming（プレイヤー位置基準）
    this.chunks.update(this.player.pos.x, this.player.pos.z);

    // 敵（影）の出現・徘徊・追跡・SAN（照明予兆のため先に更新）
    this.entities.update(dt, this.player);
    // 低SANでプレイヤーがパニック加速
    this.player.speedMul = 1 + (1 - this.entities.san / 100) * CONFIG.entity.panicSpeed;

    // 照明（近傍パネル点灯・明滅）。脅威で明滅/減光（接近の予兆）。
    const lit = this.fluo.update(
      dt, this.player.pos, this.chunks.activePanels, this.entities.threat);

    // 異常（HUD・暗転）。カメラ方位を渡す。
    this.r.camera.getWorldDirection(this._fwd);
    const heading = Math.atan2(this._fwd.x, this._fwd.z);
    this.anomaly.update(dt, heading);
    // SAN由来の総合演出（乱れ・トンネル視野・心音パルス・色被り）
    this.post.setSanity({
      disturbance: this.entities.disturbance,
      tunnel: this.entities.tunnel,
      pulse: this.entities.pulse,
      san: this.entities.san,
    });
    // 脅威の多層オーディオ（距離・追跡・SAN）
    this.audio.updateThreatMix?.(
      this.entities.nearestDist, this.entities.anyChasing, this.entities.san);
    // 定位プレゼンス（敵の方向から聞こえる）
    this.audio.updateEntityAudio?.(
      this.entities.nearestPos, this.entities.nearestDist, this.entities.anyChasing);

    // ハム定位を最寄り点灯パネルへ
    if (lit && this.audio.ready) {
      this.audio.updateHumPosition(this.fluo.nearestLitPos);
    }

    // 描画
    this.post.render(dt, this.elapsed);
  }
}
