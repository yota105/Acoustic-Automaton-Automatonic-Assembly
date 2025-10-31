# グラニュラー引き伸ばしテストガイド

## 🧪 テストモードの切り替え方法

### 1. 設定ファイルを開く
`src/works/acoustic-automaton/sectionsConfig.ts` を開く

### 2. テストモードを選択
67行目付近の `SUSTAIN_TEST_MODE` を編集:

```typescript
// グラニュラー単体テスト
export const SUSTAIN_TEST_MODE: SustainTestMode = 'granular-only';

// または リバーブ+グラニュラーテスト
export const SUSTAIN_TEST_MODE: SustainTestMode = 'reverb-plus-granular';
```

### 3. ブラウザをリロード
保存後、Ctrl+R (または Cmd+R) でブラウザを完全リロード

---

## 📊 テスト手順

### ステップ1: 初期状態の確認
1. Operator画面を開く
2. Console (F12) を開いて以下のログを確認:
   ```
   🧪 TEST MODE: グラニュラー単体 (リバーブはほぼドライ、グラニュラーのみで15秒引き伸ばし)
   ```
   または
   ```
   🧪 TEST MODE: リバーブ+グラニュラー (両方の効果を組み合わせて引き伸ばし)
   ```

### ステップ2: 演奏開始
1. 「Play」ボタンをクリック
2. メトロノームが鳴り始める
3. 5-8秒後、最初の演奏キューが出る

### ステップ3: 録音の確認 (0-40秒)
演奏キューが出たら、楽器で音を出す。コンソールで以下を確認:

```
[MicInputGate] Recording started for track xxx (max 3.0s)
[MicInputGate] Recording saved: xxx, duration: 2.45s
```

### ステップ4: グラニュラー開始の確認 (42秒)
42秒経過時に以下のログが出ることを確認:

```
[CompositionPlayer] 🌊 Granular voice started: grain_xxx
  Source: player1, duration: 2.45s
  Settings: primary
[GranularPlayer] Stretch setup:
  Source duration: 2.45s
  Target duration: 15s
  Stretch factor: 6.12x
  Grain size: 150ms, Density: 35/s
  Voice will stop at: 57.23s (audio context time)
```

### ステップ5: グレイン生成の確認
20グレインごとにログが出ます:

```
[GranularPlayer] Voice grain_xxx: 20 grains, position: 0.45s
[GranularPlayer] Voice grain_xxx: 40 grains, position: 0.89s
...
```

### ステップ6: 停止の確認 (57秒)
15秒後に自動停止:

```
[GranularPlayer] Voice grain_xxx time expired (57.23s >= 57.23s)
[GranularPlayer] Stopping voice grain_xxx (262 grains played)
[GranularPlayer] Voice grain_xxx removed (total grains: 262)
```

---

## 🐛 問題: 録音がそのまま再生される

### 症状
- グラニュラーではなく、元の録音がそのまま再生される
- 引き伸ばし効果がない

### 考えられる原因と確認方法

#### 1. グレインが生成されていない
**確認**: コンソールで以下のログがあるか?
```
[GranularPlayer] Voice grain_xxx: 20 grains, position: 0.45s
```

**対処**: ログがない場合は `scheduleNextGrain` が呼ばれていない

#### 2. グレインが1つしか再生されていない
**確認**: total grains が少ない (例: 1 grain のみ)

**対処**: タイマーが正しく動いていない可能性

#### 3. 録音が別ルートで再生されている
**確認**: `[PerformanceTrackManager]` のログを確認

**対処**: 録音再生とグラニュラー再生が混在している可能性

---

## 🔍 デバッグコマンド

### コンソールで実行できるコマンド:

#### 録音状態を確認
```javascript
const { getGlobalMicRecordingManager } = await import('./src/engine/audio/devices/micRecordingManager.js');
const manager = getGlobalMicRecordingManager();
console.log(manager.getStats());
```

#### グラニュラープレイヤーの状態を確認
```javascript
const { getGlobalGranularPlayer } = await import('./src/engine/audio/devices/granularPlayer.js');
const player = getGlobalGranularPlayer();
console.log(player.getStats());
```

#### 手動でグラニュラーテスト
```javascript
const { getGlobalMicRecordingManager } = await import('./src/engine/audio/devices/micRecordingManager.js');
const { getGlobalGranularPlayer } = await import('./src/engine/audio/devices/granularPlayer.js');
const { getGlobalSectionA } = await import('./src/engine/audio/synthesis/sectionAAudioSystem.js');

const recordings = getGlobalMicRecordingManager().getRecordingsByPerformer('player1');
if (recordings.length > 0) {
    const player = getGlobalGranularPlayer();
    const sectionA = getGlobalSectionA();
    const settings = {
        grainSize: 150,
        grainDensity: 35,
        grainSpray: 0.1,
        pitchVariation: 0,
        ampVariation: 0.1,
        pan: 0.5,
        loop: true,
        targetDuration: 15.0
    };
    
    const voiceId = player.playGranular(recordings[0], sectionA.getEffectsBus(), settings);
    console.log('Manual granular test started:', voiceId);
}
```

---

## 📈 期待される動作

### グラニュラー単体モード
- **0-42秒**: 演奏キュー、録音
- **42秒**: 最初のグラニュラーボイス開始
- **42-57秒**: 連続的なグラニュラー引き伸ばし音
- **57秒**: フェードアウト開始
- **50秒、58秒**: 追加のグラニュラーボイス（最大2同時）

### リバーブ+グラニュラーモード
上記に加えて:
- リバーブによる空間的広がり
- グラニュラー音にリバーブテールが付加
- より自然な減衰

---

## ⚠️ 既知の問題

1. **グレインが点在的に聞こえる**: 密度が低すぎる
   → `grainDensity` を 35 → 50 に増やす

2. **すぐに終わってしまう**: targetDuration が短い
   → 15s → 20s に延長

3. **音が小さい**: ボイスゲインが低い
   → granularPlayer.ts の voiceGain.gain.value を調整

4. **音が途切れる**: グレインサイズが小さい
   → `grainSize` を 150 → 200 に増やす
