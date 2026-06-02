// =============================================================
//  rng.js — 決定論的なシード付き擬似乱数
//  同じ (seed) からは常に同じ系列。チャンク座標からシードを
//  合成することで「無限だが再現可能」なワールドを得る。
//  異常ギミックではシードに摂動を加えて構造を変える。
// =============================================================

// mulberry32: 高速・高品質な 32bit PRNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2つの整数（チャンク座標など）と基準シードを 1つの 32bit に混ぜる
export function hash2(x, y, seed = 0) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// 指定チャンク座標 + 摂動(generation) からRNGを作る
export function chunkRng(cx, cy, baseSeed, generation = 0) {
  const s = hash2(cx, cy, hash2(baseSeed, generation * 0x9e3779b1, 0));
  return mulberry32(s);
}

// rng から範囲・選択ヘルパ
export const rngRange = (rng, min, max) => min + rng() * (max - min);
export const rngInt = (rng, min, max) => Math.floor(min + rng() * (max - min + 1));
export const rngChance = (rng, p) => rng() < p;
export const rngPick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
