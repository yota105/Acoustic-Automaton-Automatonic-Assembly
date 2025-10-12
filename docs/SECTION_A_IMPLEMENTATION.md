# Section A: Implementation Specification

## 概要

Section Aは導入部として、演奏者がランダムなタイミングでH4（ロ音）を演奏し、ライブエレクトロニクスがそれを加工・模倣する構造。

**コンセプト**: 音響的オートマトン（電子音響）が演奏者の演奏を学習し、4人目の奏者として振る舞う。

---

## 1. 演奏指示システム (Player → 演奏者)

### 1.1 基本フロー

```
[1秒のキュー表示] → [カウントダウン] → [0秒で演**ステップ2: Faust Granular ExtenderにAudioBufferを渡す**
```typescript
// FaustノードにAudioBufferをロード
async function loadGranularExtender(tailBuffer: AudioBuffer) {
    const faustNode = await loadFaustDSP('granular_extender.dsp');→ [Now/Next通知]
```

### 1.2 演奏パラメータ

| パラメータ | 値 | 備考 |
|-----------|-----|------|
| **音高** | H4 (B4) | ロ音、約493.88Hz |
| **音価** | 16分音符 | 拍子なし |
| **アーティキュレーション** | Staccato | 短く切る |
| **ダイナミクス** | mf (mezzo forte) | 中強音 |
| **指示テキスト** | None | 演奏解釈の指示なし |

### 1.3 タイミング制御

#### ランダムタイミング生成

```typescript
interface TimingParameters {
    minInterval: number;      // 最小間隔（ミリ秒）
    maxInterval: number;      // 最大間隔（ミリ秒）
    distribution: 'uniform' | 'gaussian' | 'exponential';  // 分布タイプ
    // Gaussianの場合
    mean?: number;            // 平均値
    stdDev?: number;          // 標準偏差
}
```

#### タイミング変化パラメータ

```typescript
interface TimingEvolution {
    startParams: TimingParameters;   // 開始時のパラメータ
    endParams: TimingParameters;     // 終了時のパラメータ
    duration: number;                // 変化の持続時間（秒）
    interpolation: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}
```

**実装方針**: 
- Section A開始時: 間隔が長い（例: 4000-7000ms）
- Section A終了時: 間隔が短くなる（例: 1500-4000ms）
- 線形補完で段階的に変化

### 1.4 Now/Next通知システム

```typescript
interface PerformanceNotification {
    type: 'now' | 'next';
    scoreData: {
        clef: 'treble' | 'bass';     // Horn: treble, Trombone: bass
        notes: 'B4/16';               // H4, 16分音符
        articulations: ['staccato'];
        dynamics: ['mf'];
        instructionText?: string;     // None
        techniqueText?: string;       // None
        staveWidth: number;           // 楽譜幅
    };
    countdown?: number;               // 'next'の場合、カウントダウン時間（秒）
    targetPlayer: string;             // "player1" | "player2" | "player3"
}
```

#### Now/Next表示ロジック

```
Now表示: 現在演奏すべき音符（実行直前に表示）
Next表示: 次に演奏する音符（1秒前に表示、カウントダウン付き）

Timeline:
[-1秒] Next表示 + カウントダウン開始
[0秒]  Now表示 + 演奏実行 + 次のNextスケジュール
```

---

## 2. ライブエレクトロニクス処理

### 2.1 録音システム

#### 録音仕様

```typescript
interface PerformanceRecording {
    id: string;                       // 録音ID
    performerId: string;              // "player1" | "player2" | "player3"
    timestamp: number;                // 録音開始時刻（AudioContext時間）
    duration: number;                 // 録音長（ミリ秒）
    audioBuffer: AudioBuffer;         // 録音データ
    pitch: number;                    // 音高（Hz）
    dynamics: string;                 // ダイナミクス（"mf"）
}
```

#### 録音トリガー

- 演奏者がH4を演奏した直後に自動録音開始
- 録音長: 演奏音の持続時間 + 300ms（余韻を含む）
- 保存形式: AudioBuffer（メモリ内）

### 2.2 リバーブ処理（Faust実装）

#### リバーブパラメータ

**使用するFaustアルゴリズム**: `dm.zita_rev1` または `dm.freeverb`

```faust
// reverb_processor.dsp
import("stdfaust.lib");

// パラメータ定義
roomSize = hslider("roomSize", 0.9, 0.0, 1.0, 0.01);
damping = hslider("damping", 0.3, 0.0, 1.0, 0.01);
wetLevel = hslider("wetLevel", 0.8, 0.0, 1.0, 0.01);
dryLevel = hslider("dryLevel", 0.2, 0.0, 1.0, 0.01);
width = hslider("width", 1.0, 0.0, 1.0, 0.01);

// Zita Reverbを使用（高品質ステレオリバーブ）
reverb_processor = _ <: (dm.zita_rev1(
    /* pre_delay */ 0,
    /* low_RT60 */ roomSize * 10 + 2,  // 低域残響時間
    /* mid_RT60 */ roomSize * 8 + 1.5, // 中域残響時間
    /* hf_damping */ 1500 * (1 - damping) + 1000, // 高域減衰
    /* eq1_freq */ 315,
    /* eq1_level */ 0,
    /* eq2_freq */ 1500,
    /* eq2_level */ 0,
    /* mix */ 1.0,
    /* level */ 0
) : _*wetLevel, _*wetLevel), (_*dryLevel, _*dryLevel) :> _, _;

process = reverb_processor;
```

**Section A用設定:**
```typescript
const sectionAReverbSettings = {
    roomSize: 0.9,      // 大きな空間（Faustパラメータ: 0.9）
    damping: 0.3,       // 長い残響（Faustパラメータ: 0.3）
    wetLevel: 0.8,      // リバーブ成分大
    dryLevel: 0.2,      // 原音小
    width: 1.0          // 最大ステレオ幅
};
```

**実装アプローチ:**
- FaustコードをWebAssemblyにコンパイル
- `loadFaustDSP('reverb_processor.dsp')`で動的ロード
- AudioWorkletとして統合

### 2.3 音の引き伸ばし（Faust Granular Extender）

#### 処理方針

スタッカートの演奏は長さが不安定なため、単純なタイムストレッチではなく、**リバーブ処理後の音響テクスチャをソース**として、**Faustのグラニュラー合成**で引き伸ばす。

#### 処理フロー

```
[演奏録音] → [Faustリバーブ] → [リバーブテール抽出] → [Faust Granular Extender] → [長時間持続音]
```

#### Faust Granular Extenderの仕様

**使用するFaustアルゴリズム**: カスタムグラニュラーエンジン（`soundfile` プリミティブを使用）

```faust
// granular_extender.dsp
import("stdfaust.lib");

// サウンドファイル読み込み（リバーブテール）
soundfile("reverbTail", 2) = reverb_tail_buffer;

// パラメータ
grainSize = hslider("grainSize", 80, 20, 200, 1);        // グレインサイズ（ms）
grainDensity = hslider("grainDensity", 20, 1, 50, 1);   // グレイン密度（個/秒）
grainSpray = hslider("grainSpray", 0.3, 0.0, 1.0, 0.01); // 位置ランダム化
pitchVariation = hslider("pitchVariation", 0, -200, 200, 1); // ピッチ変化（セント）
ampVariation = hslider("ampVariation", 0.2, 0.0, 1.0, 0.01); // 音量ランダム化
pan = hslider("pan", 0.5, 0.0, 1.0, 0.01);               // パン位置
loop = checkbox("loop");                                  // ループ再生

// グレインエンベロープ（ハン窓）
grain_envelope(length) = en.hann(length);

// グラニュラーエンジン
granular_engine = soundfile("reverbTail", 2) : 
    sf.loop(loop) : 
    sf.granulator(
        grainSize / 1000,           // グレインサイズ（秒）
        grainDensity,               // 密度
        grainSpray,                 // スプレー
        pitchVariation / 100,       // ピッチ変化（セミトーン）
        ampVariation                // 音量変化
    ) : 
    sp.panner(pan);

process = granular_engine;
```

**Section A用設定:**
```typescript
const sectionAGranularSettings = {
    grainSize: 80,              // 80msグレイン
    grainDensity: 20,           // 20個/秒（高密度で滑らか）
    grainSpray: 0.3,            // 30%位置ランダム化
    pitchVariation: 0,          // ピッチ変化なし
    ampVariation: 0.2,          // 20%音量ランダム化（自然な揺らぎ）
    pan: 0.5,                   // 中央
    loop: true,                 // ループ有効
    targetDuration: 10.0        // 10秒持続
};

// 代替案: よりテクスチャ的な設定
const sectionAGranularSettingsTexture = {
    grainSize: 120,             // 長めのグレイン
    grainDensity: 15,           // やや低密度
    grainSpray: 0.5,            // 50%ランダム化（抽象的）
    pitchVariation: 50,         // ±50セント（微妙な揺らぎ）
    ampVariation: 0.4,          // 40%音量変化
    pan: 0.5,
    loop: true,
    targetDuration: 10.0
};
```

#### Faustグラニュラー実装の詳細

**ステップ1: リバーブテール抽出（JavaScript/TypeScript）**
```typescript
// リバーブ後のAudioBufferからテール部分を抽出
function extractReverbTail(reverbBuffer: AudioBuffer): AudioBuffer {
    const sampleRate = reverbBuffer.sampleRate;
    const attackDuration = 0.05; // 50ms
    const tailDuration = 2.0;    // 2秒
    
    const startSample = Math.floor(attackDuration * sampleRate);
    const length = Math.floor(tailDuration * sampleRate);
    
    // 新しいバッファを作成
    const tailBuffer = new AudioContext().createBuffer(
        reverbBuffer.numberOfChannels,
        length,
        sampleRate
    );
    
    // データをコピー
    for (let ch = 0; ch < reverbBuffer.numberOfChannels; ch++) {
        const srcData = reverbBuffer.getChannelData(ch);
        const dstData = tailBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            dstData[i] = srcData[startSample + i];
        }
    }
    
    return tailBuffer;
}
```

**ステップ2: FaustグラニュラーにAudioBufferを渡す**
```typescript
// FaustノードにAudioBufferをロード
async function loadGranularProcessor(tailBuffer: AudioBuffer) {
    const faustNode = await loadFaustDSP('granular_warp.dsp');
    
    // soundfileにAudioBufferをセット
    faustNode.setSoundfile('reverbTail', tailBuffer);
    
    // パラメータ設定
    faustNode.setParamValue('grainSize', 80);
    faustNode.setParamValue('grainDensity', 20);
    faustNode.setParamValue('grainSpray', 0.3);
    faustNode.setParamValue('loop', 1);
    
    return faustNode;
}
```

**ステップ3: 10秒持続音の生成**
```typescript
// Faust Granular Extenderを10秒間再生してレンダリング
async function renderGranularExtension(
    tailBuffer: AudioBuffer,
    duration: number = 10.0
): Promise<AudioBuffer> {
    const offlineContext = new OfflineAudioContext(
        2,
        duration * 48000,
        48000
    );
    
    const granularNode = await loadGranularExtender(tailBuffer);
    granularNode.connect(offlineContext.destination);
    
    const rendered = await offlineContext.startRendering();
    return rendered;
}
```

### 2.4 減衰制御（Faust Envelope）

#### Faust減衰エンベロープ

```faust
// decay_envelope.dsp
import("stdfaust.lib");

