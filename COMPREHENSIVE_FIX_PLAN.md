# 総合修正計画

## 現状の問題まとめ

### 1. Section A: 冒頭のtutti問題 ✅ 修正済み
**問題:** 曲開始時に全員が同時にスタッカートを演奏してしまう  
**原因:** 初期primeが`broadcastCountdown: true`で、さらに1秒後に強制的にcurrent表示  
**修正:** `broadcastCountdown: false`に設定し、強制current表示イベントを削除  
**状態:** ✅ 実装済み

---

### 2. Section A: 25-30秒の休止後再開問題 ❌ 未修正
**問題:** 25秒で演奏停止後、30秒で再開されない  
**原因:** 
- 25秒時点で`minInterval: 999999`に設定
- ランダムスケジューラーが次のイベントを約16分後にスケジュール
- 30秒の新設定が既存のタイムアウトに影響しない

**修正方法:**
```typescript
// 修正前: timing.evolution配列内
{
    atSeconds: 25,
    minInterval: 999999,  // ❌ これが問題
    maxInterval: 999999,
    transitionDuration: 0
},

// 修正後: イベント配列内
// 1) 25秒地点の evolution を削除
// 2) 25秒で明示的停止イベントを追加
{
    id: "section_a_pause_25s",
    type: "system",
    at: { type: 'absolute', time: { seconds: 25 } },
    action: "stop_random_performance_scheduler",
    label: "一時停止(25秒)",
    description: "残響のみを聴く時間",
    target: "operator"
},

// 3) 30秒で再起動イベントを追加
{
    id: "section_a_resume_30s",
    type: "system",
    at: { type: 'absolute', time: { seconds: 30 } },
    action: "start_random_performance_scheduler",
    parameters: {
        performers: ['player1', 'player2', 'player3'],
        scoreData: SECTION_A_INITIAL_SCORE,
        initialTiming: {
            minInterval: 3000,
            maxInterval: 5000,
            distribution: 'uniform'
        },
        notificationLeadTime: sectionASettings.notifications.leadTimeSeconds
    },
    label: "演奏再開(30秒)",
    description: "間隔を詰めて再開",
    target: "operator"
}
```

**sectionsConfig.ts の timing.evolution 修正:**
```typescript
timing: {
    evolution: [
        {
            atSeconds: 10,
            minInterval: 4000,
            maxInterval: 6500,
            transitionDuration: 8
        },
        // 25秒の項目を削除
        // {
        //     atSeconds: 25,
        //     minInterval: 999999,
        //     maxInterval: 999999,
        //     transitionDuration: 0
        // },
        // 30秒の項目も削除（start_random_performance_schedulerで新規起動）
        // {
        //     atSeconds: 30,
        //     minInterval: 3000,
        //     maxInterval: 5000,
        //     transitionDuration: 10
        // },
        {
            atSeconds: 35,  // 再開後5秒で適用
            minInterval: 3000,
            maxInterval: 5000,
            transitionDuration: 10
        },
        {
            atSeconds: 50,  // 再開後20秒で適用
            minInterval: 1500,
            maxInterval: 2500,
            transitionDuration: 10
        }
    ]
}
```

---

### 3. トロンボーン音高問題 ❌ 未修正
**問題:** トロンボーン(player3)の音高が1オクターブ低すぎる（実音D2~D3付近）

**原因:**
- VexFlowの仕様: ヘ音記号で実音B3を表記するには`B4`と書く必要がある
- 現在は`B3`と書いているため、実際にはD3が鳴っている

**修正箇所一覧:**

