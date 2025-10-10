# 楽譜表示システム - 使用方法

このドキュメントでは、楽譜表示システムの使用方法を説明します。

## 📋 概要

楽譜表示システムは以下の機能を提供します：

- **柔軟な楽譜データ定義**: 音符、アーティキュレーション、ダイナミクス、指示テキストを含む
- **セクションベースの管理**: 各セクションで表示する楽譜を定義
- **奏者別の楽譜**: 各奏者に異なる楽譜を表示可能
- **リアルタイム更新**: BroadcastChannelで楽譜を動的に更新

---

## 🎼 楽譜データの定義方法

### 基本的な楽譜データ

```typescript
import { ScoreData } from './audio/scoreRenderer';

const scoreData: ScoreData = {
    clef: 'treble',              // 音部記号
    notes: 'B4/q',               // 音符 (EasyScore形式)
    articulations: ['staccato'], // アーティキュレーション
    dynamics: ['p'],             // ダイナミクス
    instructionText: 'pizz.',    // 指示テキスト
    staveWidth: 150              // 五線譜の幅
};
```

### 利用可能なプロパティ

#### 1. **clef** (必須)
音部記号を指定します。

```typescript
clef: 'treble' | 'bass' | 'alto' | 'tenor'
```

例:
- `'treble'` - ト音記号（高音部）
- `'bass'` - ヘ音記号（低音部）
- `'alto'` - アルト記号（中音部）
- `'tenor'` - テノール記号

#### 2. **notes** (必須)
VexFlowのEasyScore形式で音符を指定します。

```typescript
notes: string
```

例:
- `'B4/q'` - B4の四分音符
- `'B4/q, C5/q, D5/h'` - B4四分音符、C5四分音符、D5二分音符
- `'A4/q, B4/8, C5/8'` - A4四分音符、B4八分音符、C5八分音符

音符の記法:
- `/q` - 四分音符 (quarter note)
- `/h` - 二分音符 (half note)
- `/w` - 全音符 (whole note)
- `/8` - 八分音符 (eighth note)
- `/16` - 十六分音符 (sixteenth note)

#### 3. **articulations** (オプション)
アーティキュレーション（奏法記号）を指定します。

```typescript
articulations?: Articulation[]

type Articulation = 
    | 'staccato'   // スタッカート (.)
    | 'tenuto'     // テヌート (-)
    | 'accent'     // アクセント (>)
    | 'marcato'    // マルカート (^)
    | 'fermata'    // フェルマータ
    | 'trill'      // トリル (tr)
    | 'mordent'    // モルデント
    | 'turn';      // ターン
```

例:
```typescript
articulations: ['staccato', 'accent']
```

#### 4. **dynamics** (オプション)
ダイナミクス（強弱記号）を指定します。

```typescript
dynamics?: Dynamic[]

type Dynamic = 
    | 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff'
    | 'sfz' | 'fp' | 'crescendo' | 'decrescendo';
```

例:
```typescript
dynamics: ['p']          // ピアノ
dynamics: ['ff', 'sfz']  // フォルティッシモ、スフォルツァンド
```

#### 5. **instructionText** (オプション)
演奏指示テキストを指定します。

```typescript
instructionText?: string
```

例:
```typescript
instructionText: 'pizz.'        // ピチカート
instructionText: 'arco'         // アルコ
instructionText: 'rit.'         // リタルダンド
instructionText: 'with reverb'  // リバーブをかけて
```

#### 6. **techniqueText** (オプション)
奏法指示テキストを指定します。

```typescript
techniqueText?: string
```

例:
```typescript
techniqueText: 'sul pont.'  // 駒寄り
techniqueText: 'con sord.'  // 弱音器付き
```

#### 7. **tempoText** (オプション)
テンポ指示テキストを指定します。

```typescript
tempoText?: string
```

例:
```typescript
tempoText: 'Allegro'
tempoText: 'Lento'
tempoText: 'Presto'
```

---

## 📁 セクションでの楽譜定義

### セクション1の例 (section1.ts)

```typescript
// src/sequence/sections/section1.ts

import { ScoreData } from '../../audio/scoreRenderer';

export const section1ScoreData: {
    horn1: ScoreData;
    horn2: ScoreData;
    trombone: ScoreData;
} = {
    // ホルン1の楽譜
    horn1: {
        clef: 'treble',
        notes: 'B4/q',
        articulations: ['staccato'],
        dynamics: ['p'],
        instructionText: 'with reverb',
        staveWidth: 150
    },
    
    // ホルン2の楽譜
    horn2: {
        clef: 'treble',
        notes: 'B4/q',
        articulations: ['staccato'],
        dynamics: ['p'],
        instructionText: 'with reverb',
        staveWidth: 150
    },
    
    // トロンボーンの楽譜
    trombone: {
        clef: 'bass',
        notes: 'B3/q',
        articulations: ['staccato'],
        dynamics: ['p'],
        instructionText: 'with reverb',
        staveWidth: 150
    }
};

// プレイヤー番号から楽譜を取得
export function getSection1ScoreForPlayer(playerNumber: number): ScoreData {
    switch (playerNumber) {
        case 1: return section1ScoreData.horn1;
        case 2: return section1ScoreData.horn2;
        case 3: return section1ScoreData.trombone;
        default: return section1ScoreData.horn1;
    }
}
```

