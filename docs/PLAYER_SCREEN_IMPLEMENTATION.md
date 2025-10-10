# プレイヤー画面実装ドキュメント

## 概要

このドキュメントでは、奏者用画面（Player Screen）の実装詳細と、コントローラーとの通信仕様について説明します。

## ファイル構成

### 主要ファイル
- `src/player.html` - 奏者用画面のHTML構造
- `src/player.ts` - 奏者用画面のロジック
- `src/playerScreenTestControls.ts` - テスト用コントロール（開発用）
- `src/controller.html` - コントローラー画面（テストボタン含む）

## URL パラメータ

奏者用画面は、URLパラメータで奏者を識別します。

```
/src/player.html?player=1  # 奏者1の画面
/src/player.html?player=2  # 奏者2の画面
/src/player.html?player=3  # 奏者3の画面
```

### TypeScript側の取得方法

```typescript
const params = new URLSearchParams(window.location.search);
const playerNumber = params.get('player') || '1';
```

## BroadcastChannel 通信仕様

### チャンネル名
```typescript
const channel = new BroadcastChannel('performance-control');
```

### メッセージ形式

すべてのメッセージは以下の形式で送信されます：

```typescript
{
  type: string,    // メッセージタイプ（下記参照）
  data: object     // メッセージデータ
}
```

### サポートされるメッセージタイプ

#### 1. `metronome-pulse` - メトロノームパルス

メトロノームを光らせるトリガー。

**送信例:**
```typescript
channel.postMessage({
  type: 'metronome-pulse',
  data: {}
});
```

**player.ts での処理:**
```typescript
case 'metronome-pulse':
  triggerMetronomePulse();
  console.log('Metronome pulse triggered');
  break;
```

**視覚効果:**
- メトロノームエリアが一瞬緑色に光る
- 0.3秒かけて減衰
- アニメーション中は2重発火を防止

---

#### 2. `rehearsal-mark` - 練習番号更新

練習番号（Intro, A, B, C...）を更新します。

**送信例:**
```typescript
channel.postMessage({
  type: 'rehearsal-mark',
  data: { mark: 'A' }
});
```

**データ形式:**
```typescript
{
  mark: string  // 練習番号（例: 'Intro', 'A', 'B', 'Coda'など）
}
```

**player.ts での処理:**
```typescript
case 'rehearsal-mark':
  if (data.mark !== undefined) {
    updateRehearsalMark(data.mark);
    console.log(`Rehearsal mark updated to: ${data.mark}`);
  }
  break;
```

**表示位置:**
ヘッダー右上に大きく表示されます。

---

#### 3. `countdown` - カウントダウン表示

円形ゲージでカウントダウンを表示します。

**送信例:**
```typescript
// 4小節前からのカウントダウン
channel.postMessage({
  type: 'countdown',
  data: { bars: 4, beats: 0 }
});

// 3拍前からのカウントダウン
channel.postMessage({
  type: 'countdown',
  data: { bars: 0, beats: 3 }
});
```

**データ形式:**
```typescript
{
  bars: number,   // 残り小節数
  beats: number   // 残り拍数
}
```

**player.ts での処理:**
```typescript
case 'countdown':
  if (data.bars !== undefined || data.beats !== undefined) {
    showCountdown(data.bars || 0, data.beats || 0);
    console.log(`Countdown: ${data.bars} bars, ${data.beats} beats`);
  }
  break;
```

**視覚効果:**
- 円形ゲージに数字が表示される
- 小節数が多い場合: 黄色（`#FFEB3B`）
- 小節数が少ない場合: オレンジ（`#FFA505`）
- 拍数カウント: 赤（`#f44336`）

---

#### 4. `elapsed-time` - 経過時間更新

演奏開始からの経過時間を更新します。

**送信例:**
```typescript
channel.postMessage({
  type: 'elapsed-time',
  data: { seconds: 120 }  // 2分経過
});
```

**データ形式:**
```typescript
{
  seconds: number  // 経過秒数
}
```

**player.ts での処理:**
```typescript
case 'elapsed-time':
  if (data.seconds !== undefined) {
    updateElapsedTime(data.seconds);
  }
  break;
```

**表示形式:**
`MM:SS` 形式（例: `02:15`）

---

## JavaScript/TypeScript から直接送信する方法

### 基本的な送信方法

```typescript
// BroadcastChannelインスタンスを作成
const performanceChannel = new BroadcastChannel('performance-control');

// メッセージを送信
performanceChannel.postMessage({
  type: 'metronome-pulse',
  data: {}
});
```

### 便利な関数（playerScreenTestControls.ts）

開発・テスト用に、以下の関数がグローバルスコープにエクスポートされています：

