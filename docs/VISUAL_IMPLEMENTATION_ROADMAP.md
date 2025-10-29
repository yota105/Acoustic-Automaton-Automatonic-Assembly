# Visual System Implementation Roadmap (Test Phase)

## 概要

Acoustic Automatonのビジュアルシステムを音響システムと同期させるための実装ロードマップ。
このフェーズはテスト段階として、基本的な同期機構と制御システムを構築する。

## 時間同期アーキテクチャ

### 時間管理の階層構造

```
AudioContext.currentTime (Master Clock)
    ↓
MusicalTimeManager (Musical Time → Audio Time)
    ↓
CompositionPlayer (Event Scheduling & Execution)
    ↓
BroadcastChannel (Cross-Window Communication)
    ↓
VisualSyncManager (Visual Time Synchronization)
    ↓
p5.js / Three.js Renderers
```

### 時間同期の方式

#### 1. AudioContext.currentTime を基準としたマスタークロック

**理由**: Web Audio APIの`AudioContext.currentTime`は高精度で安定したタイムスタンプを提供し、
音響イベントとビジュアルイベントの同期に最適。

```typescript
// マスタークロック基準の時間計算
const elapsedTime = audioContext.currentTime - startTime;
```

#### 2. Look-Ahead スケジューリング

**現在の実装**:
- `MusicalTimeManager`: 100ms先読み (lookAheadTime = 0.1)
- スケジューリング間隔: 10ms (scheduleTickInterval = 10)

**ビジュアルへの適用**:
- 同じlook-ahead方式でビジュアルイベントもスケジュール
- 音響と同じタイミング精度を保証

#### 3. 時間表現の統一

**Composition定義での時間指定**:

```typescript
// 音楽的時間 (推奨)
{
  type: 'musical',
  time: { bar: 4, beat: 2, subdivision: 0 }
}

// 絶対時間 (補助的)
{
  type: 'absolute',
  time: { seconds: 12.5 }
}

// キュー待ち (連鎖制御)
{
  type: 'cue',
  cueId: 'previous_event_id'
}
```

### 同期精度の保証

#### タイムスタンプの伝達

```typescript
interface VisualSyncMessage {
  type: 'visual-event' | 'playback-state' | 'time-sync';
  audioContextTime: number;      // AudioContext.currentTime
  musicalTime: {                 // 音楽的位置
    bar: number;
    beat: number;
    tempo: number;
  };
  sectionId: string;
  timestamp: number;              // performance.now() (参考用)
}
```

#### レイテンシー補正

1. **予測的レンダリング**: Look-ahead時間分先にスケジュール
2. **フレームレート独立**: `deltaTime`ベースのアニメーション更新
3. **時間クエリAPI**: Visualizerから現在時刻を逆参照可能

```typescript
// VisualSyncManagerでの時間取得
getCurrentAudioTime(): number {
  return this.audioContextTime + (performance.now() - this.lastSyncTimestamp) / 1000;
}
```

## 実装フェーズ

### Phase 1: 基盤構築

#### 1.1 型定義の拡張 ✅ (完了)

**ファイル**: `src/works/composition.ts`

- [x] `VisualEventParameters` 型を定義
- [x] イベントタイプに `'visual'` を追加

```typescript
export interface VisualEventParameters {
  scene?: string;                    // シーン識別子
  effect?: string;                   // エフェクト名
  colors?: string[];                 // カラーパレット
  intensity?: number;                // 強度 (0.0 - 1.0)
  transitionDuration?: number;       // トランジション時間（秒）
  parameters?: Record<string, any>;  // カスタムパラメータ
}
```

#### 1.2 CompositionPlayer 拡張 ⏳ (進行中)

**ファイル**: `src/performance/compositionPlayer.ts`

- [ ] `executeEvent()` でvisualイベントを認識
- [ ] BroadcastChannelでビジュアルイベントを送信
- [ ] AudioContext時間を含めたメッセージ構造

