# 総合修正計画

## 現状の問題まとめ

### 1. Section A: 冒頭のtutti問題 ✅ 修正済み
**問題:** 曲開始時に全員が同時にスタッカートを演奏してしまう  
**原因:** 初期primeが`broadcastCountdown: true`で、さらに1秒後に強制的にcurrent表示  
**修正:** `broadcastCountdown: false`に設定し、強制current表示イベントを削除  
**状態:** ✅ 実装済み

---

### 2. Section A: 30秒休止後の再開問題 ✅ 修正済み（2025-11-01）
**問題:** 30秒付近で挿入した静寂からの復帰が遅延し、50秒台で急激に密度が跳ね上がっていた  
**原因:** 休止前の`update_timing_parameters`が有効なまま残り、再開後の初期値と乖離していたため密度がリセットされなかった

**実施した修正:**
- 30秒で明示的にランダムスケジューラーを停止し、36秒で再起動
- 再起動時の初期値を`sectionsConfig.timing.evolution`の36秒ステージから取得して整合性を確保
- evolutionテーブルを再編成し、36秒・45秒・54秒で段階的に間隔を縮めてBセクションまで滑らかに連続上昇

**sectionsConfig.ts の timing.evolution（抜粋）:**
```typescript
timing: {
    evolution: [
        { atSeconds: 10, minInterval: 4000, maxInterval: 6500, transitionDuration: 8 },
        { atSeconds: 36, minInterval: 3500, maxInterval: 5500, transitionDuration: 8 },
        { atSeconds: 45, minInterval: 2500, maxInterval: 3500, transitionDuration: 7 },
        { atSeconds: 54, minInterval: 1800, maxInterval: 2600, transitionDuration: 6 }
    ]
}
```

**composition.ts の制御イベント（抜粋）:**
```typescript
{
    id: "section_a_pause_random_performance",
    at: { type: 'absolute', time: { seconds: 30 } },
    action: "stop_random_performance_scheduler"
},
{
    id: "section_a_resume_random_performance",
    at: { type: 'absolute', time: { seconds: 36 } },
    action: "start_random_performance_scheduler",
    parameters: { initialTiming: SECTION_A_RESUME_TIMING, ... }
}
```

**状態:** ✅ 実装済み

---

### 3. トロンボーン音高問題 ✅ 修正済み（2025-11-01）
**問題:** セクションB導入でホルンと同じオクターブを提示してしまい、場面によってはD音指示まで現れていた  
**原因:** ベース系プールをホルン用と同じオクターブに引き上げた回帰変更が、想定より高い音域を指示していた

**実施した修正:**
- Section A の初期譜面でトロンボーンを`B3`表記に戻し、ベース帯域を明示
- Section B のベース用ピッチプールをすべて1オクターブ下（Bb3〜D4）に再調整
- `section_b_prime_*` の個別譜面でも`notes: 'B3/q'`を指定してホルンとの差を確保
- ランダム割当用の`FINAL_STAGE_BASS_POOL`も同様に1オクターブ下へ変更し、D音が出る場合でもホルンより低い範囲に制限

**状態:** ✅ 実装済み

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

### 5. カウントダウン時間の統一 ✅ 実装済み（2025-11-01）
**問題:** Section B導入時に奏者ごとのカウントダウン長が1秒より短く表示されるケースがあり、認知負荷が高かった  
**原因:** `countdownStaggerSeconds`で0.5秒のずれを与えていたため、端末表示上はカウントダウン時間が不揃いになっていた

**実施した修正:**
- `section_b_prime_next_notation`および`section_b_prime_entry_notifications`の`countdownStaggerSeconds`を0に設定
- 3奏者すべてが等しい1秒カウントダウンでBセクションに入れるよう統一

**状態:** ✅ 実装済み

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