decayTime = hslider("decayTime", 10.0, 1.0, 30.0, 0.1);  // 減衰時間（秒）
decayCurve = hslider("decayCurve", 2.0, 0.5, 4.0, 0.1);  // 減衰カーブ（指数）

// 指数減衰エンベロープ
decay_env = en.ar(0.01, decayTime) : pow(_, decayCurve);

process = _ * decay_env;
```

**可変パラメータ:**
```typescript
// Section A内で減衰時間を変化させる
const decayEvolution = {
    start: { decayTime: 10.0, decayCurve: 2.0 },   // 開始: 10秒で減衰
    end: { decayTime: 20.0, decayCurve: 1.5 },     // 終了: 20秒で減衰（緩やか）
    interpolation: 'linear'
};
```

### 2.5 電子音響による模倣（4人目の奏者・Faust Synthesis）

#### 模倣トリガー条件

```typescript
interface MimicryCondition {
    minRecordings: number;         // 最小録音数（各奏者1回以上）
    allPerformersPlayed: boolean;  // 全員が1回以上演奏したか
}

// 条件
const mimicryTrigger: MimicryCondition = {
    minRecordings: 3,              // player1, player2, player3それぞれ1回
    allPerformersPlayed: true
};
```

#### Faust音色模倣シンセシス

**スペクトル分析（JavaScript）→ Faustシンセシス**

```faust
// mimicry_synth.dsp
import("stdfaust.lib");

