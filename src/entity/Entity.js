// =============================================================
//  Entity.js — 暗い人型の影（カメラを向くビルボード）。
//  状態機械: WANDER（徘徊）⇄ CHASE（追跡）。
//   - 索敵: 視線（壁越し不可）＋ 走り足音の聴取
//   - 追跡: 迷路セルを BFS 経路探索してプレイヤーへ
//   - 接触: contactDist 以内で this.contacted=true（管理側が処理）
// =============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { MazeGenerator } from '../world/MazeGenerator.js';

const S = CONFIG.world.cellSize;

export class Entity {
  // visual: { type:'model', instance } | { type:'sprite', material }
  constructor(scene, chunks, visual) {
    this.scene = scene;
    this.chunks = chunks;
    const e = CONFIG.entity;

    if (visual.type === 'model') {
      this.isModel = true;
      this.model = visual.instance;
      this.obj = this.model.obj;
      this.footOffset = this.model.footOffset || 0;
      this.baseScale = this.model.scale || 1;
    } else {
      this.isModel = false;
      this.obj = new THREE.Sprite(visual.material);
      this.obj.scale.set(e.width, e.height, 1);
      this.footOffset = e.height / 2; // スプライトは中心基準
    }
    scene.add(this.obj);

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.state = 'WANDER';
    this.targetWorld = new THREE.Vector3();
    this.hasTarget = false;

    this.path = null;
    this.pathIndex = 1;
    this.repathTimer = 0;
    this.lostTimer = 0;

    this.distToPlayer = Infinity;
    this.contacted = false;
    this.threat = 1; // 低SANで管理側が上げる速度倍率
    this.lunging = false;
    this._wasLunging = false;
    this.calmTimer = 0;   // 見失って遠ざかった経過
    this.expired = false; // しばらく逃げると消滅フラグ
    this.loom = 1;        // 突進/接触で膨らむ倍率（lerp）
  }

  // 最初から追跡状態で始める（アンビッシュ出現）
  startChase() {
    this.state = 'CHASE';
    this.path = null;
    this.lostTimer = 0;
  }

  place(x, z) {
    this.pos.set(x, 0, z);
    this.obj.position.set(x, this.footOffset, z);
    this.hasTarget = false;
    this.path = null;
  }

  _syncObject(dt) {
    // 突進/接触で膨らむ（looming）。lerp で滑らかに。
    const targetLoom = this.lunging ? CONFIG.entity.loomScale : 1;
    this.loom += (targetLoom - this.loom) * Math.min(1, dt * 6);

    const yoff = this.footOffset * (this.isModel ? this.loom : 1);
    this.obj.position.set(this.pos.x, yoff, this.pos.z);
    if (this.isModel) {
      this.obj.rotation.y = this.yaw + CONFIG.entity.modelYawOffset;
      this.obj.scale.setScalar(this.baseScale * this.loom);
      const scale = this.state === 'CHASE' ? CONFIG.entity.chaseAnimScale : 1;
      const a = this.model.actions.primary;
      if (a) a.timeScale = scale;
      this.model.mixer.update(dt);
    }
  }

  _face(dx, dz) {
    if (Math.hypot(dx, dz) < 1e-4) return;
    this.yaw = Math.atan2(dx, dz);
  }

  get cell() { return [Math.floor(this.pos.x / S), Math.floor(this.pos.z / S)]; }
  _gen(gx, gy) { return this.chunks.generationForCell(gx, gy); }
  _cellCenter(gx, gy) { return [(gx + 0.5) * S, (gy + 0.5) * S]; }

  _neighbors(gx, gy) {
    const list = [];
    if (!MazeGenerator.cell(gx, gy, this._gen(gx, gy)).eastWall) list.push([gx + 1, gy]);
    if (!MazeGenerator.cell(gx - 1, gy, this._gen(gx - 1, gy)).eastWall) list.push([gx - 1, gy]);
    if (!MazeGenerator.cell(gx, gy, this._gen(gx, gy)).northWall) list.push([gx, gy + 1]);
    if (!MazeGenerator.cell(gx, gy - 1, this._gen(gx, gy - 1)).northWall) list.push([gx, gy - 1]);
    return list;
  }

