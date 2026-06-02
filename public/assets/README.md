# アセット ドロップイン ガイド

ここにファイルを置くと、起動時に自動でプロシージャル仮テクスチャ／合成音から差し替わります。
**置かなくても動きます**（その場合は仮素材で動作）。

## テクスチャ — `textures/`

すべて **シームレス（タイル可能）** な画像にしてください。推奨 1024px 以上 / JPG or PNG。

| ファイル名 | 用途 | 参考 |
|---|---|---|
| `wallpaper_diffuse.jpg` | 壁紙の色 | 黄緑ダマスク柄 |
| `wallpaper_normal.jpg` | 壁紙の凹凸（任意） | 法線マップ |
| `carpet_diffuse.jpg` | 絨毯の色 | マスタード色ループパイル |
| `carpet_normal.jpg` | 絨毯の凹凸（任意） | 法線マップ |
| `ceiling_diffuse.jpg` | 天井タイル | 2×2 音響タイル |
| `ceiling_normal.jpg` | 天井の凹凸（任意） | 法線マップ |
| `light_panel.jpg` | 蛍光灯パネル（発光） | 白いトロッファー |

タイルの実寸（壁=2m, 床=3m, 天井=1.2m 相当）は
`src/world/RoomBuilder.js` の `WALL_TILE / FLOOR_TILE / CEIL_TILE` で調整できます。

## オーディオ — `audio/`

| ファイル名 | 用途 |
|---|---|
| `fluorescent_hum.mp3` | 蛍光灯のハム音（ループ素材） |
| `ambient_drone.mp3` | 低域の環境ドローン（ループ素材） |
| `footstep_carpet_1.mp3` 〜 `_4.mp3` | 足音バリエーション |

未配置時は WebAudio で手続き合成した音が鳴ります。