// 基本周波数（H4 = 493.88Hz）
baseFreq = 493.88;

// スペクトル成分（録音から抽出したデータ）
// JavaScript側でsetParamValue()で設定
harmonic1_amp = hslider("harmonic1_amp", 1.0, 0.0, 1.0, 0.01);
harmonic2_amp = hslider("harmonic2_amp", 0.8, 0.0, 1.0, 0.01);
harmonic3_amp = hslider("harmonic3_amp", 0.6, 0.0, 1.0, 0.01);
harmonic4_amp = hslider("harmonic4_amp", 0.4, 0.0, 1.0, 0.01);
harmonic5_amp = hslider("harmonic5_amp", 0.3, 0.0, 1.0, 0.01);

// ノイズ成分（ホーン/トロンボーンのブレス音）
noise_level = hslider("noise_level", 0.15, 0.0, 1.0, 0.01);

// エンベロープパラメータ
attack = hslider("attack", 0.05, 0.01, 0.5, 0.01);
decay = hslider("decay", 0.1, 0.01, 1.0, 0.01);
sustain = hslider("sustain", 0.7, 0.0, 1.0, 0.01);
release = hslider("release", 0.15, 0.01, 1.0, 0.01);

// ゲート信号（外部トリガー）
gate = button("gate");

// 加算合成（倍音構造）
additive_synth = 
    os.osc(baseFreq) * harmonic1_amp +
    os.osc(baseFreq * 2) * harmonic2_amp +
    os.osc(baseFreq * 3) * harmonic3_amp +
    os.osc(baseFreq * 4) * harmonic4_amp +
    os.osc(baseFreq * 5) * harmonic5_amp;

