# マイク入力ルーティング - 音が出ない問題の修正

## 問題
パフォーマンスキュー(合図)が発行されてもマイク入力の音が出ない

## 原因
`destinationNode`の接続先が間違っていました。

### 誤った接続 (修正前)
```
Mic Source
    ↓
Gate Node
    ↓
Track Gain Node
    ↓
masterNode (busManager.outputGainNode)
    ↓
出力

問題: リバーブを通らない!
```

### 正しい接続 (修正後)
```
Mic Source
    ↓
Gate Node
    ↓
Track Gain Node
    ↓
effectsBus (busManager.getEffectsInputNode())
    ↓
Reverb (effectsChain)
    ↓
destination (出力)

✅ リバーブを通る!
```

## 修正内容

### ファイル: `src/engine/audio/synthesis/sectionAAudioSystem.ts`

```typescript
// 修正前
const masterNode = busManager.outputGainNode;
gateManager.initialize(this.audioCtx, masterNode);

// 修正後
const effectsBus = busManager.getEffectsInputNode();
gateManager.initialize(this.audioCtx, effectsBus);
```

## オーディオグラフ全体図

```
┌─────────────────────────────────────────────────────────┐
│ パフォーマンスキュー発行                                  │
└─────────────────┬───────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────┐
│ MicInputGateManager.openGateForPerformance()             │
│ - 新しいGateNodeを作成                                    │
│ - micSource.connect(gateNode)                            │
│ - PerformanceTrackManager.createTrack()                  │
└─────────────────┬───────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────┐
│ PerformanceTrack作成                                      │
│ micInput → gateNode → trackGainNode → destinationNode   │
└─────────────────┬───────────────────────────────────────┘
                  ↓
                  
実際のオーディオフロー:
┌─────────────────────────────────────────────────────────┐
│ MediaStreamSource (マイク)                                │
└─────────────────┬───────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────┐
│ GateNode (gain: 0 → 1 → 0)                              │
│ - カウントダウン中: 0 → 1 へフェードイン                  │
│ - 演奏中: 1.0 (全開)                                     │
│ - 演奏後: 1 → 0 へフェードアウト                          │
└─────────────────┬───────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────┐
│ TrackGainNode (個別トラック音量制御)                       │
└─────────────────┬───────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────┐
│ EffectsBus (busManager.effectsBus)                       │
└─────────────────┬───────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────┐
│ Reverb Node (effectsChain)                               │
│ - roomSize: 0.9                                          │
│ - damping: 0.3                                           │
│ - wet: 0.8                                               │
│ - dry: 0.2                                               │
└─────────────────┬───────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────┐
│ TailGain (effectsChain終端)                              │
└─────────────────┬───────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────┐
│ destination (AudioContext.destination = スピーカー)        │
└─────────────────────────────────────────────────────────┘
```

## 並行する他のオーディオフロー

### トーンキュー (Section A)
```
ToneCue DSP Node
    ↓
SynthBus
    ↓
destination
```

### 既存のシンセサイザー (無効化済み)
```
Faust Node (mysynth.dsp)
    ↓
(接続なし - 無効化済み)
```

## テスト手順

### 1. ページをリロード
```
Ctrl + Shift + R
```

### 2. コンソールログ確認
Section A初期化時に以下が表示されるはず:
```
[SectionA] ✅ Mic input gate manager initialized with effects bus routing
[SectionA] ℹ️ Mic inputs will route through: Mic → Gate → Track → EffectsBus → Reverb → Master
```

### 3. マイクを有効化
Logic Inputs → Mic 1: Enable

**期待される動作**:
- 音は出ない (正常)
- コンソールに警告メッセージ

### 4. Section A 開始
Composition Player → Section A Start

**期待される動作**:
- 数秒後、パフォーマンスキューが発行される
- コンソールログ:
```
[MicInputGate] Creating new track for performer_1
[MicInputGate] Connected mic source to gate node
[PerformanceTrackManager] Creating track performer_1_xxx
```

### 5. 音の確認
- カウントダウン中: 音がフェードインする
- 演奏中: クリアに聞こえる + リバーブがかかる
- 演奏後: フェードアウトする