```typescript
// メトロノームパルスを送信
sendMetronomePulse();

// 練習番号を更新
sendRehearsalMark('A');
sendRehearsalMark('Intro');
sendRehearsalMark('Coda');

// カウントダウンを表示
sendCountdown(4, 0);  // 4小節前
sendCountdown(0, 3);  // 3拍前

// 経過時間を更新
sendElapsedTime(120);  // 2分経過
```

### コンソールからの使用例

ブラウザのコンソールで直接実行可能：

```javascript
// メトロノームを光らせる
sendMetronomePulse();

// 練習番号をAに変更
sendRehearsalMark('A');

// 4小節前からカウントダウン
sendCountdown(4, 0);
```

---

## UI要素とID対応表

### HTML要素のID

| ID | 説明 | 更新関数 |
|---|---|---|
| `player-id` | 奏者番号（Player 1など） | 初期化時に設定 |
| `section-info` | セクション情報 | - |
| `rehearsal-mark` | 練習番号（Intro, A, B...） | `updateRehearsalMark()` |
| `elapsed-time` | 経過時間（MM:SS） | `updateElapsedTime()` |
| `metronome` | メトロノームパルス表示 | `triggerMetronomePulse()` |
| `countdown-canvas` | カウントダウンゲージ | `showCountdown()` |

### CSS クラス

| クラス名 | 用途 |
|---|---|
| `.pulse` | メトロノームアニメーション用 |
| `.section-display` | セクション表示コンテナ |
| `.current` | 現在演奏中のセクション |
| `.upcoming` | 次に演奏するセクション |

---

## メトロノーム実装詳細

### CSS アニメーション

```css
#metronome.pulse {
    animation: metronomePulse 0.3s ease-out;
}

@keyframes metronomePulse {
    0% {
        background: #4CAF50;  /* 緑色 */
    }
    100% {
        background: #fafafa;  /* 元の色 */
    }
}
```

### TypeScript ロジック

```typescript
const metronomeEl = document.getElementById('metronome');
let isAnimating = false;

// アニメーション終了イベントでクリーンアップ
if (metronomeEl) {
  metronomeEl.addEventListener('animationend', () => {
    metronomeEl.classList.remove('pulse');
    isAnimating = false;
  });
}

function triggerMetronomePulse() {
  if (!metronomeEl) return;
  
  // 既にアニメーション中の場合は無視（2重発火を防止）
  if (isAnimating) {
    console.log('Metronome pulse skipped (already animating)');
    return;
  }
  
  // アニメーション開始
  isAnimating = true;
  
  // 既存のクラスを削除してリセット（force reflow）
  metronomeEl.classList.remove('pulse');
  void metronomeEl.offsetWidth; // リフローを強制
  
  // パルスクラスを追加
  metronomeEl.classList.add('pulse');
  console.log('Metronome pulse triggered');
}
```

**特徴:**
- `isAnimating`フラグで2重発火を防止
- `animationend`イベントで確実にクリーンアップ
- `void metronomeEl.offsetWidth`でリフローを強制し、アニメーションを確実にリスタート
- アニメーション時間: 0.3秒（200 BPMまで対応可能）

---

## カウントダウンゲージ実装詳細

### CircularGauge クラス

```typescript
class CircularGauge {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private centerX: number = 0;
  private centerY: number = 0;
  private radius: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context not available');
    this.ctx = context;
    this.setupCanvas();
  }

  // 高DPI対応のCanvasセットアップ
  private setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    
    this.ctx.scale(dpr, dpr);
    
    this.centerX = rect.width / 2;
    this.centerY = rect.height / 2;
    this.radius = Math.min(rect.width, rect.height) / 2 - 10;
  }

  // ゲージの描画
  draw(progress: number, text: string, color: string = '#FFA500') {
    // Canvasをクリア
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // 背景の円
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 8;
    this.ctx.stroke();
    
    // プログレスの円弧（時計回りに減少）
    if (progress > 0) {
      this.ctx.beginPath();
      this.ctx.arc(
        this.centerX, 
        this.centerY, 
        this.radius, 
        -Math.PI / 2,  // 12時の位置から開始
        -Math.PI / 2 + (Math.PI * 2 * progress),  // 時計回りに進行
        false
      );
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 8;
      this.ctx.stroke();
    }
    
    // テキストの描画
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.font = 'bold 24px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const y = this.centerY + (index - (lines.length - 1) / 2) * 30;
      this.ctx.fillText(line, this.centerX, y);
    });
  }
}
```

### カウントダウン表示関数