---

## 🎯 楽譜の表示方法

### 1. 初期表示（player.ts）

```typescript
import { getSection1ScoreForPlayer } from './sequence/sections/section1';

// プレイヤー番号を取得
const playerNum = parseInt(playerNumber) || 1;

// セクション1の楽譜を表示
const scoreData = getSection1ScoreForPlayer(playerNum);
currentScoreRenderer.render(scoreData);
```

### 2. 動的に更新（BroadcastChannel経由）

```typescript
// 楽譜を更新するメッセージを送信
const channel = new BroadcastChannel('performance-control');
channel.postMessage({
    type: 'update-score',
    data: {
        target: 'current',  // 'current' または 'next'
        player: 1,          // 対象プレイヤー（省略時は全員）
        scoreData: {
            clef: 'treble',
            notes: 'C5/q, D5/q',
            dynamics: ['mf'],
            instructionText: 'cresc.'
        }
    }
});
channel.close();
```

### 3. 複雑な楽譜の例

```typescript
// 複数の音符とアーティキュレーション
const complexScore: ScoreData = {
    clef: 'treble',
    notes: 'B4/q[id="n1"], C5/q[id="n2"], D5/h[id="n3"]',
    articulations: ['staccato', 'accent', 'tenuto'],
    dynamics: ['p', 'crescendo', 'f'],
    instructionText: 'with expression',
    techniqueText: 'sul pont.',
    tempoText: 'Allegro moderato',
    staveWidth: 250,
    staveY: 20
};
```

---

## 🔄 イベントベースの楽譜更新

### セクション定義でのイベント

```typescript
// src/sequence/sections/section1.ts

export function createSection1Events(): SectionEvent[] {
    const events: SectionEvent[] = [];

    // 楽譜表示イベント
    events.push({
        id: 'section1_score_init_horn1',
        time: { type: 'absolute', seconds: 0 },
        type: 'score',
        target: 'horn1',
        action: 'showScore',
        parameters: {
            scoreData: section1ScoreData.horn1,
            target: 'current',
            player: 1,
            transition: 'immediate'
        }
    });

    // 次のセクションの楽譜を予告表示
    events.push({
        id: 'section1_score_next',
        time: { type: 'absolute', seconds: 110 },
        type: 'score',
        target: 'all',
        action: 'showScore',
        parameters: {
            scoreData: {
                clef: 'treble',
                notes: 'B4/q, C5/q',
                instructionText: 'moving pitches',
                staveWidth: 200
            },
            target: 'next',
            transition: 'fade'
        }
    });

    return events;
}
```

---

## 💡 実用例

### 例1: セクション開始時の楽譜表示

```typescript
// セクション2の開始時にホルン1に新しい楽譜を表示
events.push({
    id: 'section2_score_horn1',
    time: { type: 'absolute', seconds: 120 },
    type: 'score',
    target: 'horn1',
    action: 'showScore',
    parameters: {
        scoreData: {
            clef: 'treble',
            notes: 'B4/q, C5/q, D5/q, E5/q',
            articulations: ['tenuto'],
            dynamics: ['mp', 'crescendo'],
            instructionText: 'gradually intensifying',
            staveWidth: 250
        },
        target: 'current',
        player: 1
    }
});
```

### 例2: 即興セクションの指示

```typescript
// 即興セクション - 音符なし、指示のみ
const improvisationScore: ScoreData = {
    clef: 'treble',
    notes: '',  // 音符なし
    instructionText: 'Free improvisation',
    techniqueText: 'Use extended techniques',
    tempoText: 'Freely'
};
```

### 例3: 奏者別の異なる楽譜

```typescript
// ホルン1: 高音域
horn1: {
    clef: 'treble',
    notes: 'E5/q, F5/q, G5/h',
    dynamics: ['f']
}

// ホルン2: 中音域
horn2: {
    clef: 'treble',
    notes: 'B4/q, C5/q, D5/h',
    dynamics: ['mf']
}

// トロンボーン: 低音域
trombone: {
    clef: 'bass',
    notes: 'E3/q, F3/q, G3/h',
    dynamics: ['p']
}
```

---

## 🎨 今後の拡張予定

現在の実装では、`articulations`, `dynamics`, `instructionText` などのプロパティは型定義されていますが、実際のレンダリングには未対応です。

今後、以下の機能を実装予定：
- アーティキュレーション記号の描画
- ダイナミクス記号の描画
- 指示テキストの表示
- より高度なVexFlow APIの活用

---

## まとめ

楽譜表示システムの使い方：

1. **楽譜データを定義** (`section1.ts` など)
2. **セクション開始時に表示** (`getSection1ScoreForPlayer`)
3. **動的に更新** (`BroadcastChannel` 経由)
4. **イベントで制御** (`createSection1Events`)

これにより、作曲内容に応じた柔軟な楽譜表示が可能になります！
