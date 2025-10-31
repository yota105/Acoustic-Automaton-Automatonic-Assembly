# Performance Track System - パフォーマンストラック独立システム

## 概要

各奏者への合図(パフォーマンスキュー)ごとに独立したオーディオトラックを作成し、
マイク入力が全てマスターに混ざらないように分離管理するシステム。

将来的なグラニュラー処理やピッチシフトを容易にするアーキテクチャ。

## システム構成

### 1. PerformanceTrackManager (新規作成)
**ファイル**: `src/engine/audio/devices/performanceTrackManager.ts`

#### 責務
- 各パフォーマンスキューごとに独立したトラックを作成
- トラックIDの生成と管理
- トラックのライフサイクル管理(作成 → アクティブ → 終了 → 削除)
- 奏者ごとのアクティブトラック数の追跡

#### 主要メソッド
```typescript
// トラック作成
createTrack(params: TrackCreationParams): string
  - performerId: 奏者ID
  - micInput: マイク入力ソース
  - gateNode: ゲート制御用GainNode
  - destinationNode: 最終出力先(リバーブ等)
  → 返り値: trackId

// トラック終了(ゲート閉じた後)
endTrack(trackId: string): void

// トラック削除(メモリ解放)
removeTrack(trackId: string): void

// 統計情報取得
getStats(): { totalTracks, activeTracks, tracksByPerformer }
```

#### データ構造
```typescript
interface PerformanceTrack {
  id: string;                    // トラックID
  performerId: string;           // 奏者ID
  micSourceNode: MediaStreamAudioSourceNode;
  gateNode: GainNode;            // ゲート制御用
  trackGainNode: GainNode;       // トラック音量制御
  effectsChain: AudioNode[];     // 将来的なエフェクト
  outputNode: AudioNode;         // 最終出力先
  startTime: number;
  endTime?: number;
  isActive: boolean;
}
```

### 2. MicInputGateManager (大幅改修)
**ファイル**: `src/engine/audio/devices/micInputGate.ts`

#### 変更点
- **旧**: 奏者ごとに1つのゲート(再利用)
- **新**: 各パフォーマンスキューごとに新しいゲート作成

#### 新機能
```typescript
// 奏者のマイクソースを登録
registerPerformerMic(performerId: string, micSource: MediaStreamAudioSourceNode): void

// パフォーマンス開始時: 新しいトラック作成+ゲート制御
openGateForPerformance(
  performerId: string,
  countdownDuration: number,
  holdDuration: number,
  fadeOutDuration: number
): string | null  // 作成されたtrackIdを返す
```

#### オーディオフロー
```
マイク入力 → [新しいゲートノード] → トラック専用チェーン → リバーブ → マスター出力
     ↑           ↑
  登録時      合図ごとに作成
```

#### ゲートライフサイクル
```
1. カウントダウン開始
   ↓
2. openGateForPerformance()呼び出し
   ↓
3. 新しいゲートノード作成(gain=0)
   ↓
4. PerformanceTrackManager.createTrack()
   ↓
5. フェードイン(カウントダウン中)
   ↓
6. 演奏中(1秒間全開)
   ↓
7. フェードアウト(0.8秒)
   ↓
8. トラック終了
   ↓
9. クリーンアップ(5秒後、リバーブテール考慮)
```

### 3. MicRouter (軽微な修正)
**ファイル**: `src/engine/audio/devices/micRouter.ts`

#### 変更点
- `addMicInput()`内でマイクソースをGateManagerに登録
```typescript
// 追加コード
const gateManager = getGlobalMicInputGateManager();
const performerId = `performer_${id}`;
gateManager.registerPerformerMic(performerId, source, deviceId);
```

### 4. SectionAAudioSystem (統合)
**ファイル**: `src/engine/audio/synthesis/sectionAAudioSystem.ts`

#### 初期化フロー
```typescript
async initialize() {
  // 1. BaseAudio確保
  // 2. エフェクトレジストリスキャン
  // 3. リバーブ追加
  // 4. トーンキューノードロード
  // 5. PerformanceTrackManager初期化 ← NEW
  // 6. MicInputGateManager初期化 ← MODIFIED
}
```

### 5. RandomPerformanceScheduler (統合)
**ファイル**: `src/performance/randomScheduler.ts`

#### 変更点
```typescript
private sendCountdown(target: PerformerTarget, secondsRemaining: number) {
  // カウントダウン開始時にゲート開放
  if (secondsRemaining > 0 && secondsRemaining >= this.countdownSeconds) {
    const gateManager = getGlobalMicInputGateManager();
    const trackId = gateManager.openGateForPerformance(
      target.performerId,
      this.countdownSeconds,
      1.0,    // 1秒間全開
      0.8     // 0.8秒でフェードアウト
    );
    console.log(`[RandomScheduler] Track ${trackId} created for ${target.performerId}`);
  }
  
  // メッセージ送信...
}
```

## オーディオグラフ構造

### 旧システム(問題あり)
```
マイク1 ────┐
マイク2 ────┤
マイク3 ────┼→ Mixer → Master → 出力
マイク4 ────┤         (全部混ざる)
マイク5 ────┘
```

