// =============================================================
//  AnomalyController.js
//  ロアに沿った計測異常と環境イベントを担う。
//   - フェイク・コンパス: 不規則にジャンプ/逆回転
//   - フェイク・GPS座標: 地球上をテレポートするように乱変動
//   - 無線信号: 短距離でのみ立ち、すぐ落ちる
//   - 暗転イベント: ランダム間隔で照明が一瞬落ちる
//  ※ チャンク再生成（往復で構造変化）は ChunkManager 側で実装。
// =============================================================

import { CONFIG } from '../config.js';

export class AnomalyController {
  constructor(fluorescent) {
    this.fluo = fluorescent;
    this.t = 0;

    // HUD 要素
    this.elCompass = document.getElementById('hud-compass');
    this.elCoords = document.getElementById('hud-coords');
    this.elSignal = document.getElementById('hud-signal');

    // 内部状態
    this.compass = 0;
    this.compassDrift = 0;
    this.lat = 35.6895; this.lon = 139.6917;
    this.nextCompassJump = 2;
    this.nextCoordJump = 1.5;
    this.signal = 2;

    // 暗転
    this.blackoutTimer = this._randRange(
      CONFIG.anomaly.blackoutMinInterval, CONFIG.anomaly.blackoutMaxInterval);
    this.blackoutActive = 0; // 残り秒
  }

  _randRange(a, b) { return a + Math.random() * (b - a); }

  update(dt, headingRad) {
    this.t += dt;

    // --- コンパス ---
    if (CONFIG.anomaly.compassJitter) {
      this.nextCompassJump -= dt;
      if (this.nextCompassJump <= 0) {
        // 不規則ジャンプ：時々大きく飛ぶ / 逆回転
        this.compassDrift = (Math.random() - 0.5) * 480;
        this.nextCompassJump = this._randRange(0.6, 3.5);
      }
      // 実際の向きにノイズドリフトを上乗せ
      const base = (-headingRad * 180 / Math.PI + 360) % 360;
      this.compass += (base + this.compassDrift - this.compass) * Math.min(1, dt * 2.5);
      const deg = ((this.compass % 360) + 360) % 360;
      if (this.elCompass) {
        this.elCompass.textContent = `${deg.toFixed(0).padStart(3, '0')}° ${this._cardinal(deg)}`;
      }
    }

    // --- GPS 座標（テレポートする） ---
    this.nextCoordJump -= dt;
    if (this.nextCoordJump <= 0) {
      this.lat = (Math.random() * 180 - 90);
      this.lon = (Math.random() * 360 - 180);
      this.nextCoordJump = this._randRange(0.8, 4.0);
    } else {
      // 微小ドリフト
      this.lat += (Math.random() - 0.5) * dt * 4;
      this.lon += (Math.random() - 0.5) * dt * 4;
    }
    if (this.elCoords) {
      this.elCoords.textContent = `${this.lat.toFixed(6)}, ${this.lon.toFixed(6)}`;
    }

    // --- 信号（不安定） ---
    if (Math.random() < dt * 1.5) this.signal = Math.floor(Math.random() * 4);
    if (this.elSignal) {
      const bars = '▮'.repeat(this.signal) + '▯'.repeat(4 - this.signal);
      this.elSignal.textContent = this.signal <= 1 ? bars + ' NO LINK' : bars;
      this.elSignal.className = this.signal <= 1 ? 'bad' : '';
    }

    // --- 暗転イベント ---
    if (this.blackoutActive > 0) {
      this.blackoutActive -= dt;
      // ちらつきながら暗くする
      const f = this.blackoutActive > 0
        ? (0.12 + 0.2 * Math.abs(Math.sin(this.t * 30)))
        : 1.0;
      this.fluo.setBlackout(Math.min(1, f));
      if (this.blackoutActive <= 0) {
        this.blackoutTimer = this._randRange(
          CONFIG.anomaly.blackoutMinInterval, CONFIG.anomaly.blackoutMaxInterval);
      }
    } else {
      this.blackoutTimer -= dt;
      if (this.blackoutTimer <= 0) {
        this.blackoutActive = this._randRange(0.8, 2.4);
      }
    }
  }

  _cardinal(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }
}
