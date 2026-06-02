// =============================================================
//  AudioManager.js
//  THREE.AudioListener をカメラに付け、3要素を再生:
//   - 蛍光灯ハム音（最寄りの点灯パネルに定位 + 薄い環境ベッド）
//   - 低域ドローン（非定位ループ）
//   - 足音（移動でトリガ、湿った減衰）
//  実ファイル(AUDIO_PATHS)が読めればそれを使い、無ければ
//  WebAudio で手続き的にバッファを合成する（アセット不要で鳴る）。
// =============================================================

import * as THREE from 'three';
import { CONFIG, AUDIO_PATHS } from '../config.js';

export class AudioManager {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.ready = false;

    this.hum = null;
    this.humBed = null;
    this.drone = null;
    this.footPool = [];
    this.footIndex = 0;
    this.scene = null;
  }

  // ユーザー操作（クリック）後に呼ぶ：AudioContext を resume して構築
  async start() {
    if (this.ready) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.ready = true;

    const humBuf = await this._loadOr(AUDIO_PATHS.hum, () => this._synthHum(4.0));
    const droneBuf = await this._loadOr(AUDIO_PATHS.drone, () => this._synthDrone(6.0));
    const footBufs = await Promise.all(
      AUDIO_PATHS.footsteps.map((p, i) => this._loadOr(p, () => this._synthFootstep(i)))
    );

    // 定位ハム
    this.hum = new THREE.PositionalAudio(this.listener);
    this.hum.setBuffer(humBuf);
    this.hum.setLoop(true);
    this.hum.setRefDistance(3);
    this.hum.setMaxDistance(20);
    this.hum.setRolloffFactor(1.6);
    this.hum.setVolume(CONFIG.audio.humVolume);
    // ダミーの親に載せて位置を更新する
    this._humAnchor = new THREE.Object3D();
    this._humAnchor.add(this.hum);
    if (this.scene) this.scene.add(this._humAnchor);

    // 環境ハムベッド（非定位・極小音量で常在）
    this.humBed = new THREE.Audio(this.listener);
    this.humBed.setBuffer(humBuf);
    this.humBed.setLoop(true);
    this.humBed.setVolume(CONFIG.audio.humVolume * 0.35);

    // ドローン
    this.drone = new THREE.Audio(this.listener);
    this.drone.setBuffer(droneBuf);
    this.drone.setLoop(true);
    this.drone.setVolume(CONFIG.audio.droneVolume);

    // 足音プール
    for (let i = 0; i < 6; i++) {
      const a = new THREE.Audio(this.listener);
      a.setBuffer(footBufs[i % footBufs.length]);
      a.setVolume(CONFIG.audio.footVolume);
      this.footPool.push(a);
    }
    this._footBufs = footBufs;

    // --- 脅威の多層オーディオ（音量は updateThreatMix で動的制御） ---
    const mk = (buf, vol = 0) => {
      const a = new THREE.Audio(this.listener);
      a.setBuffer(buf); a.setLoop(true); a.setVolume(vol);
      return a;
    };
    this.dread = mk(this._synthGrowl(6.0));   // 低いうなり
    this.breath = mk(this._synthBreath(6.0)); // 息遣い
    this.heart = mk(this._synthHeartbeat(4.0)); // 心音
    this.stalk = mk(this._synthStalkSteps(4.0)); // 追跡の足音
    this.whisper = mk(this._synthWhisper(7.0)); // 低SANの囁き

    // 接触スティング（一発）
    this.stingBuf = this._synthSting();
    this.sting = new THREE.Audio(this.listener);
    this.sting.setBuffer(this.stingBuf);
    this.sting.setVolume(0.7);

    // ジャンプスケアの悲鳴（一発）
    this.screamBuf = this._synthScream();
    this.scream = new THREE.Audio(this.listener);
    this.scream.setBuffer(this.screamBuf);
    this.scream.setVolume(0.85);

    this.hum.play();
    this.humBed.play();
    this.drone.play();
    this.dread.play();
    this.breath.play();
    this.heart.play();
    this.stalk.play();
    this.whisper.play();

    // 定位プレゼンス：敵の位置から「方向付き」で聞こえる息遣い＋うなり
    this._entAnchor = new THREE.Object3D();
    this.presence = new THREE.PositionalAudio(this.listener);
    this.presence.setBuffer(this._synthBreath(6.0));
    this.presence.setLoop(true);
    this.presence.setRefDistance(3);
    this.presence.setMaxDistance(26);
    this.presence.setRolloffFactor(1.5);
    this.presence.setVolume(0);
    this._entAnchor.add(this.presence);
    if (this.scene) this.scene.add(this._entAnchor);
    this.presence.play();
  }

  // 敵の定位音を最近接位置へ追従（背後/横で聞こえる）
  updateEntityAudio(pos, dist, chasing) {
    if (!this.ready || !this._entAnchor || !pos) return;
    this._entAnchor.position.copy(pos);
    const finite = Number.isFinite(dist);
    // 距離減衰は PositionalAudio が行うので、ここでは存在/追跡で基準音量を切替
    const base = finite ? (chasing ? 0.7 : 0.4) : 0;
    this.presence.setVolume(this.presence.getVolume() + (base - this.presence.getVolume()) * 0.1);
  }

  // 敵の脅威を多層でミックス。dist=最近接距離, chasing=追跡中, san=0..100
  updateThreatMix(dist, chasing, san) {
    if (!this.ready) return;
    const p = Number.isFinite(dist) ? Math.max(0, 1 - dist / 14) : 0; // 接近度
    const low = 1 - Math.max(0, Math.min(100, san)) / 100;            // 不安度
    const lerp = (a, t) => { a.setVolume(a.getVolume() + (t - a.getVolume()) * 0.1); };

    lerp(this.dread, p * 0.45 + low * 0.12);
    lerp(this.breath, (chasing ? p * 0.5 : p * 0.18));
    lerp(this.stalk, chasing ? Math.max(0, 1 - dist / 11) * 0.5 : 0);
    // 心音：不安度＋接近で強く・速く
    const beat = Math.max(low * 0.55, chasing ? p * 0.5 : 0);
    lerp(this.heart, beat);
    this.heart.setPlaybackRate(1 + Math.min(0.8, beat) * 0.7);
    // 囁き：SANが低い(40%以下)ほど聞こえる
    lerp(this.whisper, Math.max(0, low - 0.6) / 0.4 * 0.32);
  }

  setDread(v) { /* 後方互換（未使用） */ }

  // 接触時の一撃
  playEntitySting() {
    if (!this.sting) return;
    if (this.sting.isPlaying) this.sting.stop();
    this.sting.play();
  }

  // ジャンプスケアの悲鳴＋スティング
  playJumpscare() {
    if (this.scream) { if (this.scream.isPlaying) this.scream.stop(); this.scream.play(); }
    this.playEntitySting();
  }

  // hum の定位を最寄り点灯パネルへ
  updateHumPosition(pos) {
    if (this._humAnchor) this._humAnchor.position.copy(pos);
  }

  attachTo(scene) {
    this.scene = scene;
    if (this._humAnchor) scene.add(this._humAnchor);
    if (this._entAnchor) scene.add(this._entAnchor);
  }

  playFootstep() {
    if (!this.ready) return;
    const a = this.footPool[this.footIndex % this.footPool.length];
    this.footIndex++;
    // バッファを差し替えてバリエーション
    a.setBuffer(this._footBufs[Math.floor(Math.random() * this._footBufs.length)]);
    a.setPlaybackRate(0.92 + Math.random() * 0.16);
    if (a.isPlaying) a.stop();
    a.play();
  }

  // ---- ファイル読込、失敗時 synth ----
  _loadOr(url, synth) {
    return new Promise((resolve) => {
      const loader = new THREE.AudioLoader();
      loader.load(url, (buf) => resolve(buf), undefined, () => resolve(synth()));
    });
  }

  // ---- 手続き合成 ----
  _buffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    return this.ctx.createBuffer(1, len, this.ctx.sampleRate);
  }

  // 蛍光灯ハム: 商用電源 100/120Hz とその高調波 + ジー音ノイズ
  _synthHum(sec) {
    const buf = this._buffer(sec);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    const fundamentals = [120, 240, 360, 60];
    const amps = [0.5, 0.22, 0.12, 0.15];
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let s = 0;
      for (let k = 0; k < fundamentals.length; k++) {
        s += amps[k] * Math.sin(2 * Math.PI * fundamentals[k] * t);
      }
      // 高周波のジー（バンドノイズ近似）
      s += (Math.random() - 0.5) * 0.08 * Math.sin(2 * Math.PI * 8000 * t);
      d[i] = s * 0.25;
    }
    return buf;
  }

  // 低域ドローン: 超低周波のうねり + 薄いノイズ
  _synthDrone(sec) {
    const buf = this._buffer(sec);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const tone = 0.6 * Math.sin(2 * Math.PI * 48 * t)
        + 0.3 * Math.sin(2 * Math.PI * 55 * t + Math.sin(t * 0.5));
      const n = (Math.random() - 0.5);
      lp += (n - lp) * 0.02; // ローパスノイズ
      d[i] = (tone * (0.5 + 0.5 * Math.sin(t * 0.3)) + lp * 0.4) * 0.18;
    }
    return buf;
  }

  // 敵のうなり: 低い不協和音 + うねるノイズ + 不規則なスウェル
  _synthGrowl(sec) {
    const buf = this._buffer(sec);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    let lp = 0, lp2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const wob = 1 + 0.05 * Math.sin(t * 4.7) + 0.02 * Math.sin(t * 11);
      const swell = 0.5 + 0.5 * Math.sin(t * 0.37 - 1.2); // 遅いうねり
      const tone = 0.5 * Math.sin(2 * Math.PI * 41 * t * wob)
        + 0.32 * Math.sin(2 * Math.PI * 58 * t)      // 不協和
        + 0.18 * Math.sin(2 * Math.PI * 87 * t + Math.sin(t * 2.3));
      const n = (Math.random() - 0.5);
      lp += (n - lp) * 0.05;
      lp2 += (lp - lp2) * 0.5;                        // ざらつき
      d[i] = (tone * (0.4 + 0.6 * swell) + lp2 * 0.55) * 0.22;
    }
    return buf;
  }

  // 息遣い: 約4秒周期の吸う/吐く（帯域ノイズの振幅変調）
  _synthBreath(sec) {
    const buf = this._buffer(sec);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    let lp = 0;
    const period = 4.2;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const ph = (t % period) / period;            // 0..1
      // 吸気(前半・高域寄り) → 吐気(後半・低域寄り)
      const inhale = Math.exp(-Math.pow((ph - 0.2) / 0.12, 2));
      const exhale = Math.exp(-Math.pow((ph - 0.62) / 0.16, 2));
      const env = inhale * 0.8 + exhale;
      const n = (Math.random() - 0.5);
      lp += (n - lp) * (0.12 + 0.08 * inhale);       // 吸気で高域多め
      d[i] = (lp * 1.6) * env * 0.5;
    }
    return buf;
  }

  // 心音: lub-dub を約0.95秒周期で
  _synthHeartbeat(sec) {
    const buf = this._buffer(sec);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    const period = 0.95;
    const thump = (tt, f0) => {
      const env = Math.exp(-tt * 26);
      const f = f0 * (0.6 + 0.4 * Math.exp(-tt * 30));
      return Math.sin(2 * Math.PI * f * tt) * env;
    };
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const ph = t % period;
      let s = 0;
      if (ph < 0.2) s += thump(ph, 60);              // lub
      const ph2 = ph - 0.28;
      if (ph2 > 0 && ph2 < 0.2) s += 0.7 * thump(ph2, 52); // dub
      d[i] = s * 0.7;
    }
    return buf;
  }

  // 追跡の足音: 重い足音を約0.45秒間隔で
  _synthStalkSteps(sec) {
    const buf = this._buffer(sec);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    const period = 0.45;
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const ph = t % period;
      const env = Math.exp(-ph * 30);
      const n = (Math.random() - 0.5);
      lp += (n - lp) * 0.08;
      const thud = Math.sin(2 * Math.PI * 58 * ph) * Math.exp(-ph * 22);
      d[i] = (lp * 1.2 + thud * 0.6) * env * 0.7;
    }
    return buf;
  }

  // 囁き: 帯域を揺らすノイズに不規則な音節エンベロープ（声に近い不穏さ）
  _synthWhisper(sec) {
    const buf = this._buffer(sec);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    let bp = 0, bp2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      // 音節リズム（不規則）
      const syl = Math.max(0, Math.sin(t * 6.3) * Math.sin(t * 2.1 + 1) - 0.2);
      // フォルマント風に帯域を揺らす
      const cut = 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(t * 9));
      const n = (Math.random() - 0.5);
      bp += (n - bp) * cut;
      bp2 += (bp - bp2) * cut;
      const band = bp - bp2; // バンドパス近似
      d[i] = band * 6.0 * syl * 0.4;
    }
    return buf;
  }

  // 悲鳴: 上昇するフォルマント＋歪んだ倍音＋ノイズ（人外の叫び）
  _synthScream() {
    const buf = this._buffer(1.1);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t * 40) * Math.exp(-Math.max(0, t - 0.15) * 3.0);
      // 基音が不規則に上下（金切り声）
      const f = 320 + 180 * Math.sin(t * 13) + 220 * t + 40 * Math.sin(t * 47);
      let s = Math.sin(2 * Math.PI * f * t);
      s += 0.5 * Math.sin(2 * Math.PI * f * 2.01 * t);   // 不協和倍音
      s += 0.3 * Math.sin(2 * Math.PI * f * 2.97 * t);
      const n = (Math.random() - 0.5);
      lp += (n - lp) * 0.4;
      s += lp * 0.5;                                       // ざらつき
      // 軽いディストーション
      s = Math.tanh(s * 1.8);
      d[i] = s * env * 0.6;
    }
    return buf;
  }

  // 接触スティング: 逆スウェル → 衝撃 → 下降ノイズ（ジャンプスケア）
  _synthSting() {
    const buf = this._buffer(0.8);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    let lp = 0;
    const hit = 0.18; // 衝撃の位置
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let s = 0;
      // 立ち上がりの逆スウェル
      if (t < hit) {
        const r = t / hit;
        s += Math.sin(2 * Math.PI * (200 + 400 * r) * t) * r * 0.4;
      }
      // 衝撃以降の減衰
      const td = Math.max(0, t - hit);
      const env = Math.exp(-td * 7);
      const sweep = 520 * Math.exp(-td * 5) + 50;
      const tone = Math.sin(2 * Math.PI * sweep * td);
      const n = (Math.random() - 0.5);
      lp += (n - lp) * 0.3;
      s += (tone * 0.5 + lp * 0.9) * env;
      d[i] = s * 0.7;
    }
    return buf;
  }

  // 足音: 短い減衰ノイズ（湿った=高域減衰、こもった低音）
  _synthFootstep(variant) {
    const buf = this._buffer(0.22);
    const d = buf.getChannelData(0);
    const sr = this.ctx.sampleRate;
    let lp = 0;
    const cut = 0.06 + variant * 0.008;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 38);
      const n = (Math.random() - 0.5);
      lp += (n - lp) * cut; // ローパス（こもり）
      const thud = Math.sin(2 * Math.PI * (70 + variant * 6) * t) * Math.exp(-t * 26);
      d[i] = (lp * 1.4 + thud * 0.5) * env * 0.9;
    }
    return buf;
  }
}