// ノイズ成分（フィルター済み）
filtered_noise = no.noise : fi.bandpass(2, 400, 600) * noise_level;

// エンベロープ
env = en.adsr(attack, decay, sustain, release, gate);

// 最終合成
process = (additive_synth + filtered_noise) * env * 0.5;
```

#### 実装アプローチ

**ステップ1: スペクトル分析（JavaScript/TypeScript）**
```typescript
async function analyzeSpectrum(audioBuffer: AudioBuffer): Promise<SpectralProfile> {
    const fft = new FFT(2048);
    const channelData = audioBuffer.getChannelData(0);
    
    // 安定した部分を分析（アタック後50-200ms）
    const startSample = Math.floor(0.05 * audioBuffer.sampleRate);
    const endSample = Math.floor(0.2 * audioBuffer.sampleRate);
    
    const segment = channelData.slice(startSample, endSample);
    const spectrum = fft.forward(segment);
    
    // 倍音成分を抽出（基音の整数倍）
    const fundamentalFreq = 493.88; // H4
    const harmonics = [];
    for (let i = 1; i <= 5; i++) {
        const bin = Math.round(fundamentalFreq * i / (audioBuffer.sampleRate / 2048));
        harmonics.push(spectrum[bin]);
    }
    
    return {
        harmonicAmplitudes: harmonics,
        noiseLevel: calculateNoiseLevel(spectrum),
        envelope: extractEnvelope(audioBuffer)
    };
}
```

**ステップ2: Faustシンセサイザーにパラメータ設定**
```typescript
async function configureMimicSynth(
    spectralProfiles: SpectralProfile[]
): Promise<FaustNode> {
    const faustNode = await loadFaustDSP('mimicry_synth.dsp');
    
    // 3人の演奏者の平均スペクトルを計算
    const avgProfile = averageSpectralProfiles(spectralProfiles);
    
    // Faustパラメータに設定
    faustNode.setParamValue('harmonic1_amp', avgProfile.harmonics[0]);
    faustNode.setParamValue('harmonic2_amp', avgProfile.harmonics[1]);
    faustNode.setParamValue('harmonic3_amp', avgProfile.harmonics[2]);
    faustNode.setParamValue('harmonic4_amp', avgProfile.harmonics[3]);
    faustNode.setParamValue('harmonic5_amp', avgProfile.harmonics[4]);
    faustNode.setParamValue('noise_level', avgProfile.noiseLevel);
    
    // エンベロープ設定
    faustNode.setParamValue('attack', avgProfile.envelope.attack);
    faustNode.setParamValue('decay', avgProfile.envelope.decay);
    faustNode.setParamValue('sustain', avgProfile.envelope.sustain);
    faustNode.setParamValue('release', avgProfile.envelope.release);
    
    return faustNode;
}
```

**ステップ3: ランダムタイミングで発音**
```typescript
// 演奏者のタイミングパターンを模倣
function trigger4thPerformer(faustNode: FaustNode) {
    // ゲート信号を送信（NOTE ON）
    faustNode.setParamValue('gate', 1);
    
    // スタッカート長（150ms）後にゲートOFF
    setTimeout(() => {
        faustNode.setParamValue('gate', 0);
    }, 150);
}
```

---

## 3. メトロノーム・返しシステム

### 3.1 チャンネル構成

```
メインステレオ出力 (L/R): 観客向け
├─ 演奏者の生音（リバーブなし/軽め）
├─ ライブエレクトロニクス音
└─ （メトロノームなし）

