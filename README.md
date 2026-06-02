# Level 0 — Backrooms ウォーキングシミュレーター

参照画像（Backrooms Level 0）の雰囲気を three.js / WebGL で再現する一人称探索。
黄ばんだ緑ダマスク壁紙・マスタード色の湿ったカーペット・ハム音を鳴らす蛍光灯・
無限に続く広間と柱。引き返すと構造が変わるリミナル異常つき。

## 起動

```bash
npm install
npm run dev      # http://localhost:5173 が開く
```

クリックで開始（ポインタロック）。**WASD** 移動 / **SHIFT** 走る / **マウス** 視点 / **ESC** 一時停止。

## ビルド

```bash
npm run build    # dist/ に出力
npm run preview
```

## 構成

| 領域 | ファイル |
|---|---|
| 起動・ループ | `src/main.js`, `src/core/Game.js` |
| 描画基盤 | `src/core/Renderer.js`（霧・ACESトーンマップ） |
| プレイヤー | `src/core/Player.js`（PointerLock・WASD・衝突・ヘッドボブ） |
| ワールド生成 | `src/world/MazeGenerator.js`, `RoomBuilder.js`, `ChunkManager.js` |
| マテリアル/テクスチャ | `src/world/Materials.js`, `ProceduralTextures.js` |
| 照明 | `src/lighting/FluorescentSystem.js`（面光源プール・明滅） |
| ポストプロセス | `src/fx/PostProcessing.js`（Bloom・グレイン・ヴィネット・色収差） |
| オーディオ | `src/audio/AudioManager.js`（ハム・ドローン・足音／手続き合成フォールバック） |
| 異常ギミック | `src/anomaly/AnomalyController.js`（コンパス/GPS/信号異常・暗転） |
| 調整値 | `src/config.js` ← 質感チューニングはここ |

## 実写テクスチャ・音の差し替え

`public/assets/` 配下に置くだけで自動で差し替わります。詳細は
[public/assets/README.md](public/assets/README.md) を参照。未配置でも仮素材で動作します。

## クレジット / ライセンス

壁紙テクスチャは以下のモデルに基づきます（**CC-BY-4.0 / 要クレジット表記**）:

> This work is based on "Backrooms Wallpapers"
> (https://sketchfab.com/3d-models/backrooms-wallpapers-2c36079726a84d5db6369c7261d73152)
> by Huuxloc (https://sketchfab.com/rjh41) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

## 既知の調整ポイント

- 質感が画像と合わない場合は `src/config.js` の `light` / `fx` と
  `RoomBuilder.js` のタイル寸法を調整。
- チャンク境界をまたぐ瞬間に軽いヒッチが出る場合は `world.viewChunks` を下げる
  か、将来的にチャンク生成を非同期化（Web Worker）する。
