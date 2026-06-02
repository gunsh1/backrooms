// =============================================================
//  Player.js
//  PointerLockControls による一人称視点 + WASD 移動。
//  - 加速/減衰のある滑らかな移動
//  - 壁(薄box)・柱(box)への 円 vs AABB 衝突解決（軸ごとに押し出し）
//  - ヘッドボブと足音トリガ（移動距離ベース）
// =============================================================

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CONFIG } from '../config.js';
import { MazeGenerator } from '../world/MazeGenerator.js';
import { PROP_FOOTPRINTS } from '../world/Props.js';

const S = CONFIG.world.cellSize;
const T = CONFIG.world.wallThickness;
const P = CONFIG.world.pillarSize;

export class Player {
  constructor(camera, domElement, chunkManager) {
    this.camera = camera;
    this.chunks = chunkManager;
    this.domElement = domElement;
    this.controls = new PointerLockControls(camera, domElement);
    this.controls.connect(); // 明示的に初期化（リスナー登録）

    this.pos = new THREE.Vector3(S * 0.5, CONFIG.player.eyeHeight, S * 0.5);
    this.vel = new THREE.Vector3();
    this.keys = { f: false, b: false, l: false, r: false, run: false };

    this.bobT = 0;
    this.distAcc = 0;     // 足音用の累積移動距離
    this.onFootstep = null; // コールバック（AudioManager が設定）
    this.speedMul = 1;    // 低SANのパニック加速（Game が設定）

    this.shake = 0;       // カメラシェイク強度（減衰）
    this.shakeDecay = 6;  // 減衰速度
    this.frozen = 0;      // >0 の間は移動入力を無視（ジャンプスケアの一瞬停止）
    this._shakeOff = new THREE.Vector3();

    this._setupInput(domElement);
    camera.position.copy(this.pos);
  }

  get object() { return this.controls.object ?? this.camera; }