奏者別返し出力:
├─ Player1返し (独立チャンネル)
│   ├─ メトロノーム
│   ├─ Player1自身の音
│   └─ 他の演奏者の音（ミックス）
├─ Player2返し (独立チャンネル)
└─ Player3返し (独立チャンネル)
```

### 3.2 メトロノーム設定

```typescript
interface MetronomeSettings {
    enabled: boolean;
    bpm: number;                   // Section A: 60 BPM
    timeSignature: {
        numerator: number;         // 4
        denominator: number;       // 4
    };
    clickSound: 'acoustic' | 'electronic' | 'custom';
    accent: boolean;               // 1拍目をアクセント
    volume: number;                // 音量（0.0 - 1.0）
    routingPerPlayer: {
        [playerId: string]: {
            enabled: boolean;      // この奏者の返しにメトロノームを送る
            volume: number;        // 奏者別音量
        };
    };
}
```

### 3.3 返しミックス

```typescript
interface MonitorMix {
    playerId: string;              // 対象奏者
    sources: {
        metronome: {
            enabled: boolean;
            volume: number;
        };
        selfMonitor: {             // 自分の音
            enabled: boolean;
            volume: number;
            latencyCompensation: number;  // レイテンシ補正（ms）
        };
        otherPlayers: {            // 他の奏者の音
            [otherPlayerId: string]: {
                enabled: boolean;
                volume: number;
            };
        };
        electronics: {             // ライブエレクトロニクス
            enabled: boolean;
            volume: number;
        };
    };
}
```

**実装メモ**: 後で実装（Phase 6）

---

## 4. Section A イベントタイムライン

### 4.1 全体構成

```
Time: 0s ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 60s

[Initialization Phase: 0-5s]
- メトロノーム開始
- タイミングパラメータ初期化
- 録音バッファ準備

