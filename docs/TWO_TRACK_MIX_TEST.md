# Two-Track Mix with Reverb Test

## 🎯 概要

2つのトラック(DSP音源)をミックスし、マスターチェーンにリバーブをかけるテストシステムです。

## 🎛️ システム構成

```
[Track 1: PlaySynth (playtest.dsp)]
          │
          ├─→ [Synth Bus] ─→ [Master Bus] ─→ [Reverb] ─→ [Output]
          │
[Track 2: TestSignal (testsignals.dsp)]
```

### Track 1: PlaySynth
- **DSP**: `public/dsp/playtest.dsp`
- **内容**: Sawtooth波形 + ADSRエンベロープ
- **出力**: メロディーシーケンス (C4 → E4 → G4 → C5)

### Track 2: TestSignal
- **DSP**: `public/dsp/testsignals.dsp`
- **内容**: トーン/ノイズ/インパルスの切り替え可能な信号ジェネレーター
- **出力**: 440Hz サイン波 (デフォルト)

### Master Effect: Reverb
- **DSP**: `public/dsp/reverb.dsp`
- **内容**: Freeverb アルゴリズムベースのリバーブ
- **パラメータ**:
  - `roomSize`: 部屋のサイズ (0.0 - 1.0)
  - `damping`: 高域減衰 (0.0 - 1.0)
  - `wet`: リバーブ信号のレベル (0.0 - 1.0)
  - `dry`: 直接音のレベル (0.0 - 1.0)
  - `width`: ステレオ幅 (0.0 - 1.0)

## 🚀 使い方

### 1. Performance ページを開く

```
http://localhost:1420/performance.html
```

### 2. ブラウザのコンソールを開く (F12)

### 3. システムを初期化

```javascript
await window.twoTrackTest.initialize()
```

出力例:
```
[TwoTrackMixTest] 🎬 Initializing...
[TwoTrackMixTest] ✅ Base Audio ready
[TwoTrackMixTest] ✅ Effect Registry scanned
[TwoTrackMixTest] ✅ Track 1 (PlaySynth) ready
[TwoTrackMixTest] ✅ Track 2 (TestSignals) ready
[TwoTrackMixTest] ✅ Track 1 connected to synthBus
[TwoTrackMixTest] ✅ Track 2 connected to synthBus
[TwoTrackMixTest] ✅ Reverb added to master chain
[TwoTrackMixTest] ✅ Reverb parameters set
[TwoTrackMixTest] 🎉 Initialization complete!
```

### 4. 再生開始

```javascript
await window.twoTrackTest.play()
```

**Track 1** がメロディー (C4→E4→G4→C5) を演奏し、同時に **Track 2** が440Hzのトーンを出力します。両方の音が **Reverb** を通って出力されます。

### 5. 停止

```javascript
window.twoTrackTest.stop()
```

## 🎚️ リアルタイムパラメータ調整

### Track 2 の信号を変更

```javascript
// トーンに切り替え
window.twoTrackTest.changeTrack2Signal(0)

// ノイズに切り替え
window.twoTrackTest.changeTrack2Signal(1)

// インパルスに切り替え
window.twoTrackTest.changeTrack2Signal(2)
```

### リバーブパラメータを調整

```javascript
// 部屋を大きくする
window.twoTrackTest.adjustReverb({ roomSize: 0.9 })

// Wet/Dry バランスを変更
window.twoTrackTest.adjustReverb({ wet: 0.6, dry: 0.4 })

// 複数パラメータを同時に変更
window.twoTrackTest.adjustReverb({
  roomSize: 0.8,
  damping: 0.3,
  wet: 0.5
})
```

## 🔍 状態確認

```javascript
// システム状態を確認
window.twoTrackTest.getStatus()
```

出力例:
```javascript
{
  initialized: true,
  track1Ready: true,
  track2Ready: true,
  audioContext: "running"
}
```

## 🧪 デバッグAPI

### エフェクト一覧を確認

```javascript
window.fx.ls()
```

### エフェクトチェーンを確認

```javascript
window.busManager.getEffectsChainMeta()
```

### トラックパラメータを確認