  // 2セル間（4近傍）に壁があるか
  _wallBetween(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 1) return MazeGenerator.cell(a[0], a[1], this._gen(a[0], a[1])).eastWall;
    if (dx === -1) return MazeGenerator.cell(b[0], b[1], this._gen(b[0], b[1])).eastWall;
    if (dy === 1) return MazeGenerator.cell(a[0], a[1], this._gen(a[0], a[1])).northWall;
    if (dy === -1) return MazeGenerator.cell(b[0], b[1], this._gen(b[0], b[1])).northWall;
    return true;
  }

  // 視線（壁越し不可）。セルを辿って壁をチェック。
  _hasLOS(player) {
    const ex = this.pos.x, ez = this.pos.z;
    const px = player.pos.x, pz = player.pos.z;
    const dist = Math.hypot(px - ex, pz - ez);
    const steps = Math.max(2, Math.ceil(dist / (S * 0.3)));
    let prev = [Math.floor(ex / S), Math.floor(ez / S)];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.floor((ex + (px - ex) * t) / S);
      const cz = Math.floor((ez + (pz - ez) * t) / S);
      if (cx === prev[0] && cz === prev[1]) continue;
      // 斜め移動は両方向の壁を確認
      const stepX = [cx, prev[1]];
      if (cx !== prev[0] && this._wallBetween(prev, stepX)) return false;
      const stepY = [cx, cz];
      if (cz !== prev[1] && this._wallBetween([cx, prev[1]], stepY)) return false;
      prev = [cx, cz];
    }
    return true;
  }

  // BFS 経路探索（startセル→goalセル）。経路セル配列を返す（先頭=start）。
  _findPath(from, to) {
    const key = (x, y) => x + ',' + y;
    const goalK = key(to[0], to[1]);
    if (key(from[0], from[1]) === goalK) return [from];
    const came = new Map();
    came.set(key(from[0], from[1]), null);
    const q = [from];
    let head = 0;
    while (head < q.length && head < 1200) {
      const cur = q[head++];
      if (key(cur[0], cur[1]) === goalK) break;
      for (const nb of this._neighbors(cur[0], cur[1])) {
        const nk = key(nb[0], nb[1]);
        if (came.has(nk)) continue;
        if (Math.abs(nb[0] - from[0]) + Math.abs(nb[1] - from[1]) > 30) continue;
        came.set(nk, cur);
        q.push(nb);
      }
    }
    if (!came.has(goalK)) return null;
    const path = [];
    let cur = to;
    while (cur) { path.unshift(cur); cur = came.get(key(cur[0], cur[1])); }
    return path;
  }

  update(dt, player) {
    this.distToPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.lunging = false;
    const e = CONFIG.entity;

    const seen = this.distToPlayer < e.sightRange && this._hasLOS(player);
    const heard = player.isRunning && this.distToPlayer < e.hearRange;
    const detect = seen || heard;

    if (this.state === 'WANDER') {
      if (detect) { this.state = 'CHASE'; this.path = null; this.lostTimer = 0; }
      else this._wander(dt);
    }

    if (this.state === 'CHASE') {
      if (detect) this.lostTimer = 0;
      else {
        this.lostTimer += dt;
        if (this.lostTimer > e.loseTime) { this.state = 'WANDER'; this.hasTarget = false; }
      }
      if (this.state === 'CHASE') {
        this._chase(dt, player);
        // 追跡中はプレイヤーの方を向く
        this._face(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        if (this.distToPlayer < e.contactDist) this.contacted = true;
      }
    }

    // 見失って遠ざかった状態が続くと消滅（逃げ切ると気配が消える）
    if (this.state === 'WANDER' && this.distToPlayer > e.proximityRange) {
      this.calmTimer += dt;
    } else {
      this.calmTimer = 0;
    }
    this.expired = this.calmTimer > e.fleeDespawnTime;

    this._syncObject(dt);
  }

  _wander(dt) {
    if (!this.hasTarget) {
      const [gx, gy] = this.cell;
      const ns = this._neighbors(gx, gy);
      if (!ns.length) return;
      const [nx, ny] = ns[Math.floor(Math.random() * ns.length)];
      const [cx, cz] = this._cellCenter(nx, ny);
      this.targetWorld.set(cx, this.pos.y, cz);
      this.hasTarget = true;
    }
    this._moveToward(this.targetWorld.x, this.targetWorld.z, CONFIG.entity.wanderSpeed, dt);
    if (this._planarDist(this.targetWorld.x, this.targetWorld.z) < 0.15) this.hasTarget = false;
  }

  _chase(dt, player) {
    const e = CONFIG.entity;
    // 近距離＋視線ありで突進バースト
    this.lunging = this.distToPlayer < e.lungeDist && this._hasLOS(player);
    const spd = (this.lunging ? e.lungeSpeed : e.chaseSpeed) * this.threat;
    // 近ければ直接プレイヤーへ
    if (this.distToPlayer < S * 1.2) {
      this._moveToward(player.pos.x, player.pos.z, spd, dt);
      return;
    }
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || !this.path) {
      this.repathTimer = e.repathInterval;
      const pc = [Math.floor(player.pos.x / S), Math.floor(player.pos.z / S)];
      this.path = this._findPath(this.cell, pc);
      this.pathIndex = 1;
    }
    if (this.path && this.pathIndex < this.path.length) {
      const [tx, tz] = this._cellCenter(this.path[this.pathIndex][0], this.path[this.pathIndex][1]);
      this._moveToward(tx, tz, spd, dt);
      if (this._planarDist(tx, tz) < 0.25) this.pathIndex++;
    } else {
      // 経路が無ければ直進
      this._moveToward(player.pos.x, player.pos.z, spd, dt);
    }
  }

  _moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    if (this.state !== 'CHASE') this._face(dx, dz); // 徘徊時は進行方向
  }

  _planarDist(x, z) { return Math.hypot(x - this.pos.x, z - this.pos.z); }

  dispose() {
    if (this.isModel) this.model.mixer.stopAllAction();
    this.scene.remove(this.obj);
  }
}
