# プレイヤー画面テストコントロール

## 概要
このモジュールは開発・デバッグ用です。コントローラー画面からBroadcastChannel経由で奏者用画面（player.html）に信号を送り、動作をテストします。

## ファイル構成
- `src/playerScreenTestControls.ts` - テストコントロールのロジック
- `src/controller.html` - テストボタンのUI（287-320行目付近）
- `src/controller.ts` - テストコントロールの初期化（30行目と3269行目付近）

## 提供される機能

### UIボタン
- **Trigger Metronome Pulse** (緑): メトロノームを光らせる
- **Increment Bar Number** (青): 小節番号を増やす
- **Show Countdown (4 bars)** (オレンジ): カウントダウンを表示

### プログラムから呼び出し可能な関数
```typescript
// コンソールまたはコードから直接呼び出し可能
sendMetronomePulse();           // メトロノームパルスを送信
sendBarUpdate(5);               // 小節番号を5に更新
sendCountdown(4, 0);            // 4小節前からカウントダウン
sendElapsedTime(120);           // 経過時間を120秒に設定
```

## 本番環境での削除方法

### 手順1: TypeScriptファイルの修正
`src/controller.ts`から以下の2箇所を削除またはコメントアウト：

```typescript
// 1. インポート文を削除（約30行目）
// import { setupPlayerScreenTestControls } from './playerScreenTestControls';

// 2. 初期化ブロックを削除（約3269行目）
/*
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPlayerScreenTestControls);
} else {
  setupPlayerScreenTestControls();
}
*/
```

### 手順2: HTMLファイルの修正
`src/controller.html`から以下のブロックを削除（約287-320行目）：

```html
<!-- ============================================ -->
<!-- 開発・デバッグ用: プレイヤー画面テストコントロール -->
<!-- ... -->
<!-- ============================================ -->
```

### 手順3: ファイルの削除
不要になったら以下のファイルを削除：
- `src/playerScreenTestControls.ts`
- `docs/PLAYER_SCREEN_TEST_CONTROLS.md`（このファイル）

## BroadcastChannelメッセージ仕様

チャンネル名: `performance-control`

### メッセージ形式
```typescript
{
  type: string,  // メッセージタイプ
  data: object   // メッセージデータ
}
```

### サポートされるメッセージタイプ

#### `metronome-pulse`
メトロノームパルスをトリガー
```typescript
{ type: 'metronome-pulse', data: {} }
```

#### `bar-update`
小節番号を更新
```typescript
{ type: 'bar-update', data: { bar: number } }
```

#### `countdown`
カウントダウンを表示
```typescript
{ type: 'countdown', data: { bars: number, beats: number } }
```

#### `elapsed-time`
経過時間を更新
```typescript
{ type: 'elapsed-time', data: { seconds: number } }
```

## 今後の拡張

新しいテストコントロールを追加する場合：

1. `playerScreenTestControls.ts`に新しい関数を追加
2. `controller.html`に新しいボタンを追加
3. 必要に応じて`player.ts`に新しいメッセージタイプハンドラを追加

---

**重要**: 本番環境にデプロイする前に、必ずこのテスト機能を削除してください。
