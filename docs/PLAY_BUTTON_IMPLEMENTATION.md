# Play Button → Audio Output Implementation

## 概要
Play ボタンを押すとプログラムで制御されたシンセサイザーが確実に音を出す実装。

## アーキテクチャ

```
[Play Button]
    ↓
[CompositionPlayer] ← 楽曲再生管理
    ↓
[PlaySynthController] ← DSP制御
    ↓
[Faust DSP (playtest.dsp)] ← AudioWorklet
    ↓
[synthBus] ← BusManager
    ↓
[mainOutput] ← OutputRoutingManager
    ↓
[Physical Speaker] 🔊
```

## 実装ファイル

### 1. DSP ファイル
**`public/dsp/playtest.dsp`**
- シンプルな Sawtooth シンセサイザー
- ADSR エンベロープ付き
- Gate トリガーで音を鳴らす

パラメータ:
- `frequency` (Hz): 周波数
- `volume`: 音量
- `attack`, `decay`, `sustain`, `release`: エンベロープ
- `gate`: トリガー (0/1)

### 2. PlaySynthController
**`src/engine/audio/synthesis/playSynthController.ts`**

Faust DSP を制御するコントローラー。

主要メソッド:
- `initialize()`: DSP ロード & 初期化
- `noteOn(freq, velocity)`: 音を鳴らす
- `noteOff()`: 音を止める
- `playSequence(notes, duration)`: シーケンス再生
- `playTestTone(duration)`: テストトーン再生

### 3. CompositionPlayer
**`src/engine/audio/synthesis/compositionPlayer.ts`**

楽曲全体の再生を管理するプレイヤー。

主要メソッド:
- `initialize()`: BaseAudio + DSP 初期化
- `play()`: 再生開始
- `pause()`: 一時停止
- `stop()`: 停止
- `getState()`: 現在の状態

内部処理:
1. `ensureBaseAudio()` で BaseAudio を確保
2. `PlaySynthController` を初期化
3. `synthBus` へ自動接続
4. `MusicalTimeManager` と連携（存在すれば）

### 4. テストページ
**`src/playtest.html`**

シンプルな動作確認用ページ。

ボタン:
- **Initialize**: Audio システム初期化
- **Play**: テストシーケンス再生 (C4 → E4 → G4 → C5)
- **Pause**: 一時停止
- **Stop**: 停止

## 使用方法

### 基本的な使い方

```typescript
import { getGlobalCompositionPlayer } from './engine/audio/synthesis/compositionPlayer';

// 1. プレイヤーを取得
const player = getGlobalCompositionPlayer();

// 2. 初期化（最初の一度だけ）
await player.initialize();

// 3. 再生
await player.play();

// 4. 停止
await player.stop();
```

### 直接シンセを制御

```typescript
const player = getGlobalCompositionPlayer();
await player.initialize();

const synth = player.getSynth();

// A4 (440Hz) を鳴らす
synth.noteOn(440, 0.8);

// 1秒後に止める
setTimeout(() => synth.noteOff(), 1000);

// カスタムシーケンス
const melody = [261.63, 293.66, 329.63, 349.23]; // C4, D4, E4, F4
await synth.playSequence(melody, 0.5);
```

## 動作確認手順

### 1. Dev サーバー起動
```bash
npm run dev
```

### 2. テストページを開く
```
http://localhost:5173/src/playtest.html
```

### 3. 操作
1. **Initialize** ボタンをクリック
   - Audio システムが初期化される
   - ログに初期化状況が表示される

2. **Play** ボタンをクリック
   - テストシーケンスが再生される
   - C4 → E4 → G4 → C5 (Cメジャーコード)

3. ログを確認
   - 各段階の処理が成功しているか確認
   - エラーがあれば詳細が表示される

## トラブルシューティング

### 音が出ない場合

#### 1. ブラウザコンソールを確認
```
F12 → Console タブ
```

エラーメッセージを確認:
- Faust モジュールのロードエラー
- DSP コンパイルエラー
- AudioContext サスペンド状態

