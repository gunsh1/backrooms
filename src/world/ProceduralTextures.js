// =============================================================
//  ProceduralTextures.js
//  実写テクスチャが無いときのフォールバック。Canvas に
//  シームレス（端がループする）パターンを描き CanvasTexture を返す。
//  - 緑ダマスク壁紙 / マスタード絨毯 / 天井音響タイル / 光パネル
//  パレットは参照画像に寄せてある。
// =============================================================

import * as THREE from 'three';

// 小さな決定論ノイズ（テクスチャ生成用）
function makeNoise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1) ^ (s + Math.imul(s ^ (s >>> 7), s | 61))) >>> 0;
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function newCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finalize(canvas, { repeat = 1, aniso = 8, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// CanvasTexture/画像を canvas に正規化（loaded image でも可、未ロードなら空）
function toCanvas(image, size) {
  if (image instanceof HTMLCanvasElement) return image;
  const c = newCanvas(size);
  try { c.getContext('2d').drawImage(image, 0, 0, size, size); } catch (e) { /* noop */ }
  return c;
}

// 拡散テクスチャの輝度を高さとみなし、Sobel で法線マップを生成（シームレス）。
// strength を上げるほど凹凸が強い。tangent-space normal を返す。
export function normalFromTexture(tex, strength = 1.0, size = 512) {
  const src = toCanvas(tex.image, size);
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d');
  const sd = sctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) / 255;
  }
  const at = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)]; // wrap で継ぎ目なし

  const out = newCanvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const od = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -gx * strength, ny = -gy * strength, nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const o = (y * w + x) * 4;
      od[o] = (nx * 0.5 + 0.5) * 255;
      od[o + 1] = (ny * 0.5 + 0.5) * 255;
      od[o + 2] = (nz * 0.5 + 0.5) * 255;
      od[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return finalize(out, { srgb: false });
}

// ---- 緑ダマスク壁紙 ------------------------------------------------
// オジー（玉ねぎ型）格子 + 花弁モチーフを2色の黄緑で。
export function makeWallpaper(size = 512) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeNoise(0xDA3A5C);

  // ベース：黄ばんだクリーム
  const base = ctx.createLinearGradient(0, 0, 0, size);
  base.addColorStop(0, '#cfca87');
  base.addColorStop(1, '#c2bd78');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // 微妙な縦の汚れ・経年
  for (let i = 0; i < 220; i++) {
    const x = rng() * size;
    ctx.globalAlpha = 0.03 + rng() * 0.04;
    ctx.fillStyle = rng() > 0.5 ? '#b7b06a' : '#d8d398';
    ctx.fillRect(x, 0, 1 + rng() * 2, size);
  }
  ctx.globalAlpha = 1;

  // ダマスクのモチーフを 2x2 タイルで（端ループのため wrap 描画）
  const motif = (cx, cy, scale, color, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4 * scale;
    // オジー菱形
    ctx.beginPath();
    ctx.moveTo(cx, cy - 60 * scale);
    ctx.bezierCurveTo(cx + 46 * scale, cy - 40 * scale, cx + 40 * scale, cy + 30 * scale, cx, cy + 56 * scale);
    ctx.bezierCurveTo(cx - 40 * scale, cy + 30 * scale, cx - 46 * scale, cy - 40 * scale, cx, cy - 60 * scale);
    ctx.stroke();
    // 中央の花
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 12 * scale, cy + Math.sin(a) * 12 * scale,
        7 * scale, 3.5 * scale, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 緑のダマスク色（やや濃い黄緑）。半周期ずらしの市松配置でシームレス。
  const green = '#9aa15a';
  const greenDk = '#828a47';
  const step = size / 2;
  for (let gy = -1; gy <= 2; gy++) {
    for (let gx = -1; gx <= 2; gx++) {
      const offset = (gy & 1) ? step / 2 : 0;
      const cx = gx * step + offset + step / 2;
      const cy = gy * step + step / 2;
      motif(cx, cy, size / 256, greenDk, 0.5);
      motif(cx, cy, size / 256, green, 0.85);
    }
  }

  // ごく薄い汚れスポット
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.04 + rng() * 0.05;
    ctx.fillStyle = '#7d7440';
    const r = 8 + rng() * 30;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  return finalize(c, { repeat: 1 });
}