```typescript
private executeEvent(event: CompositionEvent): void {
  if (event.type === 'visual') {
    this.broadcastVisualEvent({
      eventId: event.id,
      action: event.action,
      parameters: event.parameters,
      audioContextTime: this.audioContext.currentTime,
      musicalTime: {
        bar: this.currentBar,
        beat: this.currentBeat,
        tempo: this.currentTempo
      },
      sectionId: this.currentSection,
      timestamp: performance.now()
    });
  }
}
```

#### 1.3 VisualSyncManager 作成

**ファイル**: `src/visualizers/visualSyncManager.ts`

**責務**:
- BroadcastChannelからイベント受信
- AudioContext時間との同期管理
- p5.js / Three.js への制御コマンド発行
- 再生状態管理 (playing / paused / stopped)

```typescript
export class VisualSyncManager {
  private channel: BroadcastChannel;
  private audioContextTime: number = 0;
  private lastSyncTimestamp: number = 0;
  private isEnabled: boolean = false;
  private isPlaying: boolean = false;
  
  // ビジュアルレンダラー参照
  private p5Visualizer: P5Visualizer | null = null;
  private threeVisualizer: ThreeJSVisualizer | null = null;
  
  constructor() {
    this.setupBroadcastChannel();
  }
  
  // タイムスタンプ同期
  private syncTime(audioContextTime: number): void {
    this.audioContextTime = audioContextTime;
    this.lastSyncTimestamp = performance.now();
  }
  
  // 現在の推定AudioContext時間
  getCurrentAudioTime(): number {
    const elapsedMs = performance.now() - this.lastSyncTimestamp;
    return this.audioContextTime + (elapsedMs / 1000);
  }
}
```

### Phase 2: 制御システム構築

#### 2.1 Performance ページにコントロール追加

**ファイル**: `src/performance.html`

```html
<!-- Visual Control Panel -->
<div class="control-panel">
  <h2>Visual Controls</h2>
  <div class="button-group">
    <button id="toggle-visuals-btn" class="primary">Enable Visuals</button>
    <button id="open-visualizer-btn">Open Visualizer Window</button>
  </div>
  <div class="status-info">
    <span class="label">Visual Status:</span>
    <span id="visual-status" class="value">Disabled</span>
  </div>
</div>
```

**ファイル**: `src/performance.ts`

```typescript
private visualsEnabled: boolean = false;

private setupVisualControls(): void {
  const toggleBtn = document.getElementById('toggle-visuals-btn');
  toggleBtn?.addEventListener('click', () => this.toggleVisuals());
}

private toggleVisuals(): void {
  this.visualsEnabled = !this.visualsEnabled;
  
  // Visualizerに状態を送信
  this.broadcastPerformanceMessage({
    type: 'visual-enable',
    enabled: this.visualsEnabled,
    timestamp: Date.now()
  });
  
  this.updateVisualStatus();
}
```

#### 2.2 Visualizer 待機状態の実装

**ファイル**: `src/visualizer.ts`

```typescript
// 初期状態: ビジュアル無効、黒画面
window.visualizerManager.setEnabled(false);

// BroadcastChannelで制御を受信
const channel = new BroadcastChannel('performance-control');
channel.addEventListener('message', (event) => {
  if (event.data.type === 'visual-enable') {
    window.visualizerManager.setEnabled(event.data.enabled);
  }
});
```

**ファイル**: `src/visualizers/visualizerManager.ts`

```typescript
export class VisualizerManager {
  private enabled: boolean = false;
  
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    
    if (!enabled) {
      // 黒画面表示、アニメーション停止
      this.threeJSVisualizer.stopAnimation();
      this.p5Visualizer.stop();
      this.clearScreen();
    } else {
      // アニメーション開始許可
      // 実際の開始は play イベントで
    }
  }
  
  private clearScreen(): void {
    // 黒画面表示
    this.threeJSVisualizer.clearToBlack();
    this.p5Visualizer.clearToBlack();
  }
}
```