  _setupInput() {
    const set = (e, v) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.keys.f = v; break;
        case 'KeyS': case 'ArrowDown': this.keys.b = v; break;
        case 'KeyA': case 'ArrowLeft': this.keys.l = v; break;
        case 'KeyD': case 'ArrowRight': this.keys.r = v; break;
        case 'ShiftLeft': case 'ShiftRight': this.keys.run = v; break;
      }
    };
    window.addEventListener('keydown', (e) => set(e, true));
    window.addEventListener('keyup', (e) => set(e, false));
  }

  get isMoving() { return this.keys.f || this.keys.b || this.keys.l || this.keys.r; }
  get isRunning() { return this.keys.run && this.isMoving; }

  lock() {
    // disconnect 後は connect() が必要になることがある
    if (!this.controls.isLocked) {
      this.domElement.focus?.();
      this.controls.connect?.();
    }
    this.controls.lock();
  }
  unlock() { this.controls.disconnect?.(); }
  get isLocked() { return this.controls.isLocked; }

  // カメラシェイクを加える（接触/突進演出から）
  addShake(amount, freeze = 0) {
    this.shake = Math.max(this.shake, amount);
    if (freeze > 0) this.frozen = Math.max(this.frozen, freeze);
  }

  update(dt) {
    if (this.frozen > 0) this.frozen -= dt;
    const inputLocked = this.frozen > 0;

    // 入力 → 目標速度（カメラ向き基準）
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

    const wish = new THREE.Vector3();
    if (!inputLocked) {
      if (this.keys.f) wish.add(forward);
      if (this.keys.b) wish.sub(forward);
      if (this.keys.r) wish.add(right);
      if (this.keys.l) wish.sub(right);
    }
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();

    const speed = (this.keys.run ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed) * this.speedMul;
    const target = wish.multiplyScalar(speed);

    // 加速 / 減衰
    const a = moving ? CONFIG.player.accel : CONFIG.player.damping;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, a * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, a * dt);

    // 軸ごとに移動 → 衝突解決
    const r = CONFIG.player.radius;
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;

    nx = this._resolveAxis(nx, this.pos.z, r, true);
    nz = this._resolveAxis(nx, nz, r, false);

    // 実移動量で速度を補正（壁に当たったら止める）
    const movedX = nx - this.pos.x;
    const movedZ = nz - this.pos.z;
    this.pos.x = nx;
    this.pos.z = nz;

    // ヘッドボブ + 足音
    const horizSpeed = Math.hypot(movedX, movedZ) / Math.max(dt, 1e-4);
    let bobY = 0;
    if (horizSpeed > 0.4 && this.isLocked) {
      this.bobT += dt * CONFIG.player.bobFreq * (horizSpeed / CONFIG.player.walkSpeed);
      bobY = Math.sin(this.bobT) * CONFIG.player.bobAmp;
      this.distAcc += Math.hypot(movedX, movedZ);
      if (this.distAcc >= CONFIG.audio.footStride) {
        this.distAcc = 0;
        this.onFootstep?.();
      }
    } else {
      this.bobT = 0;
    }

    this.pos.y = CONFIG.player.eyeHeight + bobY;
    this.camera.position.copy(this.pos);

    // カメラシェイク（位置の微小ランダムオフセットのみ。回転は PointerLockControls
    // が管理するため触らない＝傾き残留を防ぐ）
    if (this.shake > 0.001) {
      const s = this.shake;
      this._shakeOff.set(
        (Math.random() - 0.5) * s * 0.5,
        (Math.random() - 0.5) * s * 0.5,
        (Math.random() - 0.5) * s * 0.5);
      this.camera.position.add(this._shakeOff);
      this.shake -= this.shake * Math.min(1, this.shakeDecay * dt);
    }
  }

  // 候補座標(testX,testZ)を、近傍の壁/柱AABBで円(半径r)押し出し補正。
  // axisX=true のとき X 方向の補正値を返す。false なら Z 方向。
  _resolveAxis(testX, testZ, r, axisX) {
    const aabbs = this._nearbyAABBs(testX, testZ);
    let cx = testX, cz = testZ;
    for (const b of aabbs) {
      // 最近接点
      const qx = Math.max(b.minX, Math.min(cx, b.maxX));
      const qz = Math.max(b.minZ, Math.min(cz, b.maxZ));
      const ddx = cx - qx, ddz = cz - qz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < r * r && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        if (axisX) cx += ddx * push; else cz += ddz * push;
      } else if (d2 <= 1e-9) {
        // 中心が AABB 内: 最短辺方向に押し出す
        if (axisX) {
          cx += (cx - (b.minX + b.maxX) / 2) > 0 ? (b.maxX - cx + r) : -(cx - b.minX + r);
        } else {
          cz += (cz - (b.minZ + b.maxZ) / 2) > 0 ? (b.maxZ - cz + r) : -(cz - b.minZ + r);
        }
      }
    }
    return axisX ? cx : cz;
  }

  // 周囲3x3セルの壁・柱AABBを集める
  _nearbyAABBs(x, z) {
    const list = [];
    const [pgx, pgy] = this.chunks.worldToCell(x, z);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = pgx + dx, gy = pgy + dy;
        const gen = this.chunks.generationForCell(gx, gy);
        const c = MazeGenerator.cell(gx, gy, gen);
        const wx = gx * S, wz = gy * S;
        if (c.eastWall) {
          list.push({ minX: wx + S - T / 2, maxX: wx + S + T / 2, minZ: wz, maxZ: wz + S });
        }
        if (c.northWall) {
          list.push({ minX: wx, maxX: wx + S, minZ: wz + S - T / 2, maxZ: wz + S + T / 2 });
        }
        if (c.pillar) {
          list.push({ minX: wx - P / 2, maxX: wx + P / 2, minZ: wz - P / 2, maxZ: wz + P / 2 });
        }
        if (c.prop) {
          const fp = PROP_FOOTPRINTS[c.prop.type];
          if (fp) {
            const swap = Math.abs(c.prop.yaw - Math.PI / 2) < 0.1;
            const hw = (swap ? fp[1] : fp[0]) / 2;
            const hd = (swap ? fp[0] : fp[1]) / 2;
            const ccx = wx + S / 2, ccz = wz + S / 2;
            list.push({ minX: ccx - hw, maxX: ccx + hw, minZ: ccz - hd, maxZ: ccz + hd });
          }
        }
      }
    }
    return list;
  }
}
