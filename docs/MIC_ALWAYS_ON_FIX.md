# マイク入力の常時出力問題 - 最終修正

## 問題の根本原因

マイク入力が常に音を出していた原因は**3箇所の接続**でした:

### 1. MicRouter内の接続
```typescript
// 問題: source → gainNode → mixerNode
source.connect(gainNode);
gainNode.connect(this.mixerNode);
```

### 2. audioCore.tsでの接続
```typescript
// 問題: micRouter.mixerNode → faustNode
micRouter.connectOutput(node);
```

### 3. BusManager経由の接続
```typescript
// 問題: mixerNode → destination
this.mixerNode.connect(outputNode);
```

## 実施した修正

### ✅ 修正1: MicRouter - ソースの接続を完全に削除
**ファイル**: `src/engine/audio/devices/micRouter.ts`

```typescript
// 修正前
source.connect(gainNode);
gainNode.connect(this.mixerNode);

// 修正後
// sourceはどこにも接続しない
console.log(`⚠️ IMPORTANT: Mic source NOT connected to any output`);
```

**理由**: マイクソースは、PerformanceTrackManager経由でのみ使用される

### ✅ 修正2: connectOutput を無効化
**ファイル**: `src/engine/audio/devices/micRouter.ts`

```typescript
connectOutput(outputNode: AudioNode): void {
    console.log(`⚠️ connectOutput called but IGNORED (new track-based routing system)`);
    console.log(`ℹ️ Mics will route through PerformanceTrackManager instead`);
    this.outputNode = outputNode; // 記録のみ、接続しない
}
```

**理由**: 旧システムとの互換性のためメソッドは残すが、実際の接続は行わない

### ✅ 修正3: audioCore.ts - MicRouter接続を削除
**ファイル**: `src/engine/audio/core/audioCore.ts`

```typescript
// 修正前
micRouter.connectOutput(node);

// 修正後
console.log("⚠️ MicRouter found but NOT connecting to Faust node");
console.log("ℹ️ Mic inputs will route through PerformanceTrackManager instead");
```

**理由**: Faustノードへの直接接続を防ぐ

## 新しいオーディオフロー

### 旧システム (修正前)
```
┌─────────────┐
│ Mic Enable  │
└──────┬──────┘
       ↓
┌──────────────────────────────────────────┐
│ MediaStreamSource                         │
└──────┬───────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ GainNode                                  │
└──────┬───────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ MixerNode                                 │
└──────┬───────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ FaustNode / Output                        │
│ → 常に音が出る！                          │
└──────────────────────────────────────────┘
```

### 新システム (修正後)
```
┌─────────────┐
│ Mic Enable  │
└──────┬──────┘
       ↓
┌──────────────────────────────────────────┐
│ MediaStreamSource (登録のみ、接続なし)    │
└──────────────────────────────────────────┘
       ↑
       │ 参照のみ
       │
┌──────┴──────────────────────────────────┐
│ MicInputGateManager                      │
│ - performerMicSources.set(id, source)    │
└──────────────────────────────────────────┘
       ↓
   パフォーマンスキュー発行
       ↓
┌──────────────────────────────────────────┐
│ openGateForPerformance()                  │
│ 1. 新GateNode作成                         │
│ 2. source.connect(gateNode)              │
│ 3. PerformanceTrack作成                   │
└──────┬───────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ MediaStreamSource                         │
└──────┬───────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ GateNode (gain: 0 → 1 → 0)               │
└──────┬───────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ TrackGainNode                             │
└──────┬───────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ Reverb → Master Output                    │
│ → ゲートが開いている時のみ音が出る！      │
└──────────────────────────────────────────┘
```

## テスト手順

### 1. ページリロード
1. ブラウザをリロード
2. コンソールで以下のログを確認:
   ```
   [MicRouter] Initialized with isolated mixer (track-based routing only)
   [audioCore] ⚠️ MicRouter found but NOT connecting to Faust node
   [audioCore] ℹ️ Mic inputs will route through PerformanceTrackManager instead
   ```

### 2. マイクを有効にする
1. Logic Inputs UIで `Mic 1: Enable` をクリック
2. コンソールで以下のログを確認:
   ```
   [MicRouter] Adding mic input: 1 (Microphone)
   [MicRouter] ⚠️ IMPORTANT: Mic source NOT connected to any output (track-based routing only)
   [MicRouter] Registered mic source for performer_1
   [MicRouter] ⚠️ Set mic 1 enabled: true (legacy method, audio routing controlled by track gates)
   [MicRouter] ℹ️ Mic 1 is registered. Audio will play only when performance cues trigger track gates.
   ```

### 3. 音が出ないことを確認
- **期待される動作**: マイクをEnableにしても**音は出ない**
- マイクに向かって話しても何も聞こえない
- これは**正常な動作**です

