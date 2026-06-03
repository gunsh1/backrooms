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
import { MazeGenerator } from '../world/MazeGenerator.js';
import { PIT, isOverHole, snapToBeam } from '../world/PitRoom.js';

const FALL_DUR = 0.8; // 落下演出の長さ(s)

export class Game {
  constructor(container) {
    this.r = new Renderer(container);
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this._fwd = new THREE.Vector3();
    this.falling = 0;       // 落下演出タイマー
    this._jsDone = false;   // 落下中ジャンプスケア済み
    this.fallGrace = 0;     // リスポーン直後の落下無効時間
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
    // クリア画面（ドアでEを押す）
    this.comingsoonEl = document.getElementById('comingsoon');
    this.cleared = false;

    // Eキー：ドアで脱出
    this.doorPromptEl = document.getElementById('door-prompt');
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') this._tryDoor();
    });
    // クリア後はゲームに戻らない（クリックは伝播だけ止める）
    this.comingsoonEl?.addEventListener('click', (e) => e.stopPropagation());
    // RESTART：最初からやり直し（ページ再読込）
    document.getElementById('cs-restart')?.addEventListener('click', (e) => {
      e.stopPropagation();
      location.reload();
    });
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

  // 現在地が落とし穴の部屋か
  _inPitChunk() {
    const [gx, gy] = this.chunks.worldToCell(this.player.pos.x, this.player.pos.z);
    return MazeGenerator.isPitChunk(gx, gy, this.chunks.generationForCell(gx, gy));
  }

  // 落下の開始・進行・完了
  _updateFall(dt) {
    if (this.fallGrace > 0) this.fallGrace -= dt;

    // 落下中：カメラを穴へ落とし、中盤でジャンプスケア、終了でリスポーン
    if (this.falling > 0) {
      this.falling -= dt;
      const t = 1 - this.falling / FALL_DUR;
      this.r.camera.position.y = CONFIG.player.eyeHeight - t * (PIT.depth + 3);
      if (!this._jsDone && this.falling < FALL_DUR * 0.45) {
        this._triggerJumpscare();
        this._jsDone = true;
      }
      if (this.falling <= 0) this._respawn();
      return;
    }

    // 落下トリガ：落とし穴部屋で穴の上に出たら
    if (this.fallGrace <= 0 && this._inPitChunk()
        && isOverHole(this.player.pos.x, this.player.pos.z)) {
      this.falling = FALL_DUR;
      this._jsDone = false;
      this.player.frozen = FALL_DUR + 0.4;
      this.player.vel.set(0, 0, 0);
    }
  }

  // 別の場所で目覚める
  _respawn() {
    this.falling = 0;
    this.player.frozen = 0;
    this.entities.san = Math.max(0, this.entities.san - 25);
    // 遠くへ飛ばし、梁の交点へスナップして足場に着地
    const ang = Math.random() * Math.PI * 2;
    const d = 220 + Math.random() * 120;
    let nx = this.player.pos.x + Math.cos(ang) * d;
    let nz = this.player.pos.z + Math.sin(ang) * d;
    [nx, nz] = snapToBeam(nx, nz);
    this.player.pos.set(nx, CONFIG.player.eyeHeight, nz);
    this.player.vel.set(0, 0, 0);
    this.r.camera.position.copy(this.player.pos);
    this.chunks.update(nx, nz);
    this.fallGrace = 1.5; // 直後の再落下を防ぐ
  }

  // ドア接近時に脱出プロンプトを表示
  _updateDoorPrompt() {
    if (!this.doorPromptEl) return;
    let near = false;
    if (!this.cleared && document.pointerLockElement) {
      const doors = this.chunks.activeDoors;
      const p = this.player.pos;
      if (doors) for (const dr of doors) {
        if (Math.hypot(dr.x - p.x, dr.z - p.z) < 3.2) { near = true; break; }
      }
    }
    this.doorPromptEl.classList.toggle('on', near);
  }

  // ドアの近くでEを押すとクリア（COMING SOON）
  _tryDoor() {
    if (!document.pointerLockElement || this.cleared) return;
    const doors = this.chunks.activeDoors;
    if (!doors || !doors.length) return;
    const p = this.player.pos;
    for (const dr of doors) {
      if (Math.hypot(dr.x - p.x, dr.z - p.z) < 3) {
        this.cleared = true;
        this.comingsoonEl?.classList.add('on');
        document.exitPointerLock?.();
        return;
      }
    }
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

    // 落とし穴：落下検出→演出→別場所でリスポーン
    this._updateFall(dt);
    // ドア接近時の脱出プロンプト
    this._updateDoorPrompt();

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