### Phase 3: テストビジュアルの実装

#### 3.1 同期テスト用シーンの作成

**目的**: 音とビジュアルの同期精度を視覚的に確認

**実装内容**:

1. **BPM同期回転立方体** (Three.js)
   - 1拍ごとに90度回転
   - テンポ変化に追従
   
2. **拍カウンター表示** (p5.js)
   - 小節番号と拍番号をテキスト表示
   - 拍ごとに背景色フラッシュ

**ファイル**: `src/visualizers/scenes/syncTestScene.ts`

```typescript
export class SyncTestScene {
  private cube: THREE.Mesh;
  private targetRotation: number = 0;
  
  onBeat(bar: number, beat: number, tempo: number): void {
    // 拍ごとに90度回転
    this.targetRotation += Math.PI / 2;
    
    // スムーズな回転アニメーション
    gsap.to(this.cube.rotation, {
      y: this.targetRotation,
      duration: 60 / tempo,  // 1拍分の時間
      ease: 'power2.out'
    });
  }
  
  update(audioTime: number, deltaTime: number): void {
    // フレームレート独立の更新
  }
}
```

#### 3.2 イベント駆動ビジュアルのテスト

**作品定義への追加**: `src/works/composition.ts`

```typescript
// Section A Intro にビジュアルイベントを追加
{
  id: 'visual_test_rotation',
  type: 'visual',
  at: { type: 'musical', time: { bar: 1, beat: 1 } },
  action: 'start_rotation',
  parameters: {
    scene: 'sync_test',
    colors: ['#ff0000', '#00ff00', '#0000ff'],
    intensity: 0.8
  }
},
{
  id: 'visual_test_color_change',
  type: 'visual',
  at: { type: 'musical', time: { bar: 5, beat: 1 } },
  action: 'change_color',
  parameters: {
    colors: ['#ffff00', '#ff00ff'],
    transitionDuration: 2.0
  }
}
```

### Phase 4: 統合とデバッグ

#### 4.1 同期精度の計測

**実装内容**:

```typescript
// ビジュアルイベントのタイミングログ
interface VisualTimingLog {
  eventId: string;
  scheduledAudioTime: number;
  actualReceiveTime: number;
  actualRenderTime: number;
  latencyMs: number;
}

// 統計情報の収集
class VisualSyncDebugger {
  private logs: VisualTimingLog[] = [];
  
  logEvent(log: VisualTimingLog): void {
    this.logs.push(log);
    console.log(`[VISUAL_SYNC] Event: ${log.eventId}, Latency: ${log.latencyMs.toFixed(2)}ms`);
  }
  
  getStats(): {
    meanLatency: number;
    maxLatency: number;
    minLatency: number;
  } {
    // 統計計算
  }
}
```

#### 4.2 デバッグUI

**Performance ページにデバッグパネル追加**:

```html
<div class="debug-panel" id="visual-debug-panel" style="display: none;">
  <h3>Visual Sync Debug</h3>
  <div class="debug-stats">
    <div>Mean Latency: <span id="debug-mean-latency">--</span> ms</div>
    <div>Max Latency: <span id="debug-max-latency">--</span> ms</div>
    <div>Events Processed: <span id="debug-event-count">--</span></div>
    <div>Audio Time: <span id="debug-audio-time">--</span> s</div>
  </div>
</div>
```

#### 4.3 レイテンシー補正

**問題**: BroadcastChannelの伝送遅延、requestAnimationFrameのタイミング

**解決策**:

1. **予測的スケジューリング**: Look-ahead時間分早くイベント送信
2. **補間アニメーション**: 次の状態への滑らかな遷移
3. **時間ドリフト補正**: 定期的にAudioContext時間を再同期

