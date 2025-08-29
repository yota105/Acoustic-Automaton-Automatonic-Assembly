# リハーサル用テスト実装計画

## 概要
リハーサルでのテスト用に、セクション1の基本機能を実装する。
奏者の演奏に対する音響処理とコントローラーからの電子音生成を含む。

## 実装要件

### 1. 奏者の演奏検出と持続音生成
#### 目的
- 奏者の任意タイミングでの演奏を検出
- 一定音量を超えた場合に発音として認識
- 認識された音が持続し続ける処理

#### 実装方針
1. **音量検出システム**
   - 各マイク入力（Horn1, Horn2, Trombone）に対してリアルタイム音量監視
   - 閾値を超えた場合にトリガー発動
   - 閾値はパフォーマンスウィンドウから調整可能

2. **持続音生成**
   - 検出時点での音高を分析（FFT使用）
   - 検出された音高でサスティン音を生成
   - Faustの`os.osc`とADSRエンベロープを使用
   - サスティンフェーズを延長して持続効果

3. **インスタンス管理**
   - 各発音を独立したインスタンスとして管理
   - 最大インスタンス数の制限（デフォルト: 10個）
   - 古いインスタンスから自動削除

### 2. 電子音の手動発音
#### 目的
- コントローラーのボタン操作による電子音生成
- 生成された電子音も持続

#### 実装方針
1. **パフォーマンスウィンドウに制御追加**
   - "電子音発音"ボタンを追加
   - 音高選択スライダー（B3-B5範囲）
   - 音量調整スライダー

2. **電子音生成システム**
   - 指定音高でのオシレーター生成
   - 奏者の音と同様の持続処理
   - 視覚的フィードバック（軸線の表示）

### 3. パラメーター制御システム
#### 目的
- インスタンス最大数の調整
- 音高移動範囲の設定

#### 実装方針
1. **パフォーマンスウィンドウにスライダー追加**
   - インスタンス最大数: 1-20個
   - 音高範囲下限: B2-B4
   - 音高範囲上限: B4-B6
   - 音量検出閾値: 0.01-0.5

2. **リアルタイム調整**
   - スライダー変更時に即座に反映
   - 現在の設定値をビジュアル表示

## 技術実装詳細

### ファイル構成
```
src/
├── works/acoustic-automaton/
│   ├── rehearsal/
│   │   ├── triggerDetection.ts      # 音量検出システム
│   │   ├── sustainedToneManager.ts  # 持続音管理
│   │   └── electronicToneGenerator.ts # 電子音生成
│   └── performance/
│       └── performanceController.ts # 既存のパフォーマンス制御
├── visualizers/
│   └── rehearsalVisualizer.ts       # リハーサル用ビジュアル
public/dsp/
└── rehearsal_section1.dsp           # リハーサル用DSP
```

### 主要コンポーネント

#### 1. TriggerDetection (triggerDetection.ts)
```typescript
interface TriggerDetectionConfig {
  threshold: number;        // 検出閾値
  minDuration: number;      // 最小持続時間
  instruments: string[];    // 対象楽器
}

class TriggerDetection {
  detectTrigger(audioData: Float32Array): TriggerEvent | null
  setThreshold(value: number): void
  startMonitoring(): void
  stopMonitoring(): void
}
```

#### 2. SustainedToneManager (sustainedToneManager.ts)
```typescript
interface SustainedTone {
  id: string;
  frequency: number;
  amplitude: number;
  startTime: number;
  instrument: string;
  audioNode: AudioNode;
}

class SustainedToneManager {
  maxInstances: number;
  activeTones: Map<string, SustainedTone>;
  
  addTone(frequency: number, instrument: string): string
  removeTone(id: string): void
  setMaxInstances(count: number): void
  getAllTones(): SustainedTone[]
}
```

#### 3. ElectronicToneGenerator (electronicToneGenerator.ts)
```typescript
interface ElectronicToneConfig {
  frequency: number;
  amplitude: number;
  waveform: 'sine' | 'square' | 'sawtooth';
}

class ElectronicToneGenerator {
  generateTone(config: ElectronicToneConfig): string
  setFrequencyRange(min: number, max: number): void
  triggerManualTone(): void
}
```

### DSP実装 (rehearsal_section1.dsp)
```faust
import("stdfaust.lib");

// 基本パラメーター
freq = hslider("frequency", 493.88, 200, 800, 0.01);
gain = hslider("gain", 0.5, 0, 1, 0.01);
gate = button("gate");
sustain = hslider("sustain", 0.8, 0, 1, 0.01);

// ADSR with extended sustain
envelope = en.adsr(0.1, 0.2, sustain, 2.0, gate);

// Oscillator with reverb
oscillator = os.osc(freq) * envelope * gain;
reverbed = oscillator : re.zita_rev1_stereo(0.3, 0.5, 0.8, 0.2);

process = reverbed;
```

## パフォーマンスウィンドウUI追加

### 新規コントロールパネル
```html
<div class="control-section">
    <h3>リハーサル制御</h3>
    
    <!-- 電子音発音 -->
    <div class="electronic-control">
        <button class="button" id="trigger-electronic">電子音発音</button>
        <label>音高: <input type="range" id="electronic-pitch" min="200" max="800" value="493.88"></label>
        <span id="pitch-display">B4</span>
    </div>
    
    <!-- インスタンス制御 -->
    <div class="instance-control">
        <label>最大インスタンス数: <input type="range" id="max-instances" min="1" max="20" value="10"></label>
        <span id="instances-display">10</span>
    </div>
    
    <!-- 音高範囲制御 -->
    <div class="pitch-range-control">
        <label>音高下限: <input type="range" id="pitch-min" min="100" max="400" value="200"></label>
        <label>音高上限: <input type="range" id="pitch-max" min="400" max="1000" value="800"></label>
    </div>
    
    <!-- 検出閾値 -->
    <div class="threshold-control">
        <label>検出閾値: <input type="range" id="detection-threshold" min="0.01" max="0.5" step="0.01" value="0.1"></label>
        <span id="threshold-display">0.1</span>
    </div>
</div>
```

## 実装フェーズ

### フェーズ1: 基本検出システム
1. 音量検出システムの実装
2. 基本的な持続音生成
3. パフォーマンスウィンドウへの制御追加

### フェーズ2: 高度な制御
1. 音高分析の実装
2. インスタンス管理システム
3. リアルタイムパラメーター調整

### フェーズ3: 最適化とテスト
1. レイテンシー最適化
2. ビジュアルフィードバック改善
3. リハーサル環境でのテスト

## 期待される動作

### 奏者の演奏時
1. マイク入力の音量が閾値を超える
2. 音高が分析され、対応する持続音が生成
3. ビジュアライザーで該当セクションがフラッシュ
4. 軸線が表示され、ゆっくりと減衰

### 電子音発音時
1. ボタンクリックで指定音高の電子音生成
2. 持続音として追加
3. 軸線のみ表示（セクションフラッシュなし）

### パラメーター調整時
1. スライダー操作で即座に設定変更
2. 既存インスタンスにも適用
3. 上限を超えたインスタンスは自動削除

## テスト項目
- [ ] 各楽器の音量検出
- [ ] 持続音の生成と管理
- [ ] 電子音の手動生成
- [ ] パラメーター調整の反映
- [ ] インスタンス数制限の動作
- [ ] ビジュアルフィードバック
- [ ] レイテンシーの確認