#### A. 定数プールの修正
```typescript
// 修正前
const SECTION_A_INITIAL_SCORE = {
    player3: {
        clef: 'bass',
        notes: 'B3/q',  // ❌
        ...
    }
};
const SECTION_B_STAGE2_BASS_POOL = ['Bb3', 'B3', 'C4'] as const;  // ❌
const SECTION_B_STAGE3_BASS_POOL = ['Bb3', 'B3', 'C4', 'C#4'] as const;  // ❌
const FINAL_STAGE_BASS_POOL = ['Ab3', 'A3', 'Bb3', 'B3', 'C4', 'C#4', 'D4'] as const;  // ❌

// 修正後
const SECTION_A_INITIAL_SCORE = {
    player3: {
        clef: 'bass',
        notes: 'B4/q',  // ✅ 実音B3
        ...
    }
};
const SECTION_B_STAGE2_BASS_POOL = ['Bb4', 'B4', 'C5'] as const;  // ✅
const SECTION_B_STAGE3_BASS_POOL = ['Bb4', 'B4', 'C5', 'C#5'] as const;  // ✅
const FINAL_STAGE_BASS_POOL = ['Ab4', 'A4', 'Bb4', 'B4', 'C5', 'C#5', 'D5'] as const;  // ✅
```

#### B. Section B 個別イベント内の直接指定
以下のイベントで`player3`の`notes: 'B3/q'`を`notes: 'B4/q'`に修正:
- `section_b_prime_next_notation` (line ~464付近)
- `section_b_prime_entry_notifications` (line ~546付近)

その他のイベントは変数参照なので自動対応。

---

### 4. Section B: 固定タイミング同期問題 ❌ 未修正
**問題:** 全パートが固定タイミングで同期している（Section Aの発展形になっていない）

**原因:**
- `prime_now_next_notifications`が固定絶対時刻で発火
- 全員に同時カウントダウン（stagger分のみ遅延）
- Section Aのようなランダム・非同期性がない

**修正方針:**
Section Bもランダムスケジューラーを使用し、音高バリエーションも動的に選択

#### 4-1. Section B用の動的スコア生成機能が必要
**課題:**
- 現在のランダムスケジューラーは固定`scoreData`を全員に送信
- Section Bでは各演奏者が異なる音高を演奏する必要がある
- 音高はプールからランダム選択

**解決案A: スコア生成関数を渡す**
```typescript
// compositionPlayer.ts に追加
interface RandomSchedulerOptions {
    // ... 既存オプション
    scoreDataGenerator?: (performerId: string) => any;  // 新規追加
}

// composition.ts での使用例
{
    id: "section_b_start_random_scheduler",
    type: "system",
    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds } },
    action: "start_random_performance_scheduler",
    parameters: {
        performers: ['player1', 'player2', 'player3'],
        initialTiming: {
            minInterval: 4000,
            maxInterval: 7000,
            distribution: 'uniform'
        },
        notificationLeadTime: 1,
        scoreDataGenerator: (performerId: string) => {
            const isPlayer3 = performerId === 'player3';
            const pool = isPlayer3 
                ? SECTION_B_STAGE2_BASS_POOL 
                : SECTION_B_STAGE2_TREBLE_POOL;
            const pitch = pool[Math.floor(Math.random() * pool.length)];
            
            return {
                clef: isPlayer3 ? 'bass' : 'treble',
                notes: `${pitch}/q`,
                articulations: ['staccato'],
                dynamics: ['mp'],
                instructionText: isPlayer3 
                    ? 'Bb3〜C4帯から抽選された低音で輪郭を固定する。'
                    : 'Bb4〜C5帯からプログラムが抽選した単音で粒子の揺れに追従する。',
                staveWidth: 260
            };
        }
    },
    label: "Section B ランダム演奏開始",
    target: "operator"
}
```

**解決案B: より簡易的なアプローチ（推奨）**
Section Bの各ステージで異なるスケジューラー設定を使用:
```typescript
// Stage 2: 開始〜12秒
{
    id: "section_b_stage2_scheduler",
    type: "system",
    at: { type: 'absolute', time: { seconds: 60 } },
    action: "start_random_performance_scheduler_with_pools",
    parameters: {
        performers: [
            { id: 'player1', pool: SECTION_B_STAGE2_TREBLE_POOL },
            { id: 'player2', pool: SECTION_B_STAGE2_TREBLE_POOL },
            { id: 'player3', pool: SECTION_B_STAGE2_BASS_POOL }
        ],
        timing: { minInterval: 4000, maxInterval: 7000 },
        articulation: 'staccato',
        dynamics: 'mp'
    }
}

// Stage 3: 12〜21秒（player2はロングトーン、他はスタッカート）
{
    id: "section_b_stage3_scheduler",
    type: "system",
    at: { type: 'absolute', time: { seconds: 72 } },
    action: "update_random_scheduler_pools",
    parameters: {
        performers: [
            { id: 'player1', pool: SECTION_B_STAGE3_TREBLE_POOL, articulation: 'staccato' },
            { id: 'player2', pool: ['B4'], articulation: 'sustain', dynamics: 'p' },  // 固定音
            { id: 'player3', pool: SECTION_B_STAGE3_BASS_POOL, articulation: 'staccato' }
        ],
        timing: { minInterval: 3000, maxInterval: 5000 }
    }
}
```

