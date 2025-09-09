# オーディオシステム概念整理

## 現在のオーディオアーキテクチャの概念

### 1. AudioCore (2段階初期化システム)
- **ensureBaseAudio()**: DSP非依存の基本オーディオセットアップ
  - AudioContext作成
  - InputManager初期化
  - OutputGainNode作成
  - BusManager初期化
  - TestSignalManager初期化
  - MusicalTimeManager初期化
- **applyFaustDSP()**: Faust DSPの適用
  - Faustモジュールロード
  - Faustノード作成
  - BusManagerとの接続

### 2. BusManager (バス管理システム)
- **3つのメイン・バス**:
  - `synthBus`: シンセサイザー出力用
  - `effectsBus`: エフェクト処理用
  - `monitorBus`: モニター出力用
- **LogicInputConnection**: 各論理入力の接続状態
  - `sourceNode`: 入力ゲインノード
  - `connected`: {synth, effects, monitor} の接続状態
- **EffectsChain**: エフェクトチェーンの管理
  - `chainItems`: エフェクトアイテムの配列
  - `rebuildChain()`: チェーンの再構築

### 3. Tracks (トラック・レイヤー)

#### TrackKindの種類
```typescript
export type TrackKind = 'mic' | 'faust' | 'sample' | 'bus' | 'controller' | 'midi' | 'custom';
```

**各TrackKindの役割**:
- **`mic`**: マイク入力（物理デバイスからの音声）
- **`faust`**: Faust DSPによるシンセサイザー音源
- **`sample`**: サンプル音源（WAVファイルなど）
- **`bus`**: 他のトラックからの出力（サブミックス）
- **`controller`**: MIDIコントローラーからの制御信号
- **`midi`**: MIDI音源
- **`custom`**: カスタム音源（特殊用途）

#### Track構造と処理
```typescript
interface Track {
    id: string;
    name: string;
    kind: TrackKind;
    inputNode: AudioNode;        // 入力ソース
    volumeGain: GainNode;        // 音量制御
    outputNode: AudioNode;       // 出力 (= volumeGain)
    dspChain: DSPUnit[];         // DSP処理チェーン
    muted: boolean;              // ミュート状態
    solo: boolean;               // ソロ状態
    userVolume?: number;         // ユーザー設定音量
    analyser?: AnalyserNode;     // レベル測定
    insertEffects?: EffectInstance[]; // 挿入エフェクト
}
```

**トラック内信号フロー**:
```
Input Source → inputNode → [insertEffects] → volumeGain → outputNode
```

**トラックに対して行われる処理**:
- **音量制御**: `volumeGain`によるゲイン調整
- **ミュート/ソロ**: トラック単位でのオン/オフ制御
- **エフェクト処理**: `insertEffects`によるインサートエフェクト
- **DSP処理**: `dspChain`による高度な信号処理
- **レベル測定**: `analyser`による音量レベル監視
- **状態永続化**: 設定の保存/復元

### 4. LogicInputs (論理入力管理)
- **LogicInput構造**:
  - `assignedDeviceId`: 割り当てられた物理デバイス
  - `routing`: {synth, effects, monitor} のルーティング設定
  - `gain`: 入力ゲイン
  - `trackId`: 関連付けられたTrack ID
- **DeviceAssignment**: 物理デバイスとのマッピング

## Phase 5 Live Performanceでの活用

### ライブミキサーとしての活用

#### 基本的なトラック割り当て
```
[UR22C Input 1] ──► [LogicInput 1] ──► [Track 1 (mic)] ──► [BusManager]
[UR22C Input 2] ──► [LogicInput 2] ──► [Track 2 (mic)] ──► [synthBus/effectsBus/monitorBus]
[Internal Synth] ──► [LogicInput 3] ──► [Track 3 (faust)] ──► [Master Output]
```

#### Click（メトロノーム）の専用トラック割り当て
```
[Metronome Generator] ──► [Track 4 (custom: 'click')] ──► [monitorBus]
```

**Clickトラックの特徴**:
- **TrackKind**: `custom` (専用用途として 'click' サブタイプ)
- **ルーティング**: 主に `monitorBus` へ出力（パフォーマーへのガイド用）
- **制御**: 独立した音量/ミュート制御
- **タイミング**: MusicalTimeManagerと同期

**拡張機能（Phase 5対応）**:
- **動的テンポ制御**: リアルタイムでのテンポ変更（BPM変化、拍子変更）
- **プログラム制御**: 自動テンポ変化、フェードイン/アウト
- **外部制御**: MIDI/OSC経由でのテンポ制御
- **音声データカウント**: カウントダウン音声の再生機能
- **拍の種類表現**: ダウンビート/強拍/弱拍の異なる音色
- **ビジュアル同期**: クリック音と視覚フィードバックの同期

**Clickトラックの高度な制御例**:
```typescript
// テンポ変更（プログラム制御）
clickTrack.setTempo(140, 4, 4);  // 140 BPM, 4/4拍子

// カウントダウン音声（音声データ使用）
clickTrack.playCountdown("three-two-one-go.wav");

// 外部制御（MIDI経由）
clickTrack.enableMidiControl(true);

// フェード制御
clickTrack.fadeIn(2.0);  // 2秒でフェードイン
clickTrack.fadeOut(1.0); // 1秒でフェードアウト
```

**ライブパフォーマンスでの活用**:
- **リハーサル時**: 安定したテンポガイド
- **本番時**: プログラムによる動的テンポ変化
- **特殊効果**: カウントダウン音声による演出
- **外部同期**: DAWや他のデバイスとの同期

### 概念の対応関係
- **チャンネル**: Track = ミキサーのチャンネル
- **入力**: LogicInput = チャンネルへの入力ソース
- **バス**: BusManagerの3バス = ミキサーのバス
- **エフェクト**: Track.insertEffects + BusManager.effectsChain = チャンネル/マスターエフェクト

### ライブコントロールの設計
- **チャンネル・ストリップ**: Track UI (volume, mute, solo, effects)
- **ルーティング・マトリックス**: LogicInput.routing UI
- **マスター・セクション**: BusManagerのマスターコントロール
- **モニター・コントロール**: monitorBusの設定
- **Clickコントロール**: メトロノームのオン/オフ、音量、テンポ設定

### トラック間接続の仕組み

#### トラック内接続
各トラックは独立した信号処理チェーンを持ちます：
- **inputNode** → **insertEffects** → **volumeGain** → **outputNode**

#### トラック間接続（BusManager経由）
```
Track 1 Output ──┐
Track 2 Output ──┼─► BusManager ──► Master Output
Track 3 Output ──┘
Click Track Output ──► Monitor Bus (パフォーマー用)
```

#### バス接続の詳細
- **`synthBus`**: メインのミックス出力
- **`effectsBus`**: エフェクト処理後の出力
- **`monitorBus`**: パフォーマー/モニター用出力（Click含む）

この構造により、各トラックは独立して制御可能でありながら、最終的なミキシングで統合されます。