```typescript
// Look-ahead送信
private scheduleVisualEvent(event: CompositionEvent, audioTime: number): void {
  const lookAheadTime = 0.1; // 100ms
  const sendTime = audioTime - lookAheadTime;
  
  // sendTime に達したら送信
  this.scheduleCallback(sendTime, () => {
    this.broadcastVisualEvent({
      ...event,
      scheduledAudioTime: audioTime,
      lookAhead: lookAheadTime
    });
  });
}
```

## テストシナリオ

### Test 1: 基本同期テスト

1. Performance ページで "Enable Visuals" をクリック
2. Visualizer が黒画面から待機状態に移行することを確認
3. "Play" ボタンをクリック
4. カウントダウン後、ビジュアルが開始することを確認
5. 回転立方体が拍に同期して回転することを確認

### Test 2: イベント同期テスト

1. Section A を再生
2. 定義されたビジュアルイベントが正しいタイミングで発火することを確認
3. 色変化、エフェクト変化が音響イベントと同期していることを確認

### Test 3: テンポ変化追従テスト

1. テンポ変化のあるセクションを再生
2. ビジュアルアニメーションがテンポ変化に追従することを確認
3. 小節・拍の表示が正確であることを確認

### Test 4: 再生制御テスト

1. 再生中に "Pause" をクリック
2. ビジュアルが一時停止することを確認
3. "Resume" でビジュアルも再開することを確認
4. "Stop" でビジュアルが停止し、待機画面に戻ることを確認

### Test 5: レイテンシー計測

1. デバッグパネルを表示
2. 再生中のレイテンシー統計を確認
3. 平均レイテンシーが 20ms 以下であることを確認
4. 最大レイテンシーが 50ms 以下であることを確認

## 成功基準

- ✅ ビジュアルが音響再生と同期して開始・停止する
- ✅ 拍同期のアニメーションが視覚的にズレを感じない（<20ms）
- ✅ イベント駆動のビジュアル変化が正確なタイミングで発生する
- ✅ テンポ変化にビジュアルが追従する
- ✅ Performance ページから完全に制御可能
- ✅ 複数ウィンドウ間の状態同期が機能する

## 次のステップ（テスト後）

1. **作品固有ビジュアルの実装**
   - Section A 専用のビジュアルシーン設計
   - 音響処理結果（周波数解析など）の可視化

2. **高度なシーン管理**
   - シーン遷移システム
   - マルチレイヤーコンポジション

3. **インタラクティブ要素**
   - 演奏者入力への視覚的フィードバック
   - リアルタイム音響解析との連動

4. **パフォーマンス最適化**
   - 60fps 安定化
   - GPU負荷の最適化
   - メモリ使用量の監視

## ファイル構成

```
src/
├── visualizers/
│   ├── visualizerManager.ts          # [修正] 有効/無効制御追加
│   ├── visualSyncManager.ts          # [新規] 同期管理
│   ├── p5Visualizer.ts                # [修正] 制御API追加
│   ├── threeJSVisualizer.ts           # [修正] 制御API追加
│   └── scenes/
│       └── syncTestScene.ts           # [新規] テストシーン
├── performance/
│   └── compositionPlayer.ts           # [修正] visualイベント処理
├── performance.html                   # [修正] Visual Controls追加
├── performance.ts                     # [修正] ビジュアル制御ロジック
├── visualizer.html                    # [修正] 初期状態変更
├── visualizer.ts                      # [修正] 同期管理統合
└── works/
    └── composition.ts                 # [修正] ビジュアルイベント定義
```

## 実装順序

1. ✅ 型定義拡張（composition.ts）
2. ⏳ CompositionPlayer 拡張
3. ⏳ VisualSyncManager 作成
4. ⏳ Performance ページコントロール追加
5. ⏳ Visualizer 待機状態実装
6. ⏳ テストシーン実装
7. ⏳ 統合テスト
8. ⏳ デバッグとチューニング

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-29  
**Status**: Test Phase Design
