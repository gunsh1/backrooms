// =============================================================
//  ChunkManager.js
//  プレイヤー周囲のチャンクを動的に load/unload。
//  視界外で一度アンロードされたチャンクは、再入場時に
//  generation を進めて RoomBuilder に渡す → 構造が変わる
//  （= 「引き返すと周囲が変化する」リミナル異常）。
//  衝突判定用にセル→世代の参照も提供する。
// =============================================================

import { CONFIG } from '../config.js';
import { RoomBuilder } from './RoomBuilder.js';

const N = CONFIG.world.chunkCells;
const S = CONFIG.world.cellSize;

const keyOf = (cx, cy) => `${cx},${cy}`;

export class ChunkManager {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.loaded = new Map();      // key -> { group, cx, cy, gen }
    this.generation = new Map();  // key -> 現在の世代
    this.seen = new Set();        // 一度でも読まれたチャンク
    this.activePanels = [];       // 全ロード中チャンクの光パネル world 位置
    this.activeDoors = [];        // 全ロード中チャンクの出口ドア world 位置
    this._lastChunk = null;
  }

  // 世界座標 → チャンク座標
  worldToChunk(x, z) {
    return [Math.floor(x / (N * S)), Math.floor(z / (N * S))];
  }

  // セル座標 → 所属チャンクの世代（衝突判定用）
  generationForCell(gx, gy) {
    const cx = Math.floor(gx / N);
    const cy = Math.floor(gy / N);
    return this.generation.get(keyOf(cx, cy)) ?? 0;
  }

  // 世界座標 → セル座標
  worldToCell(x, z) {
    return [Math.floor(x / S), Math.floor(z / S)];
  }

  update(playerX, playerZ) {
    const [pcx, pcy] = this.worldToChunk(playerX, playerZ);
    const ck = keyOf(pcx, pcy);
    if (ck === this._lastChunk) return false; // 同じチャンク内なら何もしない
    this._lastChunk = ck;

    const r = CONFIG.world.viewChunks;
    const want = new Set();
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        want.add(keyOf(pcx + dx, pcy + dy));
      }
    }

    // アンロード（範囲外）
    for (const [key, chunk] of this.loaded) {
      if (!want.has(key)) {
        this.scene.remove(chunk.group);
        this._disposeGroup(chunk.group);
        this.loaded.delete(key);
      }
    }

    // ロード（不足分）
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = pcx + dx, cy = pcy + dy;
        const key = keyOf(cx, cy);
        if (this.loaded.has(key)) continue;
        this._loadChunk(cx, cy, key);
      }
    }

    this._rebuildPanelList();
    return true; // チャンク構成が変化した
  }

  _loadChunk(cx, cy, key) {
    // 世代決定: 初見は0。再訪なら異常設定に応じて+1（構造変化）。
    let gen = this.generation.get(key) ?? 0;
    if (this.seen.has(key) && CONFIG.anomaly.reshuffleEnabled) {
      gen += 1;
    }
    this.generation.set(key, gen);
    this.seen.add(key);

    const cx0 = cx * N;
    const cy0 = cy * N;
    const group = RoomBuilder.build(
      cx0, cy0, gen, this.materials, (gx, gy) => this.generationForCell(gx, gy));
    this.scene.add(group);
    this.loaded.set(key, { group, cx, cy, gen });
  }

  _rebuildPanelList() {
    this.activePanels.length = 0;
    this.activeDoors.length = 0;
    for (const chunk of this.loaded.values()) {
      const panels = chunk.group.userData.panels;
      if (panels) {
        for (const p of panels) if (!p.dead) this.activePanels.push(p);
      }
      const doors = chunk.group.userData.doors;
      if (doors) for (const d of doors) this.activeDoors.push(d);
    }
  }

  _disposeGroup(group) {
    group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        o.geometry?.dispose();
        // マテリアルは共有なので dispose しない
      }
    });
  }
}
