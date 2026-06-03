// =============================================================
//  RoomBuilder.js
//  1チャンク分のジオメトリを構築して THREE.Group を返す。
//  含むもの: 床 / 天井 / 壁(マージ) / 柱(Instanced) / 巾木 / 光パネル。
//  光パネルの world 位置リストも返し、照明システムが利用する。
// =============================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { MazeGenerator } from './MazeGenerator.js';
import { buildPropMesh } from './Props.js';
import { PIT, buildDoor } from './PitRoom.js';

const S = CONFIG.world.cellSize;
const H = CONFIG.world.wallHeight;
const T = CONFIG.world.wallThickness;
const P = CONFIG.world.pillarSize;
const N = CONFIG.world.chunkCells;

const WALL_TILE = 0.6;   // 壁紙の1タイルが何メートルか（小さいほど柄が細かい）
const FLOOR_TILE = 3.0;  // 絨毯タイル
const CEIL_TILE = 2.44;  // 天井テクスチャ(4タイル分)=約2.44m → 1タイル0.61m(2ft)

// UVをスケールしてタイリング（box/planeのuv属性を一律倍率）
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
  return geo;
}

export class RoomBuilder {
  // origin: チャンクの基準セル (cx0, cy0)。generation はそのチャンクの世代。
  // genFor(gx,gy): 隣接チャンクの世代を引く関数（巨大ホール境界判定に使用）。
  static build(cx0, cy0, generation, materials, genFor = null) {
    const group = new THREE.Group();
    const ox = cx0 * S;
    const oz = cy0 * S;
    const span = N * S;

    // 超レアな巨大ホール：天井を非常に高く・周囲は何もない空間に
    const vast = MazeGenerator.isVastChunk(cx0, cy0, generation);
    const pit = MazeGenerator.isPitChunk(cx0, cy0, generation);
    const ceilingY = vast ? CONFIG.world.vastCeilingHeight : H;

    // ---- 床 ----
    if (pit) {
      // 落とし穴の部屋：梁の格子＋暗い穴の底
      const beams = [];
      const halfH = 0.4;
      // 縦ビーム（Z方向・上面 y=0）
      const first = Math.ceil(ox / PIT.pitch) * PIT.pitch;
      for (let x = first; x < ox + span - 1e-6; x += PIT.pitch) {
        const g = new THREE.BoxGeometry(PIT.beamW, halfH, span);
        g.translate(x, -halfH / 2, oz + span / 2);
        beams.push(g);
      }
      // 横ビーム（X方向）。交点での同一平面重なり(z-fighting)を避けるため
      // 上面をごくわずかに下げる（4mm・見た目は無変化）。
      const firstZ = Math.ceil(oz / PIT.pitch) * PIT.pitch;
      for (let z = firstZ; z < oz + span - 1e-6; z += PIT.pitch) {
        const g = new THREE.BoxGeometry(span, halfH, PIT.beamW);
        g.translate(ox + span / 2, -halfH / 2 - 0.004, z);
        beams.push(g);
      }
      if (beams.length) {
        const merged = mergeGeometries(beams, false);
        beams.forEach((g) => g.dispose());
        const m = new THREE.Mesh(merged, materials.trim);
        m.receiveShadow = m.castShadow = true;
        group.add(m);
      }
      // 暗い底（穴の奥）
      const voidGeo = new THREE.PlaneGeometry(span, span);
      voidGeo.rotateX(-Math.PI / 2);
      const voidMesh = new THREE.Mesh(voidGeo, materials.propDark);
      voidMesh.position.set(ox + span / 2, -PIT.depth, oz + span / 2);
      group.add(voidMesh);
    } else {
      const geo = new THREE.PlaneGeometry(span, span, 1, 1);
      geo.rotateX(-Math.PI / 2);
      scaleUV(geo, span / FLOOR_TILE, span / FLOOR_TILE);
      const mesh = new THREE.Mesh(geo, materials.floor);
      mesh.position.set(ox + span / 2, 0, oz + span / 2);
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // ---- 天井（巨大ホールは高い位置に） ----
    {
      const geo = new THREE.PlaneGeometry(span, span, 1, 1);
      geo.rotateX(Math.PI / 2);
      scaleUV(geo, span / CEIL_TILE, span / CEIL_TILE);
      const mesh = new THREE.Mesh(geo, materials.ceiling);
      mesh.position.set(ox + span / 2, ceilingY, oz + span / 2);
      group.add(mesh);
    }

    // ---- 巨大ホールの周壁（隣が通常高さの時だけ段差を塞ぐ立ち上がり） ----
    const wallGeos0 = [];
    if (vast) {
      const riserH = ceilingY - H;
      const ry = (H + ceilingY) / 2;
      const addRiser = (w, d, x, z) => {
        const g = new THREE.BoxGeometry(w, riserH, d);
        scaleUV(g, Math.max(w, d) / WALL_TILE, riserH / WALL_TILE);
        g.translate(x, ry, z);
        wallGeos0.push(g);
      };
      // 隣チャンクも巨大ホールなら段差が無いので壁は不要（=シームレスに繋がる）
      const neighborVast = (ngx, ngy) =>
        genFor ? MazeGenerator.isVastChunk(ngx, ngy, genFor(ngx, ngy)) : false;
      if (!neighborVast(cx0, cy0 - 1)) addRiser(span, T, ox + span / 2, oz);          // 南
      if (!neighborVast(cx0, cy0 + N)) addRiser(span, T, ox + span / 2, oz + span);   // 北
      if (!neighborVast(cx0 - 1, cy0)) addRiser(T, span, ox, oz + span / 2);          // 西
      if (!neighborVast(cx0 + N, cy0)) addRiser(T, span, ox + span, oz + span / 2);   // 東
    }

    // ---- 壁・巾木・柱・パネルを集計 ----
    const wallGeos = [];
    const trimGeos = [];
    const pillarMatrices = [];
    const panels = []; // {x,y,z, dead}
    const decals = []; // {x,y,z, faceY, matIndex}

    const dummy = new THREE.Object3D();

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const gx = cx0 + i;
        const gy = cy0 + j;
        const c = MazeGenerator.cell(gx, gy, generation);
        const wx = gx * S;
        const wz = gy * S;

        // 東の壁（x = (gx+1)*S, z 方向に長さS）
        if (c.eastWall) {
          const g = new THREE.BoxGeometry(T, H, S);
          scaleUV(g, S / WALL_TILE, H / WALL_TILE);
          g.translate(wx + S, H / 2, wz + S / 2);
          wallGeos.push(g);
          // 巾木
          const tg = new THREE.BoxGeometry(T * 1.6, 0.12, S);
          tg.translate(wx + S, 0.06, wz + S / 2);
          trimGeos.push(tg);
          // 落書き（東壁の -X 面に向ける）
          if (c.graffiti && c.graffiti.on === 'east') {
            decals.push({
              x: wx + S - T / 2 - 0.02, y: 1.7, z: wz + S / 2,
              rotY: -Math.PI / 2, matIndex: c.graffiti.index,
            });
          }
        }
        // 北の壁（z = (gy+1)*S, x 方向に長さS）
        if (c.northWall) {
          const g = new THREE.BoxGeometry(S, H, T);
          scaleUV(g, S / WALL_TILE, H / WALL_TILE);
          g.translate(wx + S / 2, H / 2, wz + S);
          wallGeos.push(g);
          const tg = new THREE.BoxGeometry(S, 0.12, T * 1.6);
          tg.translate(wx + S / 2, 0.06, wz + S);
          trimGeos.push(tg);
          // 落書き（北壁の -Z 面に向ける）
          if (c.graffiti && c.graffiti.on === 'north') {
            decals.push({
              x: wx + S / 2, y: 1.7, z: wz + S - T / 2 - 0.02,
              rotY: Math.PI, matIndex: c.graffiti.index,
            });
          }
        }
        // 柱（南西角 = グリッド点 (gx,gy)）
        if (c.pillar) {
          dummy.position.set(wx, H / 2, wz);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          pillarMatrices.push(dummy.matrix.clone());
        }
        // 天井ライト（セル中央。巨大ホールは高い天井に付く）
        if (c.light !== 'none') {
          panels.push({
            x: wx + S / 2,
            y: ceilingY - 0.02,
            z: wz + S / 2,
            dead: c.light === 'dead',
          });
        }
        // 障害物（開放ホール）
        if (c.prop) {
          const pm = buildPropMesh(c.prop.type, materials);
          pm.position.set(wx + S / 2, 0, wz + S / 2);
          pm.rotation.y = c.prop.yaw;
          group.add(pm);
        }
      }
    }