### 4. Section A を開始
1. Composition Playerで Section A を開始
2. 数秒後、パフォーマンスキューが発行される
3. コンソールで以下のログを確認:
   ```
   [MicInputGate] Creating new track for performer_1
   [MicInputGate] Connected mic source to gate node
   [PerformanceTrackManager] Creating track performer_1_1729123456789_abc123
   [MicInputGate] Track performer_1_1729123456789_abc123 created and gate opened
   ```

### 5. 音が出ることを確認
- カウントダウン中: 音がフェードインする
- 演奏中(1秒): 音がはっきり聞こえる
- 演奏終了後: 音がフェードアウトする

### 6. 音が止まることを確認
- フェードアウト完了後: 音が完全に止まる
- コンソールで以下のログを確認:
  ```
  [PerformanceTrackManager] Track performer_1_1729123456789_abc123 ended
  [MicInputGate] Track performer_1_1729123456789_abc123 cleaned up
  ```

## デバッグコマンド

### マイク接続状態を確認
```javascript
// ブラウザコンソールで実行
const inputManager = window.inputManager;
const micRouter = inputManager.getMicRouter();
const mics = micRouter.getMicInputs();
console.log('Registered mics:', mics);

mics.forEach(mic => {
    console.log(`Mic ${mic.id}:`, {
        enabled: mic.enabled,
        hasSource: !!mic.source,
        hasGain: !!mic.gainNode,
    });
    
    // ソースの接続先をチェック
    if (mic.source) {
        console.log(`  Source node:`, mic.source);
        console.log(`  ⚠️ If this has connections, there's a problem!`);
    }
});
```

### トラック状態を確認
```javascript
// ブラウザコンソールで実行
const { getGlobalPerformanceTrackManager } = await import('./engine/audio/devices/performanceTrackManager.js');
const trackManager = getGlobalPerformanceTrackManager();
const stats = trackManager.getStats();
console.log('Track stats:', stats);
console.log('Active tracks:', trackManager.getAllActiveTracks());
```

### ゲート状態を確認
```javascript
// ブラウザコンソールで実行
const { getGlobalMicInputGateManager } = await import('./engine/audio/devices/micInputGate.js');
const gateManager = getGlobalMicInputGateManager();
console.log('Gate manager:', gateManager);
```

## トラブルシューティング

### Q: まだマイクをEnableにすると音が出る
A: 以下を確認:
1. ページを完全にリロード (Ctrl+Shift+R)
2. ブラウザキャッシュをクリア
3. コンソールで以下を確認:
   ```javascript
   const micRouter = window.inputManager.getMicRouter();
   console.log('mixerNode connections:', micRouter.mixerNode);
   // mixerNodeが何かに接続されていないか確認
   ```

### Q: Section Aを開始しても音が出ない
A: 以下を確認:
1. Section A が初期化されているか
   ```javascript
   console.log('Section A initialized:', window.sectionAAudioSystem);
   ```
2. マイクソースが登録されているか
   ```
   コンソールに "Registered mic source for performer_1" が表示されているか
   ```
3. トラックが作成されているか
   ```javascript
   const trackManager = getGlobalPerformanceTrackManager();
   console.log(trackManager.getStats());
   ```

### Q: 音が出続ける(止まらない)
A: ゲートのタイミング設定を確認:
```javascript
// src/performance/randomScheduler.ts
gateManager.openGateForPerformance(
    performer.performerId,
    this.countdownSeconds,  // カウントダウン時間
    1.0,                    // ホールド時間(1秒)
    0.8                     // フェードアウト時間(0.8秒)
);
```

## まとめ

### 修正ポイント
1. ✅ `source.connect(gainNode)` を削除
2. ✅ `gainNode.connect(mixerNode)` を削除
3. ✅ `mixerNode.connect(output)` を無効化
4. ✅ `micRouter.connectOutput()` を無効化
5. ✅ `audioCore.ts` での接続を削除

### 新システムの動作
- マイクEnable → 登録のみ(音なし)
- パフォーマンスキュー → トラック作成 → ゲート開く → 音が出る
- ゲート閉じる → 音が止まる → トラック削除

### 重要な変更
**マイク入力は一切直接接続されません。全てのルーティングはPerformanceTrackManagerを通して行われます。**

これにより:
- 不要な音の出力を防ぐ
- 各パフォーマンスを独立したトラックとして処理
- 将来的なエフェクト処理に対応

## 関連ドキュメント
- [PERFORMANCE_TRACK_SYSTEM.md](./PERFORMANCE_TRACK_SYSTEM.md)
- [MIC_ROUTING_FIX.md](./MIC_ROUTING_FIX.md)