### 新システム(独立トラック)
```
奏者1のマイク ──→ [合図1] ゲート1 → トラック1 ─┐
              └→ [合図2] ゲート2 → トラック2 ─┤
奏者2のマイク ──→ [合図3] ゲート3 → トラック3 ─┼→ リバーブ → マスター → 出力
              └→ [合図4] ゲート4 → トラック4 ─┤
奏者3のマイク ──→ [合図5] ゲート5 → トラック5 ─┘
              └→ [合図6] ゲート6 → トラック6 ─┘
                    ↑
            各合図ごとに独立したインスタンス
```

### 詳細なオーディオチェーン(1トラック)
```
MediaStreamSource
     ↓
[GateNode] (gain: 0→1→0)
     ↓
[TrackGainNode] (個別音量制御)
     ↓
[EffectsChain] (将来: グラニュラー, ピッチシフト等)
     ↓
Reverb (共通リバーブ)
     ↓
Master Output
```

## 将来の拡張予定

### グラニュラー合成の追加
```typescript
// performanceTrackManager.tsの拡張
createTrack(params: TrackCreationParams & {
  enableGranular?: boolean;
  granularParams?: {
    grainSize: number;
    overlap: number;
    pitch: number;
  }
}): string {
  // ...
  if (params.enableGranular) {
    const granularNode = createGranularProcessor(params.granularParams);
    trackGainNode.connect(granularNode);
    granularNode.connect(destinationNode);
    track.effectsChain.push(granularNode);
  }
  // ...
}
```

### ピッチシフトの追加
```typescript
interface PerformanceTrack {
  // ...
  effectsChain: AudioNode[];  // ここに挿入
  pitchShiftNode?: AudioWorkletNode;
}

// 使用例
addPitchShift(trackId: string, semitones: number) {
  const track = this.tracks.get(trackId);
  const pitchNode = createPitchShifter(semitones);
  // チェーンに挿入...
}
```

### トラック間ルーティング
```typescript
// 複数トラックをサブミックス
createSubMix(trackIds: string[]): GainNode {
  const subMixGain = this.audioContext.createGain();
  trackIds.forEach(id => {
    const track = this.tracks.get(id);
    track.trackGainNode.disconnect();
    track.trackGainNode.connect(subMixGain);
  });
  return subMixGain;
}
```

## パフォーマンス考慮事項

### メモリ管理
- 非アクティブトラックは5秒後に自動削除(リバーブテール考慮)
- `cleanupOldTracks()`で定期的なクリーンアップ
```typescript
// 使用例(compositionPlayerなどから)
setInterval(() => {
  const trackManager = getGlobalPerformanceTrackManager();
  trackManager.cleanupOldTracks(60);  // 60秒以上前のトラックを削除
}, 30000);  // 30秒ごと
```

### 同時トラック数の監視
```typescript
const stats = trackManager.getStats();
console.log(`Active tracks: ${stats.activeTracks}`);
console.log(`By performer:`, stats.tracksByPerformer);
// 例: { performer_1: 2, performer_2: 1, performer_3: 3 }

// 警告システム
if (stats.activeTracks > 50) {
  console.warn('Too many active tracks! Consider reducing interval.');
}
```

## デバッグとモニタリング

### コンソールログ
```
[PerformanceTrackManager] Creating track performer_1_1729123456789_abc123
[MicInputGate] Registered mic source for performer_1
[MicInputGate] Track performer_1_1729123456789_abc123 created and gate opened
[RandomScheduler] Track performer_1_1729123456789_abc123 created for performer_1
...
[MicInputGate] Track performer_1_1729123456789_abc123 cleaned up
[PerformanceTrackManager] Track performer_1_1729123456789_abc123 removed from memory
```

### 統計情報の取得
```typescript
// パフォーマンスページで実行
const trackManager = getGlobalPerformanceTrackManager();
const stats = trackManager.getStats();
console.table(stats.tracksByPerformer);
```

## トラブルシューティング

### Q: マイク入力が聞こえない
A: 以下を確認:
1. `registerPerformerMic()`が呼ばれているか
2. `openGateForPerformance()`が返すtrackIdが`null`でないか
3. ゲートノードのgain値が0のままになっていないか

### Q: 古いトラックがメモリに残り続ける
A: 
- `endTrack()`が呼ばれているか確認
- `cleanupOldTracks()`を定期的に実行
- リバーブテールを考慮した5秒後の自動削除を確認

### Q: トラックが多すぎてパフォーマンスが悪化
A:
- `getStats()`で同時トラック数を確認
- ランダムスケジューラーの間隔を調整(5-8秒 → 10-15秒)
- クリーンアップの頻度を上げる

## 関連ドキュメント
- [SECTION_A_IMPLEMENTATION.md](./SECTION_A_IMPLEMENTATION.md) - Section A全体の実装計画
- [AUDIO_SYSTEM.md](./AUDIO_SYSTEM.md) - オーディオシステム全体のアーキテクチャ
- [METRONOME_GUIDE.md](./METRONOME_GUIDE.md) - パフォーマンスキューの設計

## 変更履歴
- 2025-10-16: 初版作成 - パフォーマンストラック独立システム実装