### 6. リバーブの確認
- 音が空間的に響く
- テールが残る (音が止まった後も少し響きが続く)

## デバッグコマンド

### オーディオノード接続を確認
```javascript
// ブラウザコンソールで実行
const busManager = window.busManager;
const effectsBus = busManager.getEffectsInputNode();
console.log('EffectsBus:', effectsBus);

const chainMeta = busManager.getEffectsChainMeta();
console.log('Effects chain:', chainMeta);
```

### トラック接続を確認
```javascript
const { getGlobalPerformanceTrackManager } = await import('./engine/audio/devices/performanceTrackManager.js');
const trackManager = getGlobalPerformanceTrackManager();
const tracks = trackManager.getAllActiveTracks();

tracks.forEach(track => {
    console.log(`Track ${track.id}:`, {
        performerId: track.performerId,
        hasGate: !!track.gateNode,
        hasTrackGain: !!track.trackGainNode,
        outputNode: track.outputNode,
        isActive: track.isActive
    });
});
```

### ゲートの gain 値を確認
```javascript
const { getGlobalMicInputGateManager } = await import('./engine/audio/devices/micInputGate.js');
const gateManager = getGlobalMicInputGateManager();

// 内部状態を見る (デバッグ用)
console.log('Gate manager:', gateManager);
```

### リバーブパラメータを確認
```javascript
const busManager = window.busManager;
const chainMeta = busManager.getEffectsChainMeta();
const reverbMeta = chainMeta.find(e => e.refId === 'reverb');
console.log('Reverb:', reverbMeta);
```

## トラブルシューティング

### Q: 音が全く出ない
A: 以下を確認:
1. マイクが正しく登録されているか
   ```javascript
   const micRouter = window.inputManager.getMicRouter();
   console.log('Mics:', micRouter.getMicInputs());
   ```

2. トラックが作成されているか
   ```javascript
   const trackManager = getGlobalPerformanceTrackManager();
   console.log('Stats:', trackManager.getStats());
   ```

3. ゲートが開いているか
   - コンソールで `linearRampToValueAtTime(1.0, ...)` のログを確認

4. destinationNodeが正しいか
   ```javascript
   const gateManager = getGlobalMicInputGateManager();
   console.log('Destination:', gateManager.destinationNode);
   // effectsBus が表示されるべき
   ```

### Q: 音は出るがリバーブがかからない
A: リバーブチェーンを確認:
```javascript
const busManager = window.busManager;
const chain = busManager.getEffectsChainMeta();
console.log('Effects chain:', chain);
// reverb が含まれているか確認

const reverbItem = chain.find(e => e.refId === 'reverb');
if (reverbItem) {
    console.log('Reverb bypass:', reverbItem.bypass);
    // bypass が false であるべき
}
```

### Q: 音が小さい / 聞こえにくい
A: ゲインを確認:
1. TrackGainNode の値
   ```javascript
   track.trackGainNode.gain.value  // 1.0 のはず
   ```

2. GateNode の値
   ```javascript
   track.gateNode.gain.value  // 演奏中は 1.0 のはず
   ```

3. マスター音量
   ```javascript
   const busManager = window.busManager;
   busManager.outputGainNode.gain.value
   ```

## 重要なポイント

### ✅ 正しい接続先
- マイク入力: **effectsBus** (リバーブの前)
- シンセ音: **synthBus** (リバーブの前)
- モニター: **monitorBus** (リバーブをバイパス)

### ✅ エフェクトチェーン
```
effectsBus → Reverb → TailGain → destination
```

### ✅ トラック作成時
```typescript
trackManager.createTrack({
    performerId,
    micInput: source,
    gateNode,
    destinationNode: effectsBus  // ← ここが重要!
});
```

## 関連ドキュメント
- [PERFORMANCE_TRACK_SYSTEM.md](./PERFORMANCE_TRACK_SYSTEM.md)
- [MIC_ALWAYS_ON_FIX.md](./MIC_ALWAYS_ON_FIX.md)
- [SECTION_A_IMPLEMENTATION.md](./SECTION_A_IMPLEMENTATION.md)
