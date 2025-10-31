# Quick Test Guide - Two-Track Mix with Reverb

## 🚀 クイックスタート (3ステップ)

### 1. Performance ページを開く
```
http://localhost:1420/performance.html
```

### 2. ブラウザコンソールで初期化
```javascript
await window.twoTrackTest.initialize()
```

### 3. 再生
```javascript
await window.twoTrackTest.play()
```

**結果**: メロディー(Track 1) + トーン440Hz(Track 2) がリバーブを通って再生される

---

## 🎛️ パラメータ調整例

### 再生中にリバーブを調整
```javascript
// 部屋を広くする
window.twoTrackTest.adjustReverb({ roomSize: 0.9, wet: 0.6 })
```

### Track 2 をノイズに変更
```javascript
window.twoTrackTest.changeTrack2Signal(1)  // 0:tone, 1:noise, 2:impulse
```

### 停止
```javascript
window.twoTrackTest.stop()
```

---

## 🎵 期待される動作

1. **初期化時**:
   - ✅ Track 1 (PlaySynth) が読み込まれる
   - ✅ Track 2 (TestSignals) が読み込まれる
   - ✅ Reverb がマスターチェーンに追加される

2. **再生時**:
   - 🎹 Track 1: C4 → E4 → G4 → C5 のメロディー (各0.5秒)
   - 📻 Track 2: 440Hz の連続トーン
   - 🎚️ 両方の音がリバーブを通る

3. **コンソール出力例**:
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

---

## 🧪 デバッグコマンド

```javascript
// システム状態を確認
window.twoTrackTest.getStatus()

// エフェクト一覧
window.fx.ls()

// エフェクトチェーンの詳細
window.busManager.getEffectsChainMeta()

// Track 2 のパラメータ
window.faustWasmLoader.getParameterInfo('testsignals')
```

---

## 📋 チェックリスト

- [ ] Performance ページが開ける
- [ ] `window.twoTrackTest` が存在する
- [ ] 初期化が成功する (✅ が7つ表示)
- [ ] 再生すると音が鳴る
- [ ] メロディーとトーンが同時に聞こえる
- [ ] リバーブの効果が聞こえる
- [ ] パラメータ変更が反映される
- [ ] 停止ボタンで音が止まる

---

## 🎯 次のステップ

このテストが成功したら、以下の拡張が可能です:

1. **トラック数を増やす** (3, 4, 5...)
2. **別のエフェクトを追加** (Delay, Chorus, Compressor)
3. **UI を作成** (スライダー、ボタン)
4. **楽曲データと統合** (Section, Phrase, Event)
5. **MIDI 対応** (外部キーボード入力)

詳細は [TWO_TRACK_MIX_TEST.md](./TWO_TRACK_MIX_TEST.md) を参照してください。
