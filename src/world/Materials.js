// =============================================================
//  Materials.js
//  実写テクスチャをドロップイン優先で読込み、無ければ
//  ProceduralTextures のフォールバックを使う。
//  MeshStandardMaterial をキャッシュして返す。
// =============================================================

import * as THREE from 'three';
import { TEXTURE_PATHS, CONFIG } from '../config.js';
import {
  makeWallpaper, makePlainWall, makeCarpet, makeCeiling, makePanel, makeFlatNormal,
  makeGraffiti, normalFromTexture,
} from './ProceduralTextures.js';

// 落書きの文言（まれに壁に出現）
const GRAFFITI_TEXTS = ['HELP', 'HELP!', 'NO EXIT', 'GET OUT', 'WHY', 'TURN BACK', '←', 'LEAVE'];

export class Materials {
  constructor(renderer) {
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.loader = new THREE.TextureLoader();
    this.cache = {};
    this.materials = {};
  }

  // 1枚のテクスチャを読込む。失敗（404等）なら fallback() の CanvasTexture。
  _tryLoad(url, { srgb, repeat }, fallback) {
    const fb = fallback();
    fb.anisotropy = this.maxAniso;
    this.loader.load(
      url,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.copy(fb.repeat);
        tex.anisotropy = this.maxAniso;
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.needsUpdate = true;
        // 既存マテリアルの該当スロットを差し替え
        this._swap(url, tex);
      },
      undefined,
      () => { /* 失敗時はフォールバックのまま（無音） */ }
    );
    return fb;
  }

  _swap(url, tex) {
    // url を使っているマテリアルを探して張り替え
    for (const m of Object.values(this.materials)) {
      if (!m.userData.urls) continue;
      for (const [slot, u] of Object.entries(m.userData.urls)) {
        if (u === url) {
          m[slot]?.dispose?.();
          m[slot] = tex;
          m.needsUpdate = true;
        }
      }
    }
  }

  async build() {
    const flat = makeFlatNormal();
    const pal = CONFIG.palette;

    // --- 壁 ---
    // wallStyle='plain' は無地の黄色壁（仮テクスチャ）。
    // 'wallpaper' は実テクスチャ（BR_1 等）優先で読込み、無ければ仮ダマスク。
    {
      const plain = CONFIG.world.wallStyle === 'plain';
      const map = plain
        ? makePlainWall(512, pal.wall)
        : this._tryLoad(TEXTURE_PATHS.wallpaper.map, { srgb: true }, makeWallpaper);
      map.anisotropy = this.maxAniso;
      const normal = normalFromTexture(map, 1.2);
      normal.anisotropy = this.maxAniso;
      const mat = new THREE.MeshStandardMaterial({
        map, normalMap: normal,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 0.95, metalness: 0.0,
      });
      if (!plain) {
        mat.userData.urls = { map: TEXTURE_PATHS.wallpaper.map };
      }
      this.materials.wall = mat;
    }

    // --- カーペット ---
    {
      const map = this._tryLoad(
        TEXTURE_PATHS.carpet.map, { srgb: true }, () => makeCarpet(512, pal.carpet));
      map.anisotropy = this.maxAniso;
      // 拡散の粒から法線を生成（パイルの質感を光に反応させる）
      const normal = normalFromTexture(map, 2.2);
      normal.anisotropy = this.maxAniso;
      const mat = new THREE.MeshStandardMaterial({
        map, normalMap: normal,
        roughness: 0.97, metalness: 0.0,
        normalScale: new THREE.Vector2(0.45, 0.45),
      });
      mat.userData.urls = { map: TEXTURE_PATHS.carpet.map };
      this.materials.floor = mat;
    }

    // --- 天井（ドロップシーリングのタイル格子） ---
    {
      const map = this._tryLoad(
        TEXTURE_PATHS.ceiling.map, { srgb: true }, () => makeCeiling(512, pal.ceiling, 4));
      map.anisotropy = this.maxAniso;
      // フラットなクリーンタイル（法線マップ無しでモアレ/凹凸の悪目立ち回避）。
      // わずかに自己発光させ、参照のように天井面を淡く明るく見せる。
      const mat = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.95, metalness: 0.0,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: map,
        emissiveIntensity: 0.12,
      });
      mat.userData.urls = { map: TEXTURE_PATHS.ceiling.map };
      this.materials.ceiling = mat;
    }

    // --- 柱（壁と同系の黄色） ---
    this.materials.pillar = new THREE.MeshStandardMaterial({
      color: pal.pillar, roughness: 0.92, metalness: 0.0,
    });

    // --- 巾木 ---
    this.materials.trim = new THREE.MeshStandardMaterial({
      color: pal.trim, roughness: 0.85, metalness: 0.0,
    });

    // --- 照明パネルのフランジ（天井と面一の薄い縁取り） ---
    this.materials.frame = new THREE.MeshStandardMaterial({
      color: 0xe7e2c4, roughness: 0.9, metalness: 0.0,
    });

    // --- 障害物（廃車/木箱）: くすんだ金属＋暗部 ---
    this.materials.prop = new THREE.MeshStandardMaterial({
      color: 0x8a7d52, roughness: 0.8, metalness: 0.2,
    });
    this.materials.propDark = new THREE.MeshStandardMaterial({
      color: 0x2a261c, roughness: 0.9, metalness: 0.1,
    });

    // --- 木のドア ---
    this.materials.wood = new THREE.MeshStandardMaterial({
      color: 0x6e4a28, roughness: 0.72, metalness: 0.0,
    });
    this.materials.woodDark = new THREE.MeshStandardMaterial({
      color: 0x4a3018, roughness: 0.78, metalness: 0.0,
    });

    // --- 落書きデカール（透過・複数バリエーション） ---
    this.materials.graffiti = GRAFFITI_TEXTS.map((t, i) => new THREE.MeshStandardMaterial({
      map: makeGraffiti(t, 256, i + 1),
      transparent: true,
      alphaTest: 0.04,
      depthWrite: false,
      roughness: 1.0,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));

    // --- 光パネル（emissive） ---
    {
      const map = this._tryLoad(TEXTURE_PATHS.panel.map, { srgb: true }, makePanel);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: new THREE.Color(CONFIG.light.panelColor),
        emissiveMap: map,
        emissiveIntensity: CONFIG.light.panelEmissive,
        roughness: 1.0, metalness: 0.0,
        toneMapped: true,
      });
      mat.userData.urls = { emissiveMap: TEXTURE_PATHS.panel.map };
      this.materials.panel = mat;
    }

    // --- 消灯した光パネル（黒穴ではなく、くすんだ乳白の拡散板） ---
    this.materials.deadPanel = new THREE.MeshStandardMaterial({
      color: 0xb9b48c, emissive: new THREE.Color(0xffffff),
      emissiveMap: null, emissiveIntensity: 0.12,
      roughness: 1.0, metalness: 0.0,
    });

    flat.dispose?.();
    return this.materials;
  }
}
