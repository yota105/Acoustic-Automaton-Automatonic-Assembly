# トロンボーン音高修正計画

## 問題の説明

### 現在の誤り
トロンボーン(player3)の音高指定が**1オクターブ低すぎる**状態になっています。

**原因:**
1. ホルン(player1, player2)は**ト音記号**で`B4`を演奏
2. トロンボーンは**ヘ音記号**で`B3`と指定
3. しかし、**ヘ音記号の五線上での位置**が間違っている
   - ト音記号の`B4`の位置(第3線)をそのまま使用
   - ヘ音記号の第3線は実際には`D3`
   - つまり実音は`D3`、プールによっては**D2付近**になっている

### 正しい音高関係
- ホルン(B4) → トロンボーン(B3) = **1オクターブ下**
- VexFlowの表記: ヘ音記号で`B3`と書いても、実際の五線位置は`B4`と同じコード

---

## 修正箇所リスト

### 1. Section A 初期スコア
```typescript
// 修正前
SECTION_A_INITIAL_SCORE = {
    player3: {
        clef: 'bass',
        notes: 'B3/q',  // ❌ 実音D3
        ...
    }
}

// 修正後
SECTION_A_INITIAL_SCORE = {
    player3: {
        clef: 'bass',
        notes: 'B4/q',  // ✅ 実音B3 (ホルンのB4の1オクターブ下)
        ...
    }
}
```

---

### 2. Section B Stage 2 Bass Pool
```typescript
// 修正前
const SECTION_B_STAGE2_BASS_POOL = ['Bb3', 'B3', 'C4'] as const;
// ❌ 実音: Db3, D3, E3

// 修正後
const SECTION_B_STAGE2_BASS_POOL = ['Bb4', 'B4', 'C5'] as const;
// ✅ 実音: Bb3, B3, C4 (ホルンプールの1オクターブ下)
```

---

### 3. Section B Stage 3 Bass Pool
```typescript
// 修正前
const SECTION_B_STAGE3_BASS_POOL = ['Bb3', 'B3', 'C4', 'C#4'] as const;
// ❌ 実音: Db3, D3, E3, F3

// 修正後
const SECTION_B_STAGE3_BASS_POOL = ['Bb4', 'B4', 'C5', 'C#5'] as const;
// ✅ 実音: Bb3, B3, C4, C#4 (ホルンプールの1オクターブ下)
```

---

### 4. Final Stage Bass Pool
```typescript
// 修正前
const FINAL_STAGE_BASS_POOL = ['Ab3', 'A3', 'Bb3', 'B3', 'C4', 'C#4', 'D4'] as const;
// ❌ 実音: B2, C3, Db3, D3, E3, F3, F#3

// 修正後
const FINAL_STAGE_BASS_POOL = ['Ab4', 'A4', 'Bb4', 'B4', 'C5', 'C#5', 'D5'] as const;
// ✅ 実音: Ab3, A3, Bb3, B3, C4, C#4, D4 (ホルンプールの1オクターブ下)
```

---

### 5. Section B 個別イベント内の直接指定

以下のイベント内で`player3`の音高を**全て1オクターブ上げる**:

#### Initial Next Display (line ~464)
```typescript
player3: {
    clef: 'bass',
    notes: 'B3/q',  // → 'B4/q'
    ...
}
```

#### Entry Notifications (line ~546)
```typescript
player3: {
    clef: 'bass',
    notes: 'B3/q',  // → 'B4/q'
    ...
}
```

#### Current Notation - Stage 2 (line ~580付近)
```typescript
player3: {
    clef: 'bass',
    notes: `${sectionBStage2Assigned.player3}/q`,  // ✅ プール修正により自動対応
    ...
}
```

#### Sustain Preview & Execution (line ~710, ~790付近)
```typescript
player3: {
    clef: 'bass',
    notes: `${sectionBStage3Assigned.player3}/q`,  // ✅ プール修正により自動対応
    ...
}
```

#### Rest Preview & Execution (line ~884, ~964付近)
```typescript
player3: {
    clef: 'bass',
    notes: `${finalStageAssignedBassNote}/q`,  // ✅ プール修正により自動対応
    ...
}
```

#### Horn1 Sustain stages (line ~1058, ~1136付近)
```typescript
player3: {
    clef: 'bass',
    notes: `${finalStageAssignedBassNote}/q`,  // ✅ プール修正により自動対応
    ...
}
```

#### Final Rest stages (line ~1228, ~1304, ~1380付近)
```typescript
player3: {
    clef: 'bass',
    notes: 'wr',  // ✅ 休符なので修正不要
    ...
}
```

---

## 修正の影響範囲

### 自動修正される箇所（プール変数使用）
- `sectionBStage2Assigned.player3`を使用している全イベント
- `sectionBStage3Assigned.player3`を使用している全イベント  
- `finalStageAssignedBassNote`を使用している全イベント

### 手動修正が必要な箇所
- Section A初期スコアの`player3.notes`
- Section B最初のNext/Entry notificationsの`player3.notes`（固定で`B3`と書かれている箇所）

---

## 検証方法

修正後、以下を確認:
1. Section A開始時、トロンボーンが**ホルンの1オクターブ下**で鳴っているか
2. Section Bの各ステージで、トロンボーンの音高範囲がホルンより**完全8度低い**か
3. 楽譜表示で、ヘ音記号の五線上の位置が適切か（B3はヘ音記号の第1線の上）

---

## 音域参考

### ホルン(ト音記号)
- Stage 1: B4
- Stage 2: Bb4~C5
- Stage 3: Bb4~C#5  
- Final: Ab4~D5

### トロンボーン(ヘ音記号)
- Stage 1: B3 (表記はB4)
- Stage 2: Bb3~C4 (表記はBb4~C5)
- Stage 3: Bb3~C#4 (表記はBb4~C#5)
- Final: Ab3~D4 (表記はAb4~D5)

**重要:** VexFlowの仕様上、ヘ音記号での実音B3を表記するには`B4`と書く必要がある
