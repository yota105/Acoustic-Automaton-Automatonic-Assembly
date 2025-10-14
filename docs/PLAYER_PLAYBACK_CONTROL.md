# プレイヤーメニュー再生ボタンの接続状況

## 現状

### 実装済み
✅ **Player側 (`src/player.ts`)**
- ハンバーガーメニューに「Start Performance」ボタンを追加
- `auth-config.json` の `playerCanControlPlayback` で表示/非表示を制御
- ボタンクリック時に `player-request-start` メッセージを送信

✅ **CompositionPlayer側 (`src/performance/compositionPlayer.ts`)**
- `player-request-start` メッセージを受信する処理を追加
- 受信時に最初のセクションで再生を開始

### 未接続の問題
❌ **Controller画面での初期化**
- `controller.html` / `controller.ts` では CompositionPlayer が初期化されていない
- 再生機能は `performance.html` / `performance.ts` でのみ利用可能

## 動作フロー

### 現在の状況
```
Player画面 (player.html)
  └─ ハンバーガーメニュー
      └─ 「Start Performance」ボタン
          └─ 'player-request-start' メッセージ送信
              └─ ❌ Controller画面が受信できない
                   (CompositionPlayerが初期化されていないため)
```

### 必要な構成
```
Performance画面 (performance.html) を開く
  └─ CompositionPlayer が初期化される
      └─ メッセージリスナーが設定される
          └─ Player からの 'player-request-start' を受信
              └─ ✅ 再生が開始される
```

## 解決方法

### オプション1: Performance画面を使用する（推奨・最も簡単）
1. Controller役のユーザーが `/src/performance.html` を開く
2. Playerメニューの再生ボタンが正常に動作する

**メリット:**
- 追加実装不要
- すぐに使用可能

**デメリット:**
- Controller画面とPerformance画面が分離している

### オプション2: Controller画面にCompositionPlayerを統合する
`controller.ts` に CompositionPlayer を組み込み、Controller画面でも再生制御を可能にする。

**実装内容:**
```typescript
// src/controller.ts に追加
import { CompositionPlayer } from './performance/compositionPlayer';

let compositionPlayer: CompositionPlayer | null = null;

async function initializeCompositionPlayer() {
  const globalAudio = (window as any);
  const audioContext = globalAudio.audioCtx || globalAudio.audioContext;
  
  if (!audioContext) {
    console.warn('AudioContext not available');
    return;
  }
  
  compositionPlayer = new CompositionPlayer(audioContext);
  await compositionPlayer.initialize();
  console.log('✅ CompositionPlayer initialized in Controller');
}

// Audio初期化後に呼び出す
```

**メリット:**
- Controller画面だけで完結
- UIの一元化

**デメリット:**
- 追加実装が必要
- Controller画面が重くなる可能性

### オプション3: 専用のWebSocketサーバーを立てる
中央サーバーで CompositionPlayer を管理し、全クライアントから制御可能にする。

**メリット:**
- どの画面からでも制御可能
- 状態の一元管理

**デメリット:**
- サーバー実装が必要（最も複雑）
- `runtime-config.json` で `enableRemoteSync: true` が必要

## 推奨される使い方

### リハーサル・開発時
```json
// auth-config.json
{
  "authRequired": false,
  "playerCanControlPlayback": true
}
```

**使用手順:**
1. Controller役のユーザーが `/src/performance.html` を開く
2. Player役のユーザーが `/src/player.html?player=1` (など) を開く
3. Playerのハンバーガーメニューから「Start Performance」で開始

### 本番環境
```json
// auth-config.json
{
  "authRequired": true,
  "controllerPassword": "...",
  "playerPassword": "...",
  "playerCanControlPlayback": false
}
```

- Performance画面から制御
- Playerは受け身で演奏指示を受け取るのみ

## 次のステップ

すぐに使用したい場合:
- **Performance画面 (`/src/performance.html`) を使用してください**

Controller画面で再生したい場合:
- オプション2の実装を進めます（追加作業が必要）

分散制御が必要な場合:
- オプション3のWebSocketサーバー実装を検討します