    // ---- 壁マージ（巨大ホールの周壁 riser も含める） ----
    if (wallGeos0.length) for (const g of wallGeos0) wallGeos.push(g);
    if (wallGeos.length) {
      const merged = mergeGeometries(wallGeos, false);
      wallGeos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, materials.wall);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (trimGeos.length) {
      const merged = mergeGeometries(trimGeos, false);
      trimGeos.forEach((g) => g.dispose());
      const tm = new THREE.Mesh(merged, materials.trim);
      tm.receiveShadow = true;
      group.add(tm);
    }

    // ---- 柱（InstancedMesh） ----
    if (pillarMatrices.length) {
      const geo = new THREE.BoxGeometry(P, H, P);
      const inst = new THREE.InstancedMesh(geo, materials.pillar, pillarMatrices.length);
      inst.castShadow = inst.receiveShadow = true;
      pillarMatrices.forEach((m, k) => inst.setMatrixAt(k, m));
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
    }

    // ---- 光パネル（emissive 板）＋天井と面一の薄いフランジ ----
    const litGeos = [];
    const deadGeos = [];
    const frameGeos = [];
    const PW = 1.18;           // 発光面の一辺
    const bw = 0.06;           // フランジ幅（細く）
    const half = PW / 2 + bw / 2;
    for (const p of panels) {
      // 発光面（天井のすぐ下に薄く recess）
      const g = new THREE.PlaneGeometry(PW, PW);
      g.rotateX(Math.PI / 2); // 下向き
      g.translate(p.x, p.y, p.z);
      (p.dead ? deadGeos : litGeos).push(g);

      // フランジ：天井と面一の平らな縁取り（出っ張らない）。パネル高に追従。
      const fy = p.y + 0.016;
      const outer = PW + bw * 2;
      const mkBar = (w, d, dx, dz) => {
        const b = new THREE.PlaneGeometry(w, d);
        b.rotateX(Math.PI / 2);      // 下向き（天井と同じ）
        b.translate(p.x + dx, fy, p.z + dz);
        frameGeos.push(b);
      };
      mkBar(outer, bw, 0, -half);    // 上
      mkBar(outer, bw, 0, half);     // 下
      mkBar(bw, PW, -half, 0);       // 左
      mkBar(bw, PW, half, 0);        // 右
    }
    if (litGeos.length) {
      const merged = mergeGeometries(litGeos, false);
      litGeos.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(merged, materials.panel));
    }
    if (deadGeos.length) {
      const merged = mergeGeometries(deadGeos, false);
      deadGeos.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(merged, materials.deadPanel));
    }
    if (frameGeos.length) {
      const merged = mergeGeometries(frameGeos, false);
      frameGeos.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(merged, materials.frame));
    }

    // ---- 落書きデカール（壁面に貼る透過プレーン・大きめ） ----
    if (decals.length && materials.graffiti?.length) {
      const decalGeo = new THREE.PlaneGeometry(2.6, 2.6);
      for (const dc of decals) {
        const mat = materials.graffiti[dc.matIndex % materials.graffiti.length];
        const mesh = new THREE.Mesh(decalGeo, mat);
        mesh.position.set(dc.x, dc.y, dc.z);
        mesh.rotation.y = dc.rotY;
        group.add(mesh);
      }
    }

    // ---- 出口ドア（落とし穴部屋のみ。Eキーでクリア） ----
    const doors = [];
    if (pit) {
      const dx = Math.round((ox + span / 2) / PIT.pitch) * PIT.pitch;
      const dz = oz + span - PIT.pitch; // 奥側のグリッド線（梁の上）
      const door = buildDoor(materials);
      door.position.set(dx, 0, dz);
      group.add(door);
      doors.push({ x: dx, y: 1.2, z: dz });
    }

    group.userData.panels = panels;
    group.userData.doors = doors;
    return group;
  }
}