[Active Performance Phase: 5-55s]
- ランダムタイミングで演奏指示
- リアルタイム録音・加工
- タイミング間隔が徐々に短縮
- 条件達成後、電子音響模倣開始

[Transition Phase: 55-60s]
- 演奏頻度が最高に
- 次セクションへの準備
```

### 4.2 イベント詳細定義

```typescript
const sectionAEvents: CompositionEvent[] = [
    // === Initialization Phase ===
    {
        id: "section_a_init",
        type: "system",
        at: { type: 'absolute', time: { seconds: 0 } },
        action: "initialize_section_a",
        parameters: {
            timingParams: {
                minInterval: 2000,
                maxInterval: 4000,
                distribution: 'uniform'
            },
            reverbSettings: { /* ... */ },
            stretchSettings: { /* ... */ }
        },
        target: "operator"
    },
    
    {
        id: "section_a_metronome_start",
        type: "audio",
        at: { type: 'absolute', time: { seconds: 0 } },
        action: "start_metronome",
        parameters: {
            bpm: 60,
            timeSignature: { numerator: 4, denominator: 4 },
            routeToMonitorsOnly: true
        },
        target: "all"
    },
    
    // === Active Performance Phase ===
    {
        id: "section_a_performance_start",
        type: "system",
        at: { type: 'absolute', time: { seconds: 5 } },
        action: "start_random_performance_scheduler",
        parameters: {
            performers: ["player1", "player2", "player3"],
            scoreData: {
                notes: "B4/16",
                articulations: ["staccato"],
                dynamics: ["mf"]
            }
        },
        target: "operator"
    },
    
    // タイミング変化（中間点）
    {
        id: "section_a_timing_evolution_1",
        type: "system",
        at: { type: 'absolute', time: { seconds: 30 } },
        action: "update_timing_parameters",
        parameters: {
            minInterval: 1000,
            maxInterval: 2500,
            transitionDuration: 10
        },
        target: "operator"
    },
    
    // タイミング変化（最終段階）
    {
        id: "section_a_timing_evolution_2",
        type: "system",
        at: { type: 'absolute', time: { seconds: 50 } },
        action: "update_timing_parameters",
        parameters: {
            minInterval: 500,
            maxInterval: 1500,
            transitionDuration: 5
        },
        target: "operator"
    },
    
    // === Transition Phase ===
    {
        id: "section_a_performance_end",
        type: "system",
        at: { type: 'absolute', time: { seconds: 55 } },
        action: "stop_random_performance_scheduler",
        target: "operator"
    },
    
    {
        id: "section_a_fadeout",
        type: "audio",
        at: { type: 'absolute', time: { seconds: 58 } },
        action: "fadeout_reverb_tails",
        parameters: {
            duration: 2000
        },
        target: "operator"
    }
];
```

---

## 5. 実装コンポーネント

### 5.1 必要なモジュール

| モジュール | 責任 | ファイル |
|-----------|------|---------|
| **RandomPerformanceScheduler** | ランダムタイミング生成・Now/Next通知 | `src/performance/randomScheduler.ts` |
| **PerformanceRecorder** | 演奏の録音・保存 | `src/audio/performanceRecorder.ts` |
| **FaustReverbProcessor** | Faustリバーブ処理 | `src/audio/effects/faustReverbProcessor.ts` |
| **FaustGranularExtender** | Faustグラニュラー音響処理 | `src/audio/effects/faustGranularExtender.ts` |
| **FaustMimicrySynth** | Faust音色模倣シンセシス | `src/audio/synthesis/faustMimicrySynth.ts` |
| **SpectralAnalyzer** | スペクトル分析（FFT） | `src/audio/analysis/spectralAnalyzer.ts` |
| **MonitorMixManager** | 返しミックス管理 | `src/audio/monitorMix.ts` |

### 5.2 Faustファイル一覧

| Faustファイル | 機能 | パス |
|--------------|------|------|
| **reverb_processor.dsp** | Zita Reverbベースのリバーブ | `public/dsp/reverb_processor.dsp` |
| **granular_extender.dsp** | グラニュラー音響拡張エンジン | `public/dsp/granular_extender.dsp` |
| **decay_envelope.dsp** | 減衰エンベロープ | `public/dsp/decay_envelope.dsp` |
| **mimicry_synth.dsp** | 音色模倣シンセサイザー（加算合成） | `public/dsp/mimicry_synth.dsp` |

### 5.3 データフロー

```
[RandomScheduler]
    ↓ (Now/Next通知)
