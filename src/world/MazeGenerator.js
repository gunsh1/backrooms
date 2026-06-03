// =============================================================
//  MazeGenerator.js
//  グローバルセル座標 (gx, gy) と、そのセルが属するチャンクの
//  「世代(generation)」から、セル単位の構造を決定論的に返す。
//
//  所有ルール（二重描画防止）:
//   - 各セルは「東の壁」「北の壁」「南西角の柱」を所有する。
//   - 天井ライトはセル中央に1つ。
//  これにより各壁/柱はちょうど1セルにのみ属し、隣接チャンクが
//  別世代に再生成されても重複や欠落が起きない（=構造変化）。
// =============================================================

import { CONFIG } from '../config.js';
import { hash2, mulberry32 } from '../util/rng.js';

const baseSeed = CONFIG.world.seed;
const N = CONFIG.world.chunkCells;

// セル+世代から専用RNG（用途別オフセットで独立系列）
function cellRng(gx, gy, generation, salt) {
  const s = hash2(hash2(gx, gy, baseSeed), generation * 0x9e3779b1 + salt, 0xABCD);
  return mulberry32(s);
}

// チャンク単位の「開放度」: たまにホール（壁/柱が疎）になる。
// 0=通常 / 1=広いホール。セルが属するチャンク座標と世代で決まる。
function chunkOpenness(gx, gy, generation) {
  const cx = Math.floor(gx / N);
  const cy = Math.floor(gy / N);
  const r = mulberry32(hash2(hash2(cx, cy, baseSeed ^ 0x5151), generation, 0x7777))();
  return r < CONFIG.maze.openHallChance ? 1 : 0;
}

// チャンク単位の「巨大ホール」判定（超まれ）。何もない・天井が非常に高い。
function chunkVast(gx, gy, generation) {
  const cx = Math.floor(gx / N);
  const cy = Math.floor(gy / N);
  const r = mulberry32(hash2(hash2(cx, cy, baseSeed ^ 0x2772), generation, 0x3333))();
  return r < CONFIG.maze.vastHallChance;
}

// チャンク単位の「落とし穴の部屋」判定。床が穴の格子。
function chunkPit(gx, gy, generation) {
  const cx = Math.floor(gx / N);
  const cy = Math.floor(gy / N);
  const r = mulberry32(hash2(hash2(cx, cy, baseSeed ^ 0x1A2B), generation, 0x55AA))();
  return r < CONFIG.maze.pitRoomChance;
}

export const MazeGenerator = {
  // セルの構造データ
  cell(gx, gy, generation = 0) {
    const m = CONFIG.maze;

    // 落とし穴の部屋：壁/柱/障害物なし。床は穴格子（RoomBuilderが構築）。
    if (chunkPit(gx, gy, generation)) {
      let light = 'none';
      const lr = cellRng(gx, gy, generation, 53);
      if (lr() < m.lightChance) light = lr() < m.deadLightChance ? 'dead' : 'panel';
      return {
        eastWall: false, northWall: false, pillar: false,
        light, graffiti: null, prop: null, pit: true,
      };
    }

    // 巨大ホール：壁/柱/障害物/落書きを一切持たない「何もない」空間
    if (chunkVast(gx, gy, generation)) {
      let light = 'none';
      if (cellRng(gx, gy, generation, 53)() < m.vastLightChance) light = 'panel';
      return {
        eastWall: false, northWall: false, pillar: false,
        light, graffiti: null, prop: null, vast: true,
      };
    }

    // 開放ホールのチャンクでは壁/柱を疎にして広い空間に
    const open = chunkOpenness(gx, gy, generation);
    const wallD = open ? m.openWallDensity : m.wallDensity;
    const pillarC = open ? m.openPillarChance : m.pillarChance;

    const eastWall = cellRng(gx, gy, generation, 11)() < wallD;
    const northWall = cellRng(gx, gy, generation, 23)() < wallD;
    const pillar = cellRng(gx, gy, generation, 37)() < pillarC;

    // 天井ライト種別
    let light = 'none';
    const lr = cellRng(gx, gy, generation, 53);
    if (lr() < m.lightChance) {
      light = lr() < m.deadLightChance ? 'dead' : 'panel';
    }

    // 落書き（まれ。壁があるときのみ描画される）
    let graffiti = null;
    const gr = cellRng(gx, gy, generation, 71);
    if (gr() < m.graffitiChance) {
      graffiti = { index: Math.floor(gr() * 1000), on: gr() < 0.5 ? 'east' : 'north' };
    }

    // 障害物（開放ホールのみ・たまに）。yawは0/90°でAABBを軸並行に保つ。
    let prop = null;
    if (open) {
      const pr = cellRng(gx, gy, generation, 89);
      if (pr() < m.propChance) {
        const types = ['car', 'crates', 'debris'];
        prop = {
          type: types[Math.floor(pr() * types.length)],
          yaw: pr() < 0.5 ? 0 : Math.PI / 2,
        };
      }
    }

    return { eastWall, northWall, pillar, light, graffiti, prop };
  },

  // 衝突判定用: 指定セルが東/北に壁を持つか（generationLookupは関数）
  hasEastWall(gx, gy, gen) { return MazeGenerator.cell(gx, gy, gen).eastWall; },
  hasNorthWall(gx, gy, gen) { return MazeGenerator.cell(gx, gy, gen).northWall; },
  hasPillar(gx, gy, gen) { return MazeGenerator.cell(gx, gy, gen).pillar; },

  // チャンクが巨大ホールか（RoomBuilder が天井高・周壁の判断に使う）
  isVastChunk(gx, gy, gen) { return chunkVast(gx, gy, gen); },
  // チャンクが落とし穴の部屋か
  isPitChunk(gx, gy, gen) { return chunkPit(gx, gy, gen); },
};