// ---- 無地の塗り壁（黄色） ----------------------------------------
// シェブロン柄なしの、わずかにムラのある塗装壁。新パレット用。
export function makePlainWall(size = 512, rgb = [205, 191, 69]) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeNoise(0x9A11 ^ (rgb[0] * 7 + rgb[1]));

  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.fillRect(0, 0, size, size);

  // ごく細かいムラ
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.6;
  }
  ctx.putImageData(img, 0, 0);

  // 微かなスクエア柄（クラシックな壁紙の淡い格子）。2x2分割でシームレス。
  const cells = 2;
  const cs = size / cells;
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      // 各マスをごくわずかに明暗（市松ではなくランダム微差）
      const t = (rng() - 0.5) * 10;
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = `rgb(${rgb[0] + t},${rgb[1] + t},${rgb[2] + t * 0.6})`;
      ctx.fillRect(gx * cs, gy * cs, cs, cs);
    }
  }
  // 淡い格子線（溝と上ハイライト）
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#857a32';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= cells; i++) {
    const p = i * cs;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 薄い縦の経年ムラ
  for (let k = 0; k < 40; k++) {
    ctx.globalAlpha = 0.012 + rng() * 0.02;
    ctx.fillStyle = rng() > 0.5 ? '#b8ab3c' : '#dccf5e';
    ctx.fillRect(rng() * size, 0, 1 + rng() * 2, size);
  }
  // ぼんやりした汚れ
  for (let k = 0; k < 8; k++) {
    const x = rng() * size, y = rng() * size, r = 14 + rng() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(110,100,38,0.12)');
    g.addColorStop(1, 'rgba(110,100,38,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finalize(c, { repeat: 1 });
}

// ---- 絨毯（くすんだセージ緑グレー・なめらか） --------------------
export function makeCarpet(size = 512, base = [142, 145, 114]) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeNoise(0xCA7E70);

  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, size, size);

  // ごく控えめなパイルの粒（滑らかに見せるため振幅小）
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rng() - 0.5) * 12;
    d[i] = Math.min(255, Math.max(0, base[0] + v));
    d[i + 1] = Math.min(255, Math.max(0, base[1] + v));
    d[i + 2] = Math.min(255, Math.max(0, base[2] + v * 0.8));
  }
  ctx.putImageData(img, 0, 0);

  // 方向性の筋はごく薄く（同系のグレー緑）
  ctx.globalAlpha = 0.025;
  for (let y = 0; y < size; y += 3) {
    ctx.strokeStyle = rng() > 0.5 ? '#888b6a' : '#9da081';
    ctx.beginPath();
    ctx.moveTo(0, y + rng());
    ctx.lineTo(size, y + rng());
    ctx.stroke();
  }
  // 大きく薄い色ムラ（同系・ごく弱い）で均一すぎないように
  ctx.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const x = rng() * size, y = rng() * size, r = 40 + rng() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(120,122,96,0.10)');
    g.addColorStop(1, 'rgba(120,122,96,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finalize(c, { repeat: 1 });
}

// ---- 天井：ドロップシーリングの格子（複数タイルを1枚に焼く） -----
// tiles×tiles 枚分を1テクスチャに描く。リピート数が減りモアレ/моアレ低減。
// CEIL_TILE = 0.61 * tiles で実寸(2ft角)に合う。クリーンな格子。
export function makeCeiling(size = 512, rgb = [210, 202, 140], tiles = 4) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeNoise(0xCE17);

  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.fillRect(0, 0, size, size);

  // 極めて弱いスペックル（均一感維持）
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rng() - 0.5) * 8;
    d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.7;
  }
  ctx.putImageData(img, 0, 0);

  const cs = size / tiles;
  // タイルごとのごくわずかな明暗（チェッカーにならない微差）
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const t = (rng() - 0.5) * 6;
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = `rgb(${rgb[0] + t},${rgb[1] + t},${rgb[2] + t * 0.7})`;
      ctx.fillRect(x * cs, y * cs, cs, cs);
    }
  }
  ctx.globalAlpha = 1;

  // 細いT字バーの格子線（溝＝暗、すぐ脇にハイライト）
  const lw = Math.max(1, size * 0.004);
  for (let i = 0; i <= tiles; i++) {
    const p = Math.round(i * cs) + 0.5;
    ctx.strokeStyle = 'rgba(80,76,46,0.5)';
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    ctx.strokeStyle = 'rgba(245,240,205,0.18)'; // 細いハイライト
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p + lw, 0); ctx.lineTo(p + lw, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p + lw); ctx.lineTo(size, p + lw); ctx.stroke();
  }

  return finalize(c, { repeat: 1 });
}

