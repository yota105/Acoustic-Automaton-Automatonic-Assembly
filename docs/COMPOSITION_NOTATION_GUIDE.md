# Composition Notation Guide - 作品記述記法ガイド

このドキュメントでは、`src/works/composition.ts` での作品構造記述の記法を説明します。

## 📋 目次

1. [概要](#概要)
2. [奏者の定義](#奏者の定義)
3. [時間の表現方法](#時間の表現方法)
4. [テンポ・拍子の定義](#テンポ拍子の定義)
5. [イベントの記述](#イベントの記述)
6. [奏者別の指示](#奏者別の指示)
7. [セクション構造](#セクション構造)
8. [作品全体の定義](#作品全体の定義)
9. [実践例](#実践例)

---

## 概要

`composition.ts` は作品の時間構造を一元管理するファイルです。以下を統合的に記述できます：

- 演奏者の定義と役割
- 音楽的時間（小節・拍・細分化）
- 絶対時間（秒数）
- テンポ・拍子変化
- イベント（音響・視覚・キュー・システム制御）
- **各奏者への個別指示**
- セクション構造
- 演奏指示

---

## 奏者の定義

まず、作品に参加する奏者を定義します。

### Performer インターフェース

```typescript
interface Performer {
    id: string;                  // 奏者ID（例: "player1", "vocalist"）
    name: string;                // 表示名（例: "演奏者A", "ボーカリスト"）
    role?: string;               // 役割（例: "主奏者", "即興演奏者"）
    instrument?: string;         // 楽器（例: "saxophone", "percussion"）
    color?: string;              // UI表示用の色
    displayOrder?: number;       // 表示順序
}
```

**例:**
```typescript
performers: [
    {
        id: "player1",
        name: "演奏者A",
        role: "主奏者",
        instrument: "saxophone",
        color: "#4CAF50",
        displayOrder: 1
    },
    {
        id: "player2",
        name: "演奏者B",
        role: "即興演奏者",
        instrument: "percussion",
        color: "#2196F3",
        displayOrder: 2
    },
    {
        id: "player3",
        name: "演奏者C",
        role: "補助奏者",
        instrument: "electronics",
        color: "#FF9800",
        displayOrder: 3
    }
]
```

---

## 時間の表現方法

### 1. 音楽的時間 (`MusicalTime`)

小節・拍・細分化で時間を指定します。

```typescript
interface MusicalTime {
  bar: number;           // 小節番号（1始まり）
  beat: number;          // 拍番号（1始まり）
  subdivision?: number;  // 細分化（オプション）
}
```

**例:**
```typescript
// 第5小節1拍目
{ bar: 5, beat: 1 }

// 第12小節3拍目
{ bar: 12, beat: 3 }

// 第20小節2拍目の2細分（8分音符など）
{ bar: 20, beat: 2, subdivision: 2 }
```

### 2. 絶対時間 (`AbsoluteTime`)

秒数で時間を指定します。

```typescript
interface AbsoluteTime {
  seconds: number;
}
```

**例:**
```typescript
// 30秒
{ seconds: 30 }

// 2分30秒（150秒）
{ seconds: 150 }
```

### 3. 時間指定の統合型 (`TimePoint`)

音楽的時間、絶対時間、またはキュー待ちのいずれかで指定します。

```typescript
type TimePoint = 
  | { type: 'musical'; time: MusicalTime }
  | { type: 'absolute'; time: AbsoluteTime }
  | { type: 'cue'; cueId: string };
```

**例:**
```typescript
// 音楽的時間で指定
{
  type: 'musical',
  time: { bar: 10, beat: 1 }
}

// 絶対時間で指定
{
  type: 'absolute',
  time: { seconds: 45 }
}

// キュー待ち（他のイベント完了後）
{
  type: 'cue',
  cueId: 'performer_ready'
}
```

---

## テンポ・拍子の定義

### TempoMarking

```typescript
interface TempoMarking {
  bpm: number;            // テンポ（BPM）
  numerator: number;      // 拍子の分子（例: 4/4なら4）
  denominator: number;    // 拍子の分母（例: 4/4なら4）
  at: TimePoint;          // テンポ変更タイミング
  description?: string;   // 説明（例: "Allegro"）
}
```

**例:**
```typescript
// 初期テンポ: 120 BPM、4/4拍子
{
  bpm: 120,
  numerator: 4,
  denominator: 4,
  at: { type: 'musical', time: { bar: 1, beat: 1 } },
  description: "Moderato"
}

// 第25小節から108 BPMに変更
{
  bpm: 108,
  numerator: 4,
  denominator: 4,
  at: { type: 'musical', time: { bar: 25, beat: 1 } },
  description: "Poco meno mosso"
}

// 第49小節から7/8拍子、96 BPM
{
  bpm: 96,
  numerator: 7,
  denominator: 8,
  at: { type: 'musical', time: { bar: 49, beat: 1 } },
  description: "7/8 - Asymmetric"
}
```

---

## イベントの記述

### イベントタイプ (`EventType`)

```typescript
type EventType = 
  | 'audio'           // 音響イベント（再生・停止など）
  | 'visual'          // 視覚イベント（表示変更など）
  | 'cue'             // パフォーマーへのキュー
  | 'tempo_change'    // テンポ変更
  | 'system'          // システム制御
  | 'notation';       // 楽譜表示
```

### CompositionEvent

```typescript
interface CompositionEvent {
  id: string;              // イベント固有ID
  type: EventType;
  at: TimePoint;           // 発火タイミング
  duration?: TimePoint;    // 持続時間（オプション）
  
  action: string;          // アクション名
  parameters?: Record<string, any>;
  
  label?: string;          // 表示名
  description?: string;    // 説明
  color?: string;          // UIでの色分け
  target?: TargetAudience | string;  // 対象者（奏者別指示が可能）
}
```

**`target` の指定方法については、[奏者別の指示](#奏者別の指示)セクションを参照してください。**

### イベントの例

#### 1. 音響イベント (`audio`)

```typescript
// メトロノーム開始
{
  id: "metronome_start",
  type: "audio",
  at: { type: 'musical', time: { bar: 1, beat: 1 } },
  action: "start_metronome",
  parameters: { volume: 0.3 },
  label: "メトロノーム開始"
}

// トラック開始（フェードイン付き）
{
  id: "track_1_start",
  type: "audio",
  at: { type: 'musical', time: { bar: 17, beat: 1 } },
  action: "start_track",
  parameters: { 
    trackId: "track_1", 
    fadeIn: 2000 
  },
  label: "トラック1開始"
}

// エフェクト有効化
{
  id: "enable_reverb",
  type: "audio",
  at: { type: 'musical', time: { bar: 25, beat: 1 } },
  action: "enable_effect",
  parameters: { 
    effectId: "granular_delay",
    wet: 0.4
  },
  label: "グラニュラーディレイON"
}

// 全体フェードアウト
{
  id: "fadeout_all",
  type: "audio",
  at: { type: 'musical', time: { bar: 81, beat: 1 } },
  duration: { type: 'musical', time: { bar: 12, beat: 1 } },
  action: "fade_out_all",
  parameters: { duration: 12000 },
  label: "全体フェードアウト"
}
```

#### 2. 視覚イベント (`visual`)

```typescript
// フェードイン
{
  id: "visual_fade_in",
  type: "visual",
  at: { type: 'musical', time: { bar: 1, beat: 1 } },
  duration: { type: 'musical', time: { bar: 4, beat: 1 } },
  action: "fade_in",
  parameters: { duration: 4000 },
  label: "ビジュアルフェードイン"
}

// パターン変形
{
  id: "morph_pattern",
  type: "visual",
  at: { type: 'musical', time: { bar: 65, beat: 1 } },
  duration: { type: 'musical', time: { bar: 8, beat: 1 } },
  action: "morph_pattern",
  parameters: { 
    from: "circular",
    to: "fractal",
    duration: 8000
  },
  label: "ビジュアル変形"
}
```

#### 3. キューイベント (`cue`)

```typescript
// 演奏者準備キュー
{
  id: "performer_ready_cue",
  type: "cue",
  at: { type: 'musical', time: { bar: 13, beat: 1 } },
  action: "show_cue",
  parameters: { 
    message: "準備: 4小節後エントリー",
    priority: "high"
  },
  label: "演奏者準備キュー",
  target: "performer",
  color: "#FF9800"
}

// 演奏者エントリー
{
  id: "performer_entry",
  type: "cue",
  at: { type: 'musical', time: { bar: 17, beat: 1 } },
  action: "performer_entry",
  parameters: { instrument: "all" },
  label: "演奏者エントリー",
  target: "performer",
  color: "#4CAF50"
}

// 強度指示
{
  id: "intensity_peak",
  type: "cue",
  at: { type: 'musical', time: { bar: 41, beat: 1 } },
  action: "intensity_cue",
  parameters: { 
    message: "fff - 最大音量へ",
    intensity: 1.0
  },
  label: "強度ピーク",
  target: "all",
  color: "#F44336"
}
```

#### 4. 楽譜表示 (`notation`)

```typescript
{
  id: "show_score_page_1",
  type: "notation",
  at: { type: 'musical', time: { bar: 1, beat: 1 } },
  action: "show_score",
  parameters: { 
    section: "intro", 
    page: 1 
  },
  label: "楽譜ページ1",
  target: "performer"
}
```

#### 5. テンポ変更 (`tempo_change`)

```typescript
{
  id: "tempo_accel",
  type: "tempo_change",
  at: { type: 'musical', time: { bar: 33, beat: 1 } },
  action: "tempo_change",
  parameters: { 
    targetBpm: 132, 
    transitionDuration: { bar: 4, beat: 1 }
  },
  label: "テンポ加速",
  description: "4小節かけて108→132 BPMへ"
}
```

#### 6. システム制御 (`system`)

```typescript
// 和声変化
{
  id: "harmony_change",
  type: "system",
  at: { type: 'musical', time: { bar: 25, beat: 1 } },
  action: "update_harmony",
  parameters: { 
    key: "D", 
    mode: "dorian" 
  },
  label: "和声変化: D Dorian"
}

// 作品終了
{
  id: "composition_end",
  type: "system",
  at: { type: 'musical', time: { bar: 97, beat: 1 } },
  action: "composition_end",
  parameters: { autoStop: true },
  label: "作品終了"
}
```

---

## 奏者別の指示

### TargetAudience 型

各イベントは `target` プロパティで対象者を指定できます。

```typescript
type TargetAudience =
    | 'all'                      // 全員（オペレーター + 全演奏者）
    | 'operator'                 // オペレーターのみ
    | 'performers'               // 全演奏者
    | { performers: string[] }   // 特定の演奏者リスト（IDで指定）
    | { exclude: string[] };     // 特定の演奏者を除外
```

### 指示対象の指定例

#### 1. 全員への指示

```typescript
{
  id: "harmony_change",
  type: "system",
  at: { type: 'musical', time: { bar: 25, beat: 1 } },
  action: "update_harmony",
  parameters: { key: "D", mode: "dorian" },
  label: "和声変化: D Dorian",
  target: "all"  // 全員に通知
}
```

#### 2. オペレーター専用

```typescript
{
  id: "track_1_start",
  type: "audio",
  at: { type: 'musical', time: { bar: 17, beat: 1 } },
  action: "start_track",
  parameters: { trackId: "track_1", fadeIn: 2000 },
  label: "トラック1開始",
  target: "operator"  // オペレーターのみ
}
```

#### 3. 全演奏者への指示

```typescript
{
  id: "notation_display",
  type: "notation",
  at: { type: 'musical', time: { bar: 1, beat: 1 } },
  action: "show_score",
  parameters: { section: "intro", page: 1 },
  label: "楽譜表示",
  target: "performers"  // 全演奏者
}
```

#### 4. 特定の1人への指示

```typescript
{
  id: "player1_entry",
  type: "cue",
  at: { type: 'musical', time: { bar: 17, beat: 1 } },
  action: "performer_entry",
  parameters: { 
    instruction: "長音（ロングトーン）から始める",
    dynamics: "p"
  },
  label: "演奏者A エントリー",
  target: { performers: ["player1"] },  // player1のみ
  color: "#4CAF50"
}
```

#### 5. 複数の特定奏者への指示

```typescript
{
  id: "duo_cue",
  type: "cue",
  at: { type: 'musical', time: { bar: 33, beat: 1 } },
  action: "intensity_increase",
  parameters: { 
    instruction: "デュオで徐々に強く",
    targetDynamics: "f"
  },
  label: "デュオ 強度上昇",
  target: { performers: ["player1", "player2"] },  // player1とplayer2
  color: "#9C27B0"
}
```

#### 6. 除外指定

```typescript
{
  id: "others_fade",
  type: "cue",
  at: { type: 'musical', time: { bar: 65, beat: 1 } },
  action: "fade_out",
  parameters: { 
    instruction: "徐々にフェードアウト",
    duration: { bar: 8, beat: 1 }
  },
  label: "フェードアウト（player3以外）",
  target: { exclude: ["player3"] },  // player3以外の全員
  color: "#607D8B"
}
```

**詳細は [PERFORMER_TARGETING_GUIDE.md](./PERFORMER_TARGETING_GUIDE.md) を参照してください。**

---

## セクション構造

### Section

```typescript
interface Section {
  id: string;
  name: string;
  description?: string;
  
  start: TimePoint;
  end?: TimePoint;
  
  tempo?: TempoMarking;
  events: CompositionEvent[];
  performanceNotes?: string[];
}
```

**例:**
```typescript
{
  id: "section_a_intro",
  name: "A: Introduction",
  description: "静寂から始まる導入部",
  
  start: { type: 'musical', time: { bar: 1, beat: 1 } },
  end: { type: 'musical', time: { bar: 17, beat: 1 } },
  
  events: [
    // イベントリスト
  ],
  
  performanceNotes: [
    "メトロノーム音量は段階的に調整可能",
    "演奏者は16小節目までに演奏準備を完了"
  ]
}
```

---

## 作品全体の定義

### Composition

```typescript
interface Composition {
  title: string;
  composer: string;
  duration: AbsoluteTime;
  created: string;
  version: string;
  
  initialTempo: TempoMarking;
  sections: Section[];
  globalEvents?: CompositionEvent[];
  
  performanceSettings?: {
    metronomeEnabled: boolean;
    clickTrackVolume: number;
    autoScrollNotation: boolean;
    [key: string]: any;
  };
}
```

**例:**
```typescript
export const composition: Composition = {
  title: "Acoustic Automaton / Automatonic Assembly",
  composer: "Yota Nakamura",
  duration: { seconds: 600 },
  created: "2025-10-11",
  version: "1.0.0",
  
  initialTempo: {
    bpm: 120,
    numerator: 4,
    denominator: 4,
    at: { type: 'musical', time: { bar: 1, beat: 1 } },
    description: "Moderato"
  },
  
  sections: [
    // セクションリスト
  ],
  
  performanceSettings: {
    metronomeEnabled: true,
    clickTrackVolume: 0.3,
    autoScrollNotation: true
  }
};
```

---

## 実践例

### 完全なセクション定義

```typescript
{
  id: "section_b_development",
  name: "B: Development",
  description: "演奏者のエントリー。音響的オートマトンとの対話が始まる。",
  
  start: { type: 'musical', time: { bar: 17, beat: 1 } },
  end: { type: 'musical', time: { bar: 49, beat: 1 } },
  
  tempo: {
    bpm: 108,
    numerator: 4,
    denominator: 4,
    at: { type: 'musical', time: { bar: 17, beat: 1 } },
    description: "Poco meno mosso"
  },
  
  events: [
    // 演奏者エントリー
    {
      id: "dev_performer_entry",
      type: "cue",
      at: { type: 'musical', time: { bar: 17, beat: 1 } },
      action: "performer_entry",
      parameters: { instrument: "all" },
      label: "演奏者エントリー",
      target: "performer",
      color: "#4CAF50"
    },
    
    // トラック開始
    {
      id: "dev_track_1_start",
      type: "audio",
      at: { type: 'musical', time: { bar: 17, beat: 1 } },
      action: "start_track",
      parameters: { trackId: "track_1", fadeIn: 2000 },
      label: "トラック1開始"
    },
    
    // 和声変化
    {
      id: "dev_harmony_change",
      type: "system",
      at: { type: 'musical', time: { bar: 25, beat: 1 } },
      action: "update_harmony",
      parameters: { key: "D", mode: "dorian" },
      label: "和声変化: D Dorian"
    },
    
    // テンポ加速
    {
      id: "dev_tempo_accel",
      type: "tempo_change",
      at: { type: 'musical', time: { bar: 33, beat: 1 } },
      action: "tempo_change",
      parameters: { 
        targetBpm: 132, 
        transitionDuration: { bar: 4, beat: 1 }
      },
      label: "テンポ加速",
      description: "4小節かけて108→132 BPMへ"
    }
  ],
  
  performanceNotes: [
    "演奏者は自由な即興を展開",
    "33小節目からテンポが徐々に加速",
    "41小節目でクライマックスに到達"
  ]
}
```

---

## ユーティリティ関数の使用例

### 指定小節のテンポ取得

```typescript
import { getTempoAt } from './works/composition';

const tempo = getTempoAt(composition, 25);
console.log(`Tempo at bar 25: ${tempo.bpm} BPM`);
// 出力: Tempo at bar 25: 108 BPM
```

### 指定小節のセクション取得

```typescript
import { getSectionAt } from './works/composition';

const section = getSectionAt(composition, 30);
console.log(`Section: ${section?.name}`);
// 出力: Section: B: Development
```

### 指定時刻までのイベント取得

```typescript
import { getEventsUpTo } from './works/composition';

const events = getEventsUpTo(composition, 20, 1);
console.log(`Events up to bar 20: ${events.length}`);
```

### 作品の総小節数

```typescript
import { getTotalBars } from './works/composition';

const totalBars = getTotalBars(composition);
console.log(`Total bars: ${totalBars}`);
// 出力: Total bars: 97
```

---

## 関連ドキュメント

- [PERFORMER_TARGETING_GUIDE.md](./PERFORMER_TARGETING_GUIDE.md) - **奏者別指示システムの詳細**
- [HOW_TO_COMPOSE.md](./HOW_TO_COMPOSE.md) - 作曲方法の全体フロー
- [SCORE_SYSTEM_GUIDE.md](./SCORE_SYSTEM_GUIDE.md) - 楽譜表示システム
- [METRONOME_GUIDE.md](./METRONOME_GUIDE.md) - メトロノームシステム

---

## まとめ

`composition.ts` では以下を統合的に記述できます：

✅ **奏者定義**: 名前・役割・楽器・色分け  
✅ **時間表現**: 音楽的時間（小節・拍）と絶対時間（秒）の両対応  
✅ **テンポ管理**: BPM・拍子変更を時系列で定義  
✅ **イベント**: 音響・視覚・キュー・システム制御を一元管理  
✅ **奏者別指示**: 各演奏者への個別指示や除外指定が可能  
✅ **セクション**: 構造化された時間区分と演奏指示  
✅ **メタデータ**: 作品情報とパフォーマンス設定

この記法により、作品の時間構造を明確かつ保守しやすい形で管理できます。
