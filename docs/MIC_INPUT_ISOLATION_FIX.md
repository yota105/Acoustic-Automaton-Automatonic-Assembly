# マイク入力の完全隔離 - 音漏れ防止修正

## 問題

マイクをEnableにしてチャンネルを変更すると、音がバウンス(エコーバック)される問題がありました。

### 症状
- Logic InputでマイクをEnableにする
- チャンネル(CH1など)を選択する
- **→ マイクの音が直接出力に流れてしまう**
- パフォーマンスキューなしで音が聞こえてしまう

### 原因

InputManagerの以下の処理でマイクが出力に接続されていました:

1. **`ensureMicRouterAttachment()`**: マイクのgainNodeをmixerNodeに接続
2. **`registerLogicInputWithBusManager()`**: マイクのgainNodeをBusManagerに接続
3. **チャンネル変更時の再接続**: sourceをgainNodeに接続

これらの接続により、マイク入力が常に出力に流れる状態になっていました。

## 解決策

### 1. BusManager接続の無効化

`InputManager.registerLogicInputWithBusManager()`を完全に無効化:

```typescript
private registerLogicInputWithBusManager(...): void {
  // 重要: 新しいトラックベースシステムでは、マイクは直接BusManagerに接続しません
  // マイク音声はPerformanceTrackManager経由でのみルーティングされます
  console.log(`⚠️ [InputManager] Skipping BusManager connection (track-based routing only)`);
  return;
  
  /* 旧コードはコメントアウト */
}
```

### 2. MixerNode接続の無効化

`InputManager.ensureMicRouterAttachment()`を完全に無効化:

```typescript
private ensureMicRouterAttachment(micInput: MicInput | undefined): void {
  // 重要: 新しいトラックベースシステムでは、マイクは直接mixerNodeに接続しません
  // マイク音声はPerformanceTrackManager経由でのみルーティングされます
  console.log(`⚠️ [InputManager] Skipping mixer attachment (track-based routing only)`);
  return;
  
  /* 旧コードはコメントアウト */
}
```

### 3. チャンネル変更時の接続制御

チャンネル変更時、sourceはAnalyserにのみ接続:

```typescript
// 既存の接続を一旦切断
existingInput.source.disconnect();

// Analyserには常に接続(メーター用)
existingInput.source.connect(existingInput.analyser);

// 重要: gainNodeやその他の出力には接続しない
// トラックベースシステムでは、sourceは直接PerformanceTrackManagerで使用される
console.log(`[InputManager] ⚠️ Source NOT connected to gain/output (track-based routing only)`);
```

## オーディオルーティング図

### 修正前(問題あり)
```
Mic Device
  ↓
MediaStreamSource ──→ GainNode ──→ MixerNode ──→ Output (常に音が出る!)
  ↓                      ↓
  Analyser          BusManager ──→ Output (常に音が出る!)
```

### 修正後(正常)
```
Mic Device
  ↓
MediaStreamSource ──→ Analyser (メーターのみ、音は出ない)
  ↓ (パフォーマンスキュー時のみ)
  PerformanceTrackManager
  ↓
  GateNode (自動制御)
  ↓
  TrackGain
  ↓
  effectsBus → Reverb → Output
```

## メーター機能の維持

マイク入力レベルのメーター表示は維持されます:

1. **MicRouter**: MediaStreamSourceをAnalyserに接続
2. **getMicInputLevels()**: Analyserからレベルを読み取り
3. **updateMeters()**: UIのメーターバーを更新

Analyserは音声を出力しないので、メーターが動いても音は出ません。

## 動作確認

### 正常な動作
1. Logic InputでマイクをEnable
2. デバイスとチャンネルを選択
3. **→ 音は出ない(メーターのみ動く)**
4. Section A開始
5. カウントダウンが0秒になる
6. **→ このタイミングで初めて音が出る**
7. ゲートが閉じる
8. **→ 音が止まる**

### コンソールログ例

```
[InputManager] ⚠️ Skipping BusManager connection for mic1 (track-based routing only)
[InputManager] ⚠️ Skipping mixer attachment for mic1 (track-based routing only)
[InputManager] Reconnected to analyser for level monitoring
[InputManager] ⚠️ Source NOT connected to gain/output (track-based routing only)
[MicRouter] ✓ Analyser connected for level monitoring (no audio output)
```

## 関連ファイル

- `src/engine/audio/devices/inputManager.ts` - マイク接続制御の無効化
- `src/engine/audio/devices/micRouter.ts` - Analyser接続追加
- `src/engine/audio/devices/micInputGate.ts` - ゲート制御
- `src/engine/audio/devices/performanceTrackManager.ts` - トラック管理

## トラブルシューティング

### 問題: マイクをEnableにすると音が出る
- **原因**: 古いコードが残っている
- **解決**: ブラウザをハードリフレッシュ(Ctrl+Shift+R)

### 問題: メーターが動かない
- **原因**: AnalyserがsourceNodeに接続されていない
- **解決**: 最新のmicRouter.tsを確認、source.connect(analyser)が存在するか確認

### 問題: パフォーマンスキューで音が出ない
- **原因**: performerId mapping の問題
- **解決**: docs/PERFORMER_ID_MAPPING_FIX.md を参照

## 今後の拡張

### モニター機能の追加(将来)

メインマシンで演奏者の音をモニターしたい場合:

```typescript
// Audio Control Panelに追加予定
<button id="monitor-toggle">Monitor Enable</button>

// 実装例
function enableMonitoring(logicInputId: string) {
  const micInput = micRouter.getMicInput(logicInputId);
  const monitorGain = audioContext.createGain();
  monitorGain.gain.value = 0.5; // モニター音量
  
  micInput.source.connect(monitorGain);
  monitorGain.connect(audioContext.destination);
  
  console.log(`Monitor enabled for ${logicInputId}`);
}
```

このボタンを押した時のみ、マイク音声を直接モニターできるようにする予定。

## 更新履歴

- 2025-10-16: 初版作成 - InputManagerの接続処理を完全無効化、Analyser接続のみ維持