// ---- 落書き（透明背景に黒い手書き文字） --------------------------
// 壁に貼るデカール用。透過つき。ClampToEdge。
export function makeGraffiti(text, size = 256, seed = 1) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeNoise(0x6A77 ^ seed);
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((rng() - 0.5) * 0.22);
  const ink = `rgba(${20 + rng() * 20 | 0},${16 + rng() * 14 | 0},${10 + rng() * 10 | 0},0.9)`;
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  // 文字
  const fs = size * (text.length > 4 ? 0.22 : 0.34);
  ctx.font = `900 ${fs}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 手書きのブレ：数回ずらして重ね描き
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = 0.3 + 0.25 * rng();
    ctx.fillText(text, (rng() - 0.5) * 4, (rng() - 0.5) * 4);
  }
  ctx.globalAlpha = 1;
  // 滴り（ドリップ）
  ctx.lineWidth = Math.max(1, size * 0.006);
  for (let k = 0; k < 5; k++) {
    const x = (rng() - 0.5) * size * 0.6;
    const y = fs * 0.3 + rng() * 6;
    ctx.globalAlpha = 0.4 * rng();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + rng() * size * 0.18);
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---- 敵：暗い人型シルエット（透過・ビルボード用） ----------------
export function makeSilhouette(size = 256) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  ctx.fillStyle = 'rgba(4,4,3,1)';

  // 頭
  ctx.beginPath();
  ctx.ellipse(cx, size * 0.16, size * 0.085, size * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
  // 首
  ctx.fillRect(cx - size * 0.03, size * 0.24, size * 0.06, size * 0.06);
  // 胴（肩から細く下へ）
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.13, size * 0.30);
  ctx.quadraticCurveTo(cx - size * 0.10, size * 0.62, cx - size * 0.075, size * 0.96);
  ctx.lineTo(cx + size * 0.075, size * 0.96);
  ctx.quadraticCurveTo(cx + size * 0.10, size * 0.62, cx + size * 0.13, size * 0.30);
  ctx.quadraticCurveTo(cx, size * 0.27, cx - size * 0.13, size * 0.30);
  ctx.fill();
  // 腕（体側に沿って細く）
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = 'rgba(4,4,3,1)';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.12, size * 0.34);
  ctx.lineTo(cx - size * 0.15, size * 0.66);
  ctx.moveTo(cx + size * 0.12, size * 0.34);
  ctx.lineTo(cx + size * 0.15, size * 0.66);
  ctx.stroke();

  // 輪郭をわずかにぼかす（霧/VHSになじむ）
  ctx.globalCompositeOperation = 'destination-over';
  const g = ctx.createRadialGradient(cx, size * 0.5, size * 0.1, cx, size * 0.5, size * 0.5);
  g.addColorStop(0, 'rgba(6,6,4,0.18)');
  g.addColorStop(1, 'rgba(6,6,4,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ---- ジャンプスケアの顔（全画面オーバーレイ用・HTMLCanvasを返す） ----
export function makeScaryFace(size = 512) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeNoise(0xFACE);
  const cx = size / 2;

  // 背景は暗黒
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // 顔（蒼白・歪んだ楕円）
  const fg = ctx.createRadialGradient(cx, size * 0.5, size * 0.1, cx, size * 0.5, size * 0.55);
  fg.addColorStop(0, '#b9b2a0');
  fg.addColorStop(0.7, '#6b6657');
  fg.addColorStop(1, '#16140f');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(cx, size * 0.52, size * 0.34, size * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();

  // 落ち窪んだ眼窩（黒）＋小さな白い瞳
  const eye = (ex, ey, s) => {
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.ellipse(ex, ey, size * 0.11 * s, size * 0.14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.arc(ex + (rng() - 0.5) * 6, ey + (rng() - 0.5) * 6, size * 0.018, 0, Math.PI * 2);
    ctx.fill();
  };
  eye(cx - size * 0.15, size * 0.42, 1.0);
  eye(cx + size * 0.15, size * 0.43, 1.1);

  // 大きく裂けた口＋歯
  ctx.fillStyle = '#0a0604';
  ctx.beginPath();
  ctx.ellipse(cx, size * 0.74, size * 0.16, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#cfc6ad';
  for (let i = -3; i <= 3; i++) {
    ctx.fillRect(cx + i * size * 0.04 - 2, size * 0.66, size * 0.03, size * 0.06);
    ctx.fillRect(cx + i * size * 0.04 - 2, size * 0.80, size * 0.03, size * 0.05);
  }

  // 暗いシワ/ノイズで歪ませる
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.04 + rng() * 0.06;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    const x = rng() * size, y = rng() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 40, y + (rng() - 0.5) * 40);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c; // HTMLCanvasElement（呼び出し側で toDataURL）
}

// ---- 光パネル（emissiveマップ用、白いトロッファー） --------------
export function makePanel(size = 256) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fffdf2';
  ctx.fillRect(0, 0, size, size);
  // 蛍光管2本の僅かなムラ
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0.0, 'rgba(255,250,225,1)');
  g.addColorStop(0.25, 'rgba(255,255,245,1)');
  g.addColorStop(0.5, 'rgba(248,244,218,1)');
  g.addColorStop(0.75, 'rgba(255,255,245,1)');
  g.addColorStop(1.0, 'rgba(255,250,225,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // 縁のフレーム
  ctx.strokeStyle = 'rgba(180,176,150,0.9)';
  ctx.lineWidth = size * 0.05;
  ctx.strokeRect(0, 0, size, size);
  return finalize(c, { repeat: 1, srgb: true });
}

// 平坦法線（normalマップが無いとき）
export function makeFlatNormal() {
  const c = newCanvas(4);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, 4, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