```javascript
// Track 2 のパラメータ情報
window.faustWasmLoader.getParameterInfo('testsignals')
```

## 📝 実装の詳細

### ファイル構成

```
public/dsp/
  ├── playtest.dsp         # Track 1 シンセ
  ├── testsignals.dsp      # Track 2 信号ジェネレーター
  ├── testsignals.json     # Track 2 メタデータ
  ├── reverb.dsp           # マスターリバーブ
  └── reverb.json          # リバーブメタデータ

src/engine/audio/synthesis/
  ├── playSynthController.ts    # PlaySynth コントローラー
  ├── compositionPlayer.ts      # 楽曲再生マネージャー
  └── twoTrackMixTest.ts        # 2トラックミックステスト (NEW)
```

### 信号の流れ

1. **Track 1**: `PlaySynthController` → `playtest.dsp` → AudioWorkletNode
2. **Track 2**: `FaustWasmLoader` → `testsignals.dsp` → AudioWorkletNode
3. **ミックス**: Track 1 + Track 2 → `synthBus` (GainNode)
4. **エフェクト**: synthBus → `BusManager` → `reverb.dsp` (insert effect)
5. **出力**: BusManager → Master Gain → AudioContext.destination

### エフェクトシステム

- **EffectRegistry v2**: DSPファイルを自動スキャン・登録
- **BusManager**: マスターエフェクトチェーンを管理
- **FaustWasmLoader**: Faust DSPのランタイムコンパイル
- **FaustEffectController**: パラメータ制御のラッパー

## 🎨 カスタマイズ

### 新しいエフェクトを追加

1. `public/dsp/myeffect.dsp` を作成
2. `public/dsp/myeffect.json` でメタデータを定義
3. EffectRegistry に登録:
   ```javascript
   await window.fx.scan({ additionalPaths: ['myeffect.dsp'] })
   ```
4. マスターチェーンに追加:
   ```javascript
   await window.busManager.addEffectFromRegistry('myeffect')
   ```

### Track 1 のメロディーを変更

`twoTrackMixTest.ts` の `play()` メソッドを編集:

```typescript
const melody = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
```

## 🐛 トラブルシューティング

### 音が出ない

1. AudioContext の状態を確認:
   ```javascript
   window.audioCtx.state  // "running" であるべき
   ```

2. ボリュームを確認:
   ```javascript
   window.busManager.getSynthInputNode().gain.value  // 1.0 であるべき
   ```

### エフェクトが効かない

1. エフェクトチェーンを確認:
   ```javascript
   window.busManager.getEffectsChainMeta()
   ```

2. バイパス状態を確認:
   ```javascript
   // 各エフェクトの bypass プロパティが false であることを確認
   ```

### パラメータが変わらない

1. パラメータアドレスを確認:
   ```javascript
   window.faustWasmLoader.getParameterInfo('reverb')
   ```

2. 正しいアドレスでパラメータを設定:
   ```javascript
   // ❌ 間違い
   instance.controller.setParam('size', 0.7)
   
   // ✅ 正しい
   instance.controller.setParam('roomSize', 0.7)
   ```

## 🎉 成功例

完全に動作している場合、以下のような出力が得られます:

```
[TwoTrackMixTest] ▶️ Starting playback...
[PlaySynth] 🎵 Note ON: 261.63Hz, velocity: 0.7
[TwoTrackMixTest] ✅ Track 1 playing melody
[TwoTrackMixTest] Track 2 params: [...5 parameters...]
[TwoTrackMixTest] ✅ Track 2 playing 440Hz tone
[TwoTrackMixTest] 🎵 Both tracks playing with reverb!
```

## 📚 関連ドキュメント

- [AUDIO_SYSTEM.md](./AUDIO_SYSTEM.md) - オーディオシステム全体の概要
- [PLAY_BUTTON_IMPLEMENTATION.md](./PLAY_BUTTON_IMPLEMENTATION.md) - Play ボタンの実装
- [COMPOSITION_NOTATION_GUIDE.md](./COMPOSITION_NOTATION_GUIDE.md) - 楽曲記譜法