```typescript
function showCountdown(barsRemaining: number, beatsRemaining: number) {
  if (!countdownGauge) return;

  let text = '';
  let progress = 0;
  let color = '#FFA500';

  if (barsRemaining > 0) {
    // 小節ベースのカウントダウン
    text = `${barsRemaining}\nbars`;
    progress = Math.min(barsRemaining / 8, 1); // 8小節を最大と仮定
    color = barsRemaining > 2 ? '#FFEB3B' : '#FFA500';
  } else if (beatsRemaining > 0) {
    // 拍ベースのカウントダウン
    text = `${beatsRemaining}\nbeats`;
    progress = beatsRemaining / 4; // 4拍を最大と仮定
    color = '#f44336';
  } else {
    // カウントダウン終了
    text = 'NOW!';
    progress = 0;
    color = '#4CAF50';
  }

  countdownGauge.draw(progress, text, color);
}
```

**カラースキーム:**
- 小節数 > 2: `#FFEB3B`（黄色）
- 小節数 ≤ 2: `#FFA500`（オレンジ）
- 拍カウント: `#f44336`（赤）
- NOW!: `#4CAF50`（緑）

---

## テストコントロール（開発用）

### テストボタンの配置

`src/controller.html` に以下のテストボタンがあります：

| ボタン | ID | 機能 |
|---|---|---|
| Trigger Metronome Pulse | `test-pulse` | メトロノームを光らせる |
| Next Rehearsal Mark | `test-rehearsal` | 練習番号を順番に変更 |
| Show Countdown (4 bars) | `test-countdown` | 4小節前からカウントダウン |

### 練習番号の順序

`test-rehearsal` ボタンは以下の順序で練習番号を変更します：

```typescript
const rehearsalMarks = ['Intro', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
```

クリックするたびに、Intro → A → B → C → ... と進みます。

### 本番環境での削除

テストコントロールは開発・デバッグ用です。本番環境では以下を削除してください：

1. **controller.html**: `<!-- プレイヤー画面テストコントロール -->` ブロックを削除
2. **controller.ts**: `import { setupPlayerScreenTestControls }` を削除
3. **playerScreenTestControls.ts**: ファイル全体を削除

詳細は `docs/PLAYER_SCREEN_TEST_CONTROLS.md` を参照してください。

---

## レスポンシブデザイン

### clamp() 関数の使用

すべてのサイズは `clamp()` 関数で可変設定されています：

```css
font-size: clamp(最小値, 推奨値, 最大値);
```

**例:**
```css
#player-id {
    font-size: clamp(1.25rem, 3vh, 2rem);
}
```

これにより、A4タブレットやiPadの縦画面など、様々なサイズに対応します。

### 主要要素のサイズ設定

| 要素 | サイズ設定 |
|---|---|
| プレイヤーID | `clamp(1.25rem, 3vh, 2rem)` |
| セクション情報 | `clamp(0.875rem, 2vh, 1.25rem)` |
| 練習番号 | `clamp(1rem, 2.5vh, 1.5rem)` |
| 経過時間 | `clamp(0.75rem, 2vh, 1rem)` |
| メトロノーム高さ | `clamp(30px, 5vh, 50px)` |
| カウントダウンエリア | `clamp(80px, 12vh, 120px)` |

---

## パフォーマンスの考慮事項

### メトロノームパルス
- 最大200 BPM対応（0.3秒間隔）
- 2重発火防止機構により、連続クリックでも安定
- CSSアニメーションのみ使用（JavaScriptアニメーションなし）

### Canvasレンダリング
- 高DPI対応（Retinaディスプレイ対応）
- requestAnimationFrameは未使用（必要時のみ描画）

### BroadcastChannel
- 同一オリジン内の全タブで通信可能
- ローカル通信のため遅延なし

---

## 今後の拡張予定

### 実装予定の機能
1. 楽譜表示（VexFlowなど）
2. 音楽表現指示の表示
3. 解釈テキストの表示
4. セクション切り替えアニメーション
5. Musical Time Managerとの統合

### メッセージタイプの追加候補
- `section-change`: セクション変更
- `score-display`: 楽譜データ表示
- `expression-text`: 音楽表現指示テキスト
- `tempo-change`: テンポ変更表示

---

## トラブルシューティング

### メトロノームが光らない
1. BroadcastChannelの名前が一致しているか確認（`performance-control`）
2. コンソールでエラーがないか確認
3. `triggerMetronomePulse()`が呼ばれているか確認（コンソールログ）

### 練習番号が更新されない
1. `data.mark`が文字列として正しく送信されているか確認
2. `rehearsal-mark`要素がHTMLに存在するか確認
3. コンソールログで受信を確認

### カウントダウンが表示されない
1. `countdown-canvas`要素が存在するか確認
2. Canvasのサイズが正しく設定されているか確認
3. `countdownGauge`インスタンスが正しく初期化されているか確認

---

## 参考リンク

- [PLAYER_SCREEN_DESIGN.md](./PLAYER_SCREEN_DESIGN.md) - 設計ドキュメント
- [PLAYER_SCREEN_TEST_CONTROLS.md](./PLAYER_SCREEN_TEST_CONTROLS.md) - テストコントロール詳細
- [MDN - BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [MDN - Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
