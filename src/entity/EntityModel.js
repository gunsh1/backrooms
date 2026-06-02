// =============================================================
//  EntityModel.js — 敵のFBXモデル（アニメ付き）をロードし、
//  独立インスタンス（スケルトン複製＋AnimationMixer）を供給する。
//  ロード失敗時は null（呼び出し側がスプライトにフォールバック）。
// =============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';

const URL = 'assets/models/lifeform.fbx';

export class EntityModel {
  // { proto, clips, footOffset } | null
  static async load() {
    try {
      const fbx = await new FBXLoader().loadAsync(URL);

      // 目標の高さにスケール
      const box0 = new THREE.Box3().setFromObject(fbx);
      const size0 = new THREE.Vector3(); box0.getSize(size0);
      const scale = CONFIG.entity.height / (size0.y || 1);
      fbx.scale.setScalar(scale);

      // 足が床(y=0)に来るようオフセット
      const box1 = new THREE.Box3().setFromObject(fbx);
      const footOffset = -box1.min.y;

      // FBX同梱のライト/カメラを無効化（白飛びの原因）＋暗いマテリアルに統一
      const toRemove = [];
      fbx.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = false;
          o.frustumCulled = false;
          o.material = new THREE.MeshStandardMaterial({
            color: 0x080807,
            emissive: new THREE.Color(0x000000),
            emissiveIntensity: 0,
            roughness: 1.0, metalness: 0.0,
            toneMapped: true,
          });
        }
        if (o.isLight) { o.intensity = 0; o.visible = false; toRemove.push(o); }
        if (o.isCamera) { o.visible = false; toRemove.push(o); }
      });
      for (const o of toRemove) o.parent && o.parent.remove(o);

      return { proto: fbx, clips: fbx.animations || [], footOffset, scale };
    } catch (e) {
      console.warn('[EntityModel] FBX load failed → sprite fallback:', e);
      return null;
    }
  }

  // 独立したインスタンス（複数同時表示や再出現に対応）
  static createInstance(asset) {
    const obj = cloneSkeleton(asset.proto);
    const mixer = new THREE.AnimationMixer(obj);

    // 主要クリップを選ぶ（run > walk > crawl > 先頭）
    const clips = asset.clips;
    const find = (re) => clips.find((c) => re.test(c.name));
    const primary = find(/run|sprint/i) || find(/walk/i) || find(/crawl|move/i) || clips[0] || null;

    const actions = {
      primary: primary ? mixer.clipAction(primary) : null,
      run: find(/run|sprint/i) ? mixer.clipAction(find(/run|sprint/i)) : null,
      walk: find(/walk/i) ? mixer.clipAction(find(/walk/i)) : null,
      idle: find(/idle|stand/i) ? mixer.clipAction(find(/idle|stand/i)) : null,
    };
    if (actions.primary) {
      // 前進→後退の往復再生で、ループの継ぎ目（途切れ）を無くす
      actions.primary.setLoop(THREE.LoopPingPong, Infinity);
      actions.primary.clampWhenFinished = false;
      actions.primary.play();
    }

    return { obj, mixer, actions, footOffset: asset.footOffset, scale: asset.scale };
  }
}
