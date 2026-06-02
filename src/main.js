// =============================================================
//  main.js — エントリポイント
//  起動 → ローディング → 初回のみフルの LEVEL 0 画面でクリック開始。
//  以降 ESC で一時停止しても画面は覆わず、隅に小さな「クリックで
//  再開」ヒントだけを出す。クリック/WASD でいつでも再開できる。
// =============================================================

import { Game } from './core/Game.js';

const app = document.getElementById('app');
const hud = document.getElementById('hud');
const reticle = document.getElementById('reticle');
const overlay = document.getElementById('overlay');
const resumeHint = document.getElementById('resume-hint');
const loaderBar = document.querySelector('#loader > span');
const startHint = document.getElementById('hint-start');

const game = new Game(app);
let booted = false;
let started = false; // 一度でもゲーム開始したか（初回オーバーレイ用）

// ロック状態は document.pointerLockElement を正とする。
// （controls.isLocked はイベント順序により更新が一拍遅れることがある）
const isPlaying = () => !!document.pointerLockElement;

// --- 初期化（ローディング表示） ---
async function boot() {
  // 初回オーバーレイを表示
  if (overlay) {
    overlay.style.display = '';
    overlay.classList.remove('hidden');
  }
  let p = 0;
  const tick = setInterval(() => {
    p = Math.min(95, p + 6 + Math.random() * 10);
    if (loaderBar) loaderBar.style.width = p + '%';
  }, 80);

  await game.init();
  booted = true;

  clearInterval(tick);
  if (loaderBar) loaderBar.style.width = '100%';
  if (startHint) startHint.textContent = 'クリックして開始';
}

// （再）開始：ロックしてオーディオを開始（多重起動はガード済み）
async function requestStart() {
  if (!booted || !game.player || isPlaying()) return;
  game.player.lock();
  if (!started) {
    started = true;
    // 初回オーバーレイは以後二度と出さない
    if (overlay) overlay.style.display = 'none';
  }
  try {
    await game.startAudio();
  } catch (e) {
    console.error('[START] audio error:', e);
  }
}

// 永続ハンドラ：ロックされていない間はクリックで（再）開始
document.addEventListener('click', () => {
  if (!isPlaying()) requestStart();
});
// WASD / Enter / Space でも開始可能
document.addEventListener('keydown', (e) => {
  if (isPlaying()) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter', 'Space'].includes(e.code)) {
    requestStart();
  }
});

// ポインタロックの状態で UI を切替
function watchLock() {
  const locked = isPlaying();
  hud.classList.toggle('on', locked);
  reticle.classList.toggle('on', locked);
  // 一時停止中（開始済み & 非ロック）だけ小さな再開ヒントを出す
  if (resumeHint) resumeHint.classList.toggle('on', started && !locked);
}
document.addEventListener('pointerlockchange', watchLock);

// --- レンダーループ ---
function loop() {
  requestAnimationFrame(loop);
  game.update();
}

boot().then(() => loop());

// HMR のクリーンアップ
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (game.player) game.player.unlock?.();
  });
}
