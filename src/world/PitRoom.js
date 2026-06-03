// =============================================================
//  PitRoom.js — 床に正方形の穴が格子状に並ぶ特殊な部屋。
//  梁（lattice）の上を歩け、穴の上に出ると落下する。
//  穴判定 isOverHole は RoomBuilder（見た目）と Game（落下検出）で共有。
// =============================================================

import * as THREE from 'three';

export const PIT = {
  pitch: 4.0,    // 穴の周期（= cellSize）
  beamW: 1.3,    // 梁の幅
  depth: 9,      // 穴の深さ（暗い底まで）
};

// world座標が穴の上か（X/Zの両グリッド線から外れていれば穴）
export function isOverHole(x, z) {
  const P = PIT.pitch, h = PIT.beamW / 2;
  const fx = ((x % P) + P) % P;
  const fz = ((z % P) + P) % P;
  const onX = Math.min(fx, P - fx) < h; // X方向グリッド線の近傍（Z向き梁）
  const onZ = Math.min(fz, P - fz) < h; // Z方向グリッド線の近傍（X向き梁）
  return !(onX || onZ);
}

// 最寄りの梁の交点（グリッド交点）にスナップ＝確実に足場へ
export function snapToBeam(x, z) {
  const P = PIT.pitch;
  return [Math.round(x / P) * P, Math.round(z / P) * P];
}

// 出口ドア（木の枠＋木の扉）。trigger 位置を返す。
export function buildDoor(materials) {
  const g = new THREE.Group();
  const frame = materials.woodDark;   // 木枠（濃い）
  const wood = materials.wood;        // 木の扉
  const post = (x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.3), frame);
    m.position.set(x, 1.2, 0); m.castShadow = m.receiveShadow = true; g.add(m);
  };
  post(-0.7); post(0.7);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.3), frame);
  lintel.position.set(0, 2.3, 0); lintel.castShadow = true; g.add(lintel);
  // 木の扉本体
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.15, 0.12), wood);
  panel.position.set(0, 1.1, 0); panel.castShadow = panel.receiveShadow = true; g.add(panel);
  // framing の溝（鏡板風）
  const inset = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.8, 0.13), frame);
  inset.position.set(0, 1.15, 0); g.add(inset);
  const inset2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.65, 0.14), wood);
  inset2.position.set(0, 1.15, 0); g.add(inset2);
  // ノブ
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), materials.frame);
  knob.position.set(0.45, 1.05, 0.09); g.add(knob);
  return g;
}