#### 2. Audio Output 確認
- ブラウザの音量がミュートされていないか
- システムの出力デバイスが正しく選択されているか
- ヘッドホン/スピーカーが接続されているか

#### 3. 初期化エラー
```typescript
// エラーハンドリング例
try {
  await player.initialize();
} catch (error) {
  console.error('Initialization failed:', error);
  // Faust ファイルパスを確認
  // /faust/libfaust-wasm.js が存在するか
  // /dsp/playtest.dsp が存在するか
}
```

#### 4. AudioContext state
```typescript
console.log('AudioContext state:', window.audioCtx?.state);
// "running" であるべき
// "suspended" の場合は resumeAudio() が必要
```

### よくある問題

**Q: Initialize は成功するが Play で音が出ない**
A: 
- `synthBus` への接続を確認
- BusManager が初期化されているか確認
- OutputRoutingManager の割り当てを確認

**Q: Play で TypeError が出る**
A:
- `player.initialize()` を先に呼んでいるか確認
- Faust DSP のコンパイルが成功しているか確認

**Q: 音が途切れる**
A:
- AudioContext のバッファサイズを確認
- CPU 負荷を確認
- 他のタブで重い処理をしていないか確認

## 次のステップ

### 1. Performance ページへの統合
`src/performance.ts` の `handlePlay()` で `CompositionPlayer` を使用:

```typescript
private async handlePlay(): Promise<void> {
  const player = getGlobalCompositionPlayer();
  
  if (!player.getSynth()) {
    await player.initialize();
  }
  
  await player.play();
  this.state.isPlaying = true;
  this.updateStatusDisplay();
}
```

### 2. MusicalTimeManager との連携
拍に同期してノートをトリガー:

```typescript
musicalTimeManager.on('beat', (data) => {
  const synth = player.getSynth();
  if (synth && data.beat === 1) {
    synth.noteOn(440, 0.7);
    setTimeout(() => synth.noteOff(), 200);
  }
});
```

### 3. 複数 DSP の管理
用途別に DSP ファイルを分ける:

```
public/dsp/
  ├── playtest.dsp       (テスト用シンセ)
  ├── lead-synth.dsp     (リードシンセ)
  ├── bass-synth.dsp     (ベースシンセ)
  ├── pad-synth.dsp      (パッドシンセ)
  ├── reverb.dsp         (リバーブエフェクト)
  └── delay.dsp          (ディレイエフェクト)
```

各 DSP に対応する Controller を作成:

```typescript
export class LeadSynthController extends BaseSynthController {
  protected getDspPath(): string {
    return '/dsp/lead-synth.dsp';
  }
}

export class BassSynthController extends BaseSynthController {
  protected getDspPath(): string {
    return '/dsp/bass-synth.dsp';
  }
}
```

## 技術詳細

### Signal Flow
```
noteOn(440, 0.8)
  ↓
setParam('frequency', 440)
setParam('volume', 0.4)
setParam('gate', 1)
  ↓
Faust DSP (AudioWorklet)
  os.sawtooth(440) * env * 0.4
  ↓
AudioWorkletNode output
  ↓
synthBus (GainNode)
  ↓
effectsBus → mainOutput
  ↓
OutputRoutingManager
  ↓
MediaStreamAudioDestinationNode
  ↓
HTMLAudioElement.setSinkId()
  ↓
Physical Speaker 🔊
```

### タイミング精度
- AudioWorklet: サンプル単位の精度
- MusicalTimeManager: 高精度タイマー (1ms 以下)
- Gate trigger: リアルタイム制御可能

### メモリ管理
- DSP インスタンスは再利用
- AudioWorklet は自動ガベージコレクション対象外
- `cleanup()` で明示的に破棄

## 参考資料

- [Faust Documentation](https://faust.grame.fr/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [DEVELOPMENT_ROADMAP.md](../docs/DEVELOPMENT_ROADMAP.md)
- [AUDIO_SYSTEM.md](../docs/AUDIO_SYSTEM.md)