[BroadcastChannel] → [Player画面] → 演奏者が演奏
    ↓ (マイク入力)
[PerformanceRecorder] → 原音AudioBuffer保存
    ↓
[FaustReverbProcessor] → Faust Reverb → リバーブ後AudioBuffer
    ↓
[リバーブテール抽出]（JS/TS）→ テールAudioBuffer
    ↓
[FaustGranularExtender] → Faust Granular → 長時間持続音
    ↓
[FaustDecayEnvelope] → 減衰適用
    ↓
[出力] メインスピーカー + 各奏者の返し

[録音が3つ以上（全員1回以上演奏）]
    ↓
[SpectralAnalyzer]（JS/TS） → スペクトル分析（FFT）
    ↓
[FaustMimicrySynth] → Faustパラメータ設定 → H4模倣音生成
    ↓
[ランダムタイミングで発音]
```

### 5.4 Faust統合アーキテクチャ

```typescript
// Faust DSP統合パターン
class FaustProcessor {
    private faustNode: AudioWorkletNode;
    
    async initialize(dspFile: string) {
        // 1. Faustファイルをロード＆コンパイル
        this.faustNode = await loadFaustDSP(dspFile);
        
        // 2. AudioWorkletとして登録
        // 3. パラメータマッピング設定
    }
    
    setParameter(name: string, value: number) {
        this.faustNode.setParamValue(name, value);
    }
    
    connect(destination: AudioNode) {
        this.faustNode.connect(destination);
    }
}

// 使用例
const reverbProcessor = new FaustProcessor();
await reverbProcessor.initialize('reverb_processor.dsp');
reverbProcessor.setParameter('roomSize', 0.9);
reverbProcessor.setParameter('wetLevel', 0.8);
```
```

### 5.3 WarpProcessor の詳細構造

```typescript
class WarpProcessor {
    // コアメソッド
    extractReverbTail(reverbBuffer: AudioBuffer): AudioBuffer;
    applyWarp(tailBuffer: AudioBuffer, settings: WarpSettings): AudioBuffer;
    
    // Warpモード別実装
    private applyComplexWarp(buffer: AudioBuffer, factor: number): AudioBuffer;
    private applyTextureWarp(buffer: AudioBuffer, factor: number): AudioBuffer;
    
    // ヘルパーメソッド
    private detectOnsetEnd(buffer: AudioBuffer): number;
    private extractBufferSegment(buffer: AudioBuffer, start: number, duration: number): AudioBuffer;
    private createLoopedBuffer(buffer: AudioBuffer, targetDuration: number, crossfade: number): AudioBuffer;
}
```

**処理パイプライン:**
```
原音録音 → リバーブ → [Warp入力]
                         ↓
                    リバーブテール抽出
                    (アタック50-100ms除去)
                         ↓
                    Warpエンジン選択
                    ├─ Complex: Phase Vocoder + フォルマント保持
                    └─ Texture: Granular Synthesis
                         ↓
                    ループ＆クロスフェード
                         ↓
                    10秒持続音 → [出力]
```

---

## 6. 実装優先順位

### Phase 1: 基本演奏指示システム
- [ ] RandomPerformanceScheduler実装
- [ ] Now/Next表示システム（Player画面）
- [ ] カウントダウン機能

### Phase 2: 録音・基本処理
- [ ] PerformanceRecorder実装
- [ ] メインステレオ出力

### Phase 3: Faustリバーブ処理
- [ ] `reverb_processor.dsp` 作成（Zita Reverb）
- [ ] FaustReverbProcessor TypeScript統合
- [ ] パラメータコントロール実装

