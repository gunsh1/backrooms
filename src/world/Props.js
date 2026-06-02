// =============================================================
//  Props.js — 広い開放ホールに置く障害物（放置オブジェクト）。
//  簡素なボックス構成で「廃車・木箱・瓦礫」を表現。
//  衝突は各タイプの footprint（軸並行AABB）を共有して使う。
// =============================================================

import * as THREE from 'three';

// 衝突用フットプリント [幅X, 奥行Z]（yaw=PI/2 で入れ替え）
export const PROP_FOOTPRINTS = {
  car: [3.4, 1.7],
  crates: [1.5, 1.5],
  debris: [2.0, 1.6],
};

export const PROP_TYPES = ['car', 'crates', 'debris'];

// 見た目を構築（中心原点・+X前方）。materials.prop / propDark を使う。
export function buildPropMesh(type, materials) {
  const g = new THREE.Group();
  const rust = materials.prop;
  const dark = materials.propDark;
  const box = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  };

  if (type === 'car') {
    box(3.2, 0.6, 1.5, 0, 0.55, 0, rust);          // 車体
    box(1.7, 0.55, 1.4, -0.2, 1.0, 0, rust);       // キャビン
    // 開いたボンネット（前方・斜め）
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 1.4), dark);
    hood.position.set(1.4, 1.1, 0); hood.rotation.z = -0.7;
    hood.castShadow = true; g.add(hood);
    // タイヤ（潰れ気味）
    for (const [wx, wz] of [[1.1, 0.75], [1.1, -0.75], [-1.1, 0.75], [-1.1, -0.75]]) {
      box(0.5, 0.45, 0.3, wx, 0.22, wz, dark);
    }
  } else if (type === 'crates') {
    box(1.0, 1.0, 1.0, -0.2, 0.5, -0.2, rust);
    box(0.9, 0.9, 0.9, 0.45, 0.45, 0.35, rust);
    box(0.8, 0.8, 0.8, 0.1, 1.4, -0.1, rust);      // 上に積む
  } else { // debris
    box(1.6, 0.4, 1.0, 0, 0.2, 0, dark);
    box(0.8, 0.6, 0.7, 0.5, 0.3, 0.4, rust);
    box(1.0, 0.3, 0.5, -0.4, 0.15, -0.3, rust);
  }
  return g;
}
