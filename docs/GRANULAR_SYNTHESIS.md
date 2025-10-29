# グラニュラーシンセシス実装ガイド

## 概要

Section A の Mimicry 機能で、演奏者のマイク入力を録音し、グラニュラーシンセシスで引き伸ばして再生する機能を実装しました。

## アーキテクチャ

### 3つの主要コンポーネント

1. **MicRecordingManager** (`src/engine/audio/devices/micRecordingManager.ts`)
   - マイク入力を AudioBuffer に録音
   - 録音データの管理とクリーンアップ
   - トラックごとに最大3秒までの録音

2. **GranularPlayer** (`src/engine/audio/devices/granularPlayer.ts`)
   - 録音されたバッファをグラニュラーシンセシスで再生
   - パラメータ: グレインサイズ、密度、スプレッド、ピッチ変動など
   - タイムストレッチ（元の録音を引き伸ばす）

3. **統合システム** (`src/engine/audio/synthesis/sectionAAudioSystem.ts`)
   - 初期化時に全システムをセットアップ
   - PerformanceTrackManager と連携

## 使用の流れ

### 1. 初期化（Section A 開始時）

```typescript
const audioSystem = new SectionAAudioSystem();
await audioSystem.initialize();
// 自動的に MicRecordingManager と GranularPlayer が初期化される
```

### 2. 録音の開始（演奏キュー受信時）

```typescript
import { getGlobalMicRecordingManager } from './engine/audio/devices/micRecordingManager';

const recordingManager = getGlobalMicRecordingManager();

// トラック作成時に録音を開始
await recordingManager.startRecording(
  trackId,           // トラックID
  performerId,       // 'player1', 'player2', etc.
  micSourceNode,     // MediaStreamAudioSourceNode
  { maxDuration: 3.0 }  // 最大3秒
);
```

### 3. 録音の停止（ゲートが閉じた後）

```typescript
// トラック終了時に自動的に録音を保存
const recording = recordingManager.stopRecording(trackId);

if (recording) {
  console.log(`録音完了: ${recording.duration.toFixed(2)}秒`);
}
```

### 4. グラニュラー再生（Mimicry発動時）

```typescript
import { getGlobalGranularPlayer } from './engine/audio/devices/granularPlayer';
import { sectionASettings } from './works/acoustic-automaton/sectionAConfig';

const granularPlayer = getGlobalGranularPlayer();
const settings = sectionASettings.granular.primary;

// 録音を取得
const recordings = recordingManager.getRecordingsByPerformer('player1');
if (recordings.length > 0) {
  const latestRecording = recordings[0];
  
  // グラニュラー再生
  const voiceId = granularPlayer.playGranular(
    latestRecording,
    effectsBusNode,  // 出力先（リバーブ経由）
    settings
  );
  
  console.log(`グラニュラーボイス開始: ${voiceId}`);
}
```

## パラメータ設定

`src/works/acoustic-automaton/sectionAConfig.ts` で設定可能：

```typescript
granular: {
  primary: {
    grainSize: 80,           // グレインサイズ（ms）
    grainDensity: 20,        // 1秒あたりのグレイン数
    grainSpray: 0.3,         // タイミングのランダム性 (0.0-1.0)
    pitchVariation: 0,       // ピッチ変動（セント）
    ampVariation: 0.2,       // 音量変動 (0.0-1.0)
    pan: 0.5,                // パン位置
    loop: true,              // ループ再生
    targetDuration: 10.0     // 引き伸ばし後の目標長さ（秒）
  },
  textureAlternative: {
    // より抽象的なテクスチャ用の設定
    grainSize: 120,
    grainDensity: 15,
    grainSpray: 0.5,
    pitchVariation: 50,      // ピッチを変動させる
    ampVariation: 0.4,
    pan: 0.5,
    loop: true,
    targetDuration: 10.0
  }
}
```

## Mimicry トリガー条件

`sectionAConfig.ts` で設定：

```typescript
mimicryTrigger: {
  minRecordings: 3,            // 最低録音数
  allPerformersPlayed: true    // 全員が演奏したか
},
mimicry: {
  evaluationStartSeconds: 42,  // 評価開始時刻
  evaluationIntervalSeconds: 8,// 評価間隔
  maxSimultaneousVoices: 2     // 同時再生数
}
```

## 実装ステップ（進行中）

### ✅ 完了
- [x] MicRecordingManager の実装
- [x] GranularPlayer の実装
- [x] SectionAAudioSystem への統合

### 🔄 次のステップ
1. MicInputGateManager に録音開始/停止を追加
2. CompositionPlayer に Mimicry イベントハンドラを追加
3. 録音数とトリガー条件の評価ロジック
4. テストとパラメータ調整

## デバッグ方法

### 録音状態の確認

```typescript
const stats = recordingManager.getStats();
console.log('録音統計:', stats);
// {
//   totalRecordings: 5,
//   activeRecordings: 1,
//   recordingsByPerformer: { player1: 2, player2: 3 }
// }
```

### グラニュラー再生状態の確認

```typescript
const stats = granularPlayer.getStats();
console.log('グラニュラー統計:', stats);
// {
//   totalVoices: 2,
//   activeVoices: 1,
//   voicesByPerformer: { player1: 1 }
// }
```

## トラブルシューティング

### 録音が保存されない
- `stopRecording()` が呼ばれているか確認
- コンソールで `[MicRecordingManager]` ログを確認

### グラニュラー音が聞こえない
- 出力先ノード（effectsBusNode）が正しいか確認
- リバーブのウェット/ドライバランスを確認
- グレイン密度が低すぎないか確認（`grainDensity: 20` 推奨）

### メモリリーク
- 古い録音の自動クリーンアップ:
  ```typescript
  recordingManager.cleanupOldRecordings(300); // 5分以上前の録音を削除
  ```

## 参考資料

- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- グラニュラーシンセシス: https://en.wikipedia.org/wiki/Granular_synthesis