**問題点:**
- この実装には`randomScheduler.ts`の大幅な拡張が必要
- 現在の`scoreData`は全演奏者共通の構造
- 動的生成機能は未実装

#### 4-2. より現実的なハイブリッド案（推奨）
**Section Bの方針転換:**
1. **固定イベントは残すが、個別タイミング化**
   - 現在の`prime_now_next_notifications`を削除
   - 各演奏者向けに個別の`notation`イベントを時間差で配置
   - カウントダウンは`countdown`メッセージで個別送信

2. **段階的なランダム化**
   - Stage 2〜3: 固定イベントで個別タイミング（0.5〜2秒のランダム幅）
   - Final Stage: 完全ランダムスケジューラー化

**実装例:**
```typescript
// Stage 2 開始: 各演奏者に0〜2秒のランダム遅延
{
    id: "section_b_player1_stage2_countdown",
    type: "system",
    at: { type: 'absolute', time: { seconds: 60 + Math.random() * 2 } },
    action: "send_countdown",
    parameters: {
        target: 'player1',
        secondsRemaining: 1,
        scoreData: { /* player1用 */ }
    }
},
{
    id: "section_b_player2_stage2_countdown",
    type: "system",
    at: { type: 'absolute', time: { seconds: 60 + Math.random() * 2 } },
    action: "send_countdown",
    parameters: {
        target: 'player2',
        secondsRemaining: 1,
        scoreData: { /* player2用 */ }
    }
},
// ... 以下同様
```

**課題:** 
- イベント数が大幅に増える
- `Math.random()`は定義時に1回だけ評価されるため、リロード時に固定される

---

## 推奨実装順序

### Phase 1: 基本修正（即座に実装可能）
1. ✅ Section A 冒頭tutti問題（完了）
2. **トロンボーン音高修正**（簡単・影響範囲明確）
3. **Section A 休止後再開修正**（明確な解決策あり）

### Phase 2: Section B 設計検討（要議論）
4. **Section Bのランダム化方針を決定**
   - 案A: ランダムスケジューラー拡張（開発コスト高・最も自然）
   - 案B: 固定イベント個別配置（実装簡単・疑似ランダム）
   - 案C: 現状維持でstagger調整のみ（最小変更）

### Phase 3: Section B 実装
5. 選択した方針に基づいて実装

---

## 次のステップ

**即座に実装すべき項目:**
- [ ] トロンボーン音高修正（4箇所のプール + 2箇所の直接指定）
- [ ] Section A の25秒停止・30秒再開イベント追加
- [ ] sectionsConfig.ts のevolution配列修正

**要検討項目:**
- [ ] Section Bのランダム化方針決定
  - どの程度のランダム性が必要か？
  - 完全非同期 vs 段階的制御のどちらか？
  - 開発コストとのバランス

---

## 質問・確認事項

1. **Section B のランダム化について:**
   - 案A（スケジューラー拡張）、案B（固定イベント個別配置）、案C（現状維持）のどれが望ましいですか？
   - 各演奏者の音高は完全にランダムでよいですか？それとも何らかの制約が必要ですか？

2. **音高バリエーションのタイミング:**
   - Section Bの各ステージでプールを切り替えるタイミングは現状のままでよいですか？
   - より細かい制御が必要ですか？

3. **優先順位:**
   - まずトロンボーン音高とSection A再開を修正してから、Section Bの方針を議論しますか？
   - それとも全体方針を先に決定してから一括実装しますか？
