// =============================================================
//  config.js — 全システム共通のチューニング値
//  「完全一致」の質感はここの数値調整で詰める。
// =============================================================

export const CONFIG = {
  // --- ワールドのスケール（メートル単位） ---
  world: {
    cellSize: 4.0,        // 1セル（床ベイ）の一辺
    wallHeight: 4.6,      // 床から天井までの高さ（高くして開放感＋ムーディー）
    chunkCells: 8,        // 1チャンク = 8x8 セル
    viewChunks: 2,        // プレイヤー中心に ±2 チャンク保持（5x5）
    pillarSize: 1.0,      // 四角柱の一辺
    wallThickness: 0.3,   // 間仕切りの厚み（薄すぎ防止）
    seed: 0x9e3779b9,     // ワールド基準シード
    wallStyle: 'plain',   // 'plain'=無地の黄色壁 / 'wallpaper'=シェブロン壁紙
    vastCeilingHeight: 15,// 超レアな巨大ホールの天井高（とても高い）
  },

  // --- 配色（新パレット：明るい黄色） ---
  palette: {
    wall: [202, 191, 118],    // 淡い黄色の壁（彩度控えめ＝参照に近い）
    ceiling: [210, 202, 140], // 黄色の天井タイル
    carpet: [166, 157, 110],  // 温かいタン（カーキ）の絨毯
    pillar: 0xc6bd86,         // 柱（壁と同系の淡い黄色）
    trim: 0xcfc784,           // 巾木
  },

  // --- 迷路の開放度 ---
  maze: {
    wallDensity: 0.30,    // セル境界に壁が立つ確率（低い＝開放的）
    pillarChance: 0.55,   // 格子交点に柱が立つ確率
    deadLightChance: 0.06,// 蛍光灯が死んでいる（消灯）確率
    lightChance: 0.30,    // 天井タイルが光パネルである確率（疎＝強い明暗）
    // 広い開放ホール（チャンク単位でたまに出現）
    openHallChance: 0.30, // チャンクが開放ホールになる確率
    openWallDensity: 0.08,// ホール内の壁密度（疎）
    openPillarChance: 0.35,// ホール内の柱確率
    graffitiChance: 0.05, // 壁に落書きが付く確率
    propChance: 0.04,     // 開放ホールのセルに障害物が置かれる確率（点在程度）
    // 超レア：とても高い天井のとても広い「何もない」巨大ホール
    vastHallChance: 0.01, // チャンクが巨大ホールになる確率（超まれ）
    vastLightChance: 0.12,// 巨大ホールの高い天井に光パネルが付く確率（疎）
    // 特殊：床に穴が格子状に並ぶ「落とし穴の部屋」（落ちるとジャンプスケア）
    pitRoomChance: 0.01,   // チャンクが落とし穴部屋になる確率（テストは1.0に）
  },

  // --- プレイヤー ---
  player: {
    eyeHeight: 1.65,
    radius: 0.32,         // 衝突半径
    walkSpeed: 2.8,
    runSpeed: 4.2,
    accel: 12.0,
    damping: 9.0,
    bobFreq: 8.5,         // ヘッドボブ周波数
    bobAmp: 0.045,        // ヘッドボブ振幅
    mouseSensitivity: 1.0,
  },

  // --- 照明・霧（暖かい黄色だが明暗を効かせる） ---
  light: {
    fogColor: 0x6e6838,   // くすんだ暗めの黄色（奥を闇に沈める）
    fogNear: 8,
    fogFar: 48,           // 室内は見えるが遠景は闇に
    ambient: 0x4f4922,    // ベース環境光（低め＝暗い隅）
    ambientIntensity: 0.34,
    hemiSky: 0xc2b964,
    hemiGround: 0x6b6030,
    hemiIntensity: 0.3,
    panelColor: 0xfff6d8, // 蛍光灯の色（わずかに暖色）
    panelEmissive: 2.4,   // emissive 強度
    rectLightIntensity: 8.0, // 直下に強い光だまり→離れると急に落ちる（高コントラスト）
    rectLightPool: 12,    // 同時に有効化する面光源の最大数
    flickerChance: 0.08,  // 毎フレーム明滅判定の確率（不規則さ増）
    // 影を落とすスポットライト（最寄りパネルに追従）
    shadowLightPool: 3,   // 影付きライト数（負荷とのバランス）
    shadowLightIntensity: 20.0,
    shadowMapSize: 1024,
  },

  // --- ポストプロセス（VHS / 古いカムコーダー質感） ---
  fx: {
    renderScale: 0.92,         // 内部レンダ解像度（上げて鮮明に）
    bloomStrength: 0.5,        // 蛍光灯の柔らかいグロー
    bloomRadius: 0.7,
    bloomThreshold: 0.72,      // 高め＝光源だけ滲む
    blur: 0.4,                 // 横方向ソフトフォーカス量（平常時は控えめ）
    chromaBleed: 0.0009,       // 水平の色ずれ（VHSクロマ）
    chromatic: 0.001,          // 周辺の色収差
    distort: 0.06,             // レンズ歪み（緩い樽型）
    desat: 0.1,                // 脱色（控えめ）
    blackLift: 0.018,          // 黒の締まり（ムーディな深い影）
    scanline: 0.02,            // 走査線（ごく控えめ）
    vignette: 0.32,            // 周辺減光（ムーディ）
    shadowNoise: 0.0,          // 暗部のみのノイズ（0=無し）
    grade: [1.08, 1.04, 0.62], // RGB 乗算（暖かい黄色）
    aoRadius: 0.5,
    aoIntensity: 1.0,
  },

  // --- オーディオ ---
  audio: {
    humVolume: 0.32,
    droneVolume: 0.32,
    footVolume: 0.34,
    footStride: 1.9,      // この距離ごとに足音
  },

  // --- 敵（暗い人型の影。能動的ハンター／非致死＝SAN演出） ---
  entity: {
    enabled: true,
    maxCount: 1,          // 同時出現数
    height: 2.4,          // 影の高さ(m)
    width: 1.1,
    modelYawOffset: 0,    // FBXの前方向補正（向きが逆なら Math.PI）
    chaseAnimScale: 1.5,  // 追跡時のアニメ速度倍率
    wanderSpeed: 1.4,     // 徘徊速度
    chaseSpeed: 2.9,      // 追跡速度（走り4.2より遅め＝走れば逃げられる）
    spawnMinDist: 11,     // 出現はこの距離以遠
    spawnMaxDist: 22,
    despawnDist: 46,      // この距離超で消滅
    sightRange: 22,       // 視線索敵距離
    hearRange: 16,        // 走り足音の聴取距離
    contactDist: 1.6,     // 接触判定
    repathInterval: 0.5,  // 経路再計算間隔(s)
    loseTime: 7,          // 見失ってから徘徊に戻るまで(s)
    spawnInterval: 14,    // 不在時の出現試行間隔(s)
    // SAN（正気度・非致死）
    contactDamage: 30,    // 接触1回のSAN低下（大きめ）
    proximityRange: 11,   // この距離内＆追跡中でSANが漸減
    proximityDrain: 14,   // 漸減量/秒（速い）
    sanRegen: 2.6,        // 回復/秒（敵が遠いとき）
    contactCooldown: 3.5, // 接触演出のクールダウン(s)
    threatScale: 0.25,    // 低SANで敵が速くなる強さ（控えめ＝走りで逃げ切れる）
    panicSpeed: 0.35,     // 低SANでプレイヤーが速くなる割合（最大+35%）
    // 不意打ち出現（背後至近）＋突進
    ambushChance: 0.4,    // 出現が背後至近のアンビッシュになる確率
    ambushMinDist: 6,
    ambushMaxDist: 9,
    lungeDist: 4.5,       // この距離内＆視線ありで突進加速
    lungeSpeed: 3.9,      // 突進速度（走り4.2より僅かに遅い＝迫るが抜かれない）
    telegraphDist: 16,    // この距離以内で照明が予兆を見せる
    fleeDespawnTime: 8,   // 見失って遠ざかった状態がこの秒続くと消滅
    loomScale: 1.35,      // 突進/接触時に膨らむ最大倍率
  },

  // --- 異常ギミック ---
  anomaly: {
    reshuffleEnabled: true, // 引き返すと構造変化
    compassJitter: true,
    blackoutMinInterval: 28, // 暗転イベント最小間隔（秒）
    blackoutMaxInterval: 80,
  },
};