### Phase 4: Faustグラニュラー拡張処理
- [ ] `granular_extender.dsp` 作成（soundfile + granulator）
- [ ] FaustGranularExtender TypeScript統合
- [ ] リバーブテール抽出機能（JS/TS）
- [ ] `decay_envelope.dsp` 作成・統合
- [ ] インスタンス管理（複数の持続音の同時再生）

### Phase 5: Faust電子音響模倣
- [ ] SpectralAnalyzer実装（FFT）
- [ ] `mimicry_synth.dsp` 作成（加算合成）
- [ ] FaustMimicrySynth TypeScript統合
- [ ] 4人目の奏者ロジック（トリガー条件・タイミング）

### Phase 6: 返しシステム
- [ ] MonitorMixManager実装
- [ ] 奏者別メトロノームルーティング
- [ ] 返しミックス設定UI

### Phase 7: パラメータ最適化
- [ ] タイミング分布調整
- [ ] Faustリバーブ/グラニュラー設定微調整
- [ ] スペクトル分析精度向上
- [ ] 実演でのテスト

---

## 7. テスト計画

### 7.1 単体テスト

- タイミング生成の統計的正確性
- 録音品質チェック
- リバーブ音質確認
- **Granular Extender処理のアーティファクトチェック**
  - リバーブテール抽出の正確性
  - グレインサイズ・密度パラメータの音質影響
  - ループクロスフェードのスムーズさ

### 7.2 統合テスト

- Now/Next通知タイミング精度
- 録音トリガーの正確性
- **Granular Extender処理パイプライン全体の動作確認**
  - 録音 → リバーブ → テール抽出 → Granular Extender → 出力
- 電子音響模倣の発動条件

### 7.3 実演テスト

- 演奏者との実際のリハーサル
- タイミング間隔の体感確認
- 音響バランス調整
- **Granular Extender処理結果の音楽的評価**
  - スタッカートの不安定性がどの程度解消されたか
  - 持続音の自然さ・美しさ
  - グレインパラメータの最適値探索

---

## 8. 既知の課題・検討事項

### 8.1 技術的課題

- **レイテンシ**: マイク入力から録音開始までの遅延
- **Granular Extender処理の計算負荷**: グラニュラー合成のリアルタイム処理
- **リバーブテール抽出の精度**: アタック終了点の自動検出
- **スペクトル分析精度**: FFTのリアルタイム処理での計算負荷
- **メモリ管理**: 複数の長時間AudioBufferの同時保持

### 8.2 音楽的検討

- **タイミング間隔**: 演奏者が演奏しやすい間隔は？
- **リバーブ量**: 過度にならず、空間感を出すバランス
- **グラニュラー設定**: 密度・スプレー・グレインサイズの最適値
- **持続音の長さ**: 10秒固定 vs 可変（演奏に応じて変化）
- **電子音響の音量**: 4人目として存在感を持つが、主張しすぎない

### 8.3 Granular Extender特有の検討事項

- **リバーブテールの長さ**: 何秒分抽出するのが最適か（現在2秒を想定）
- **アタック除去のタイミング**: 50ms固定 vs エンベロープ検出による動的判定
- **ループ長**: 1.5-2秒のループで音楽的に自然か
- **クロスフェード長**: 400-500msで十分スムーズか
- **グレインサイズ**: 50-100msどの範囲が最適か
- **グレイン密度**: 密度が高すぎると計算負荷、低すぎると不連続

### 8.4 後回しにする機能

- 映像（Visualizer）との連携
- 詳細な返しミックスUI
- リアルタイムパラメータ調整UI
- Granular Extender処理の可視化UI（デバッグ用）

---

## 9. 次のステップ

1. **このドキュメントのレビュー**: 仕様の確認・修正
2. **composition.tsの更新**: Section Aイベント定義を追加
3. **RandomPerformanceScheduler実装開始**: Phase 1の最初のコンポーネント

---

**作成日**: 2025-10-12  
**バージョン**: 1.0  
**ステータス**: Draft - Implementation Planning
