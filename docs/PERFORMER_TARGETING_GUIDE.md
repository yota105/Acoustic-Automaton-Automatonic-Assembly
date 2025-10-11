# Performer Targeting Guide - 奏者別指示システムガイド

各奏者への個別指示を出す方法を説明します。

## 📋 目次

1. [概要](#概要)
2. [奏者の定義](#奏者の定義)
3. [指示対象の指定方法](#指示対象の指定方法)
4. [実例集](#実例集)
5. [ユーティリティ関数](#ユーティリティ関数)

---

## 概要

`composition.ts` では、各イベントの `target` プロパティを使って、誰に対する指示かを明確に指定できます。

### 対象者の種類

- **全員**: オペレーター + 全演奏者
- **オペレーターのみ**: システム操作担当者
- **全演奏者**: 演奏者全員
- **特定の奏者**: 個別の演奏者を指定
- **除外指定**: 特定の演奏者を除く全員

---

## 奏者の定義

まず、作品に参加する奏者を定義します。

```typescript
export interface Performer {
    id: string;                  // 奏者ID（例: "player1", "vocalist"）
    name: string;                // 表示名（例: "演奏者A", "ボーカリスト"）
    role?: string;               // 役割（例: "主奏者", "即興演奏者"）
    instrument?: string;         // 楽器（例: "saxophone", "percussion"）
    color?: string;              // UI表示用の色
    displayOrder?: number;       // 表示順序
}
```

### 実例

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

## 指示対象の指定方法

### 1. 全員への指示 (`'all'`)

オペレーターと全演奏者に表示されます。

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

### 2. オペレーター専用 (`'operator'`)

システム操作担当者のみに表示されます。

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

### 3. 全演奏者への指示 (`'performers'`)

演奏者全員に表示されます（オペレーターには表示されません）。

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

### 4. 特定の奏者への指示（単一）

特定の1人の演奏者にのみ表示されます。

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

### 5. 複数の特定奏者への指示

複数の演奏者を配列で指定します。

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

### 6. 除外指定

特定の演奏者を除く全員に表示されます。

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

---

## 実例集

### パターン1: 段階的エントリー

各奏者が異なるタイミングでエントリーする場合。

```typescript
events: [
    // 第1段階: 演奏者A（サックス）のエントリー
    {
        id: "entry_player1",
        type: "cue",
        at: { type: 'musical', time: { bar: 17, beat: 1 } },
        action: "performer_entry",
        parameters: { 
            instruction: "ロングトーンで静かに開始",
            dynamics: "p",
            pitch: "B3"
        },
        label: "演奏者A エントリー",
        target: { performers: ["player1"] },
        color: "#4CAF50"
    },
    
    // 第2段階: 演奏者B（パーカッション）のエントリー
    {
        id: "entry_player2",
        type: "cue",
        at: { type: 'musical', time: { bar: 21, beat: 1 } },
        action: "performer_entry",
        parameters: { 
            instruction: "不規則なパルスで参入",
            dynamics: "pp"
        },
        label: "演奏者B エントリー",
        target: { performers: ["player2"] },
        color: "#2196F3"
    },
    
    // 第3段階: 演奏者C（エレクトロニクス）のエントリー
    {
        id: "entry_player3",
        type: "cue",
        at: { type: 'musical', time: { bar: 25, beat: 1 } },
        action: "performer_entry",
        parameters: { 
            instruction: "アンビエントテクスチャを追加",
            effect: "granular_delay"
        },
        label: "演奏者C エントリー",
        target: { performers: ["player3"] },
        color: "#FF9800"
    }
]
```

### パターン2: 個別の強度指示

各奏者に異なる強度変化を指示する場合。

```typescript
events: [
    // 演奏者Aのみクレッシェンド
    {
        id: "player1_crescendo",
        type: "cue",
        at: { type: 'musical', time: { bar: 33, beat: 1 } },
        action: "dynamic_change",
        parameters: { 
            instruction: "4小節かけてクレッシェンド",
            from: "mf",
            to: "ff",
            bars: 4
        },
        label: "演奏者A クレッシェンド",
        target: { performers: ["player1"] },
        color: "#4CAF50"
    },
    
    // 演奏者Bは維持
    {
        id: "player2_sustain",
        type: "cue",
        at: { type: 'musical', time: { bar: 33, beat: 1 } },
        action: "dynamic_change",
        parameters: { 
            instruction: "現在の強度を維持",
            maintain: true
        },
        label: "演奏者B 強度維持",
        target: { performers: ["player2"] },
        color: "#2196F3"
    },
    
    // 演奏者Cはデクレッシェンド
    {
        id: "player3_decrescendo",
        type: "cue",
        at: { type: 'musical', time: { bar: 33, beat: 1 } },
        action: "dynamic_change",
        parameters: { 
            instruction: "4小節かけてデクレッシェンド",
            from: "f",
            to: "p",
            bars: 4
        },
        label: "演奏者C デクレッシェンド",
        target: { performers: ["player3"] },
        color: "#FF9800"
    }
]
```

### パターン3: ソロとバックグラウンド

1人がソロを取り、他の奏者がバックグラウンドに回る場合。

```typescript
events: [
    // 演奏者Aソロ開始
    {
        id: "player1_solo_start",
        type: "cue",
        at: { type: 'musical', time: { bar: 49, beat: 1 } },
        action: "solo_start",
        parameters: { 
            instruction: "ソロ開始 - 自由に即興",
            duration: { bar: 16, beat: 1 }
        },
        label: "演奏者A ソロ開始",
        target: { performers: ["player1"] },
        color: "#4CAF50"
    },
    
    // 他の奏者はバックグラウンドへ
    {
        id: "others_background",
        type: "cue",
        at: { type: 'musical', time: { bar: 49, beat: 1 } },
        action: "to_background",
        parameters: { 
            instruction: "バックグラウンドへ - ソロを支える",
            dynamics: "pp"
        },
        label: "バックグラウンドへ",
        target: { exclude: ["player1"] },  // player1以外
        color: "#9E9E9E"
    }
]
```

### パターン4: デュオとトリオの切り替え

特定の組み合わせで演奏する場合。

```typescript
events: [
    // デュオ（player1 + player2）
    {
        id: "duo_section",
        type: "cue",
        at: { type: 'musical', time: { bar: 65, beat: 1 } },
        action: "duo_start",
        parameters: { 
            instruction: "デュオセクション - 対話的に演奏",
            interaction: "call_and_response"
        },
        label: "デュオセクション",
        target: { performers: ["player1", "player2"] },
        color: "#9C27B0"
    },
    
    // player3は休止
    {
        id: "player3_rest",
        type: "cue",
        at: { type: 'musical', time: { bar: 65, beat: 1 } },
        action: "rest",
        parameters: { 
            instruction: "休止 - 16小節後に再開",
            duration: { bar: 16, beat: 1 }
        },
        label: "演奏者C 休止",
        target: { performers: ["player3"] },
        color: "#FF9800"
    },
    
    // トリオ（全員）
    {
        id: "trio_section",
        type: "cue",
        at: { type: 'musical', time: { bar: 81, beat: 1 } },
        action: "trio_start",
        parameters: { 
            instruction: "トリオセクション - 全員でアンサンブル"
        },
        label: "トリオセクション",
        target: "performers",  // 全演奏者
        color: "#E91E63"
    }
]
```

---

## ユーティリティ関数

### 特定の奏者向けイベントの取得

```typescript
import { getEventsForPerformer, composition } from './works/composition';

// 演奏者Aのイベントのみ取得
const player1Events = getEventsForPerformer(composition, "player1");

console.log(`演奏者Aのイベント数: ${player1Events.length}`);
player1Events.forEach(event => {
    console.log(`- ${event.label} (Bar ${event.at.time.bar})`);
});
```

### オペレーター向けイベントの取得

```typescript
import { getEventsForOperator, composition } from './works/composition';

// オペレーターのイベント取得
const operatorEvents = getEventsForOperator(composition);

console.log(`オペレーターのイベント数: ${operatorEvents.length}`);
```

### イベントが特定の奏者向けかチェック

```typescript
import { isEventForPerformer } from './works/composition';

const event = {
    id: "test_event",
    type: "cue",
    at: { type: 'musical', time: { bar: 1, beat: 1 } },
    action: "test",
    target: { performers: ["player1", "player2"] }
};

console.log(isEventForPerformer(event, "player1")); // true
console.log(isEventForPerformer(event, "player3")); // false
```

### 特定時刻の特定奏者向けイベント取得

```typescript
import { getEventsForPerformerAt, composition } from './works/composition';

// 第17小節1拍目の、演奏者Aへのイベント
const events = getEventsForPerformerAt(composition, "player1", 17, 1);

events.forEach(event => {
    console.log(`イベント: ${event.label}`);
    console.log(`指示: ${event.parameters?.instruction}`);
});
```

---

## まとめ

### 指定方法一覧

| 対象 | 指定方法 | 例 |
|------|----------|-----|
| 全員 | `target: "all"` | オペレーター + 全演奏者 |
| オペレーターのみ | `target: "operator"` | システム操作担当者 |
| 全演奏者 | `target: "performers"` | 演奏者全員 |
| 特定の1人 | `target: { performers: ["player1"] }` | player1のみ |
| 複数の奏者 | `target: { performers: ["player1", "player2"] }` | player1とplayer2 |
| 除外指定 | `target: { exclude: ["player3"] }` | player3以外の全員 |

### ベストプラクティス

✅ **明示的な指定**: 対象者を常に明確に指定する  
✅ **色分け**: 奏者ごとに異なる `color` を設定してUI上で識別しやすくする  
✅ **説明文**: `parameters.instruction` に具体的な演奏指示を記述する  
✅ **タイミング**: 準備時間を考慮し、エントリーの数小節前にキューを出す

---

## 関連ドキュメント

- [COMPOSITION_NOTATION_GUIDE.md](./COMPOSITION_NOTATION_GUIDE.md) - 作品記述記法の全体像
- [HOW_TO_COMPOSE.md](./HOW_TO_COMPOSE.md) - 作曲方法の全体フロー
- [SCORE_SYSTEM_GUIDE.md](./SCORE_SYSTEM_GUIDE.md) - 楽譜表示システム