// 壁紙バリエーション（backrooms_wallpapers 由来。CC-BY-4.0 / Huuxloc）。
// ここを差し替えるだけで壁紙が変わる。BR_1 が参照画像に最も近い黄緑トーン。
export const WALLPAPER_VARIANTS = {
  BR_1: 'assets/textures/wallpapers/BR_1_baseColor.jpeg',
  BR_2: 'assets/textures/wallpapers/BR_2_baseColor.jpeg',
  BR_3: 'assets/textures/wallpapers/BR_3_baseColor.jpeg',
  dots: 'assets/textures/wallpapers/BR_Dots_baseColor.jpeg',
  stripes: 'assets/textures/wallpapers/BR_Stripes_baseColor.jpeg',
  colours: 'assets/textures/wallpapers/Colours_baseColor.jpeg',
  classicYellow: 'assets/textures/wallpapers/wallpaper_baseColor.jpeg',
  new1: 'assets/textures/wallpapers/NEW_WallPaper_baseColor.jpeg',
  new2: 'assets/textures/wallpapers/NEW_WallPaperTexture_baseColor.jpeg',
  new3: 'assets/textures/wallpapers/NEW_WallPaperTexture_2_baseColor.jpeg',
};
export const WALLPAPER_VARIANT = 'BR_1'; // ← 変えると壁紙が切替わる

// テクスチャのドロップイン先（存在しなければ仮テクスチャ生成）
export const TEXTURE_PATHS = {
  wallpaper: {
    map: WALLPAPER_VARIANTS[WALLPAPER_VARIANT],
    normal: 'assets/textures/wallpaper_normal.jpg',
    rough: 'assets/textures/wallpaper_rough.jpg',
  },
  carpet: {
    map: 'assets/textures/carpet_diffuse.jpg',
    normal: 'assets/textures/carpet_normal.jpg',
    rough: 'assets/textures/carpet_rough.jpg',
  },
  ceiling: {
    map: 'assets/textures/ceiling_diffuse.jpg',
    normal: 'assets/textures/ceiling_normal.jpg',
  },
  panel: {
    map: 'assets/textures/light_panel.jpg',
  },
};

export const AUDIO_PATHS = {
  hum: 'assets/audio/fluorescent_hum.mp3',
  drone: 'assets/audio/ambient_drone.mp3',
  footsteps: [
    'assets/audio/footstep_carpet_1.mp3',
    'assets/audio/footstep_carpet_2.mp3',
    'assets/audio/footstep_carpet_3.mp3',
    'assets/audio/footstep_carpet_4.mp3',
  ],
};
