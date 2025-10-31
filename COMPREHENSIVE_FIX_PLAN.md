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

### 4. Section B: 固定タイミング同期問題 ⚙️ 対応中
**課題:** Section B で全奏者が同期発火してしまい、ランダム演奏フェーズとして機能していなかった

**最新の進捗 (2025-11-01):**
- `randomScheduler.ts` に per-performer スコアおよび動的ジェネレータ機構を追加
- Section B 開始時にランダムスケジューラーを起動し、奏者ごとの音高プールから都度抽選するよう変更
- 12秒地点（Horn2サステイン導入）と21.6秒地点（Horn2休止）で`update_random_scheduler_score_strategy`を発火し、音高プールと指示文をステージ毎に切り替え
- 同タイミングで`update_timing_parameters`も発火し、B内で密度が段階的に上昇するように再調整
- Section B 内のすべての`countdownStaggerSeconds`を0に統一し、実質1秒カウントダウンを保証

**残タスク:**
- ランダム指示と既存の`notation`イベントの内容が完全には同期していないため、表示譜面の再設計（汎用指示化 or スケジューラー連携）が望ましい
- Horn2休止中にスケジューラーから外す/休止扱いにするか要検討（現在は`qr`を送って沈黙指示）
- 実機テストで密度推移を確認し、必要に応じてステージ境界の時刻や間隔値を微調整

**次の一手候補:**
1. Section B の譜面表示をランダムスケジューラーからの実データに一本化する
2. Horn2 休止フェーズで`updatePerformers`を使いスケジューラー対象から除外する
3. ランダムスケジューラーの間隔変化を滑らかにするため、`update_timing_parameters`を補間付きに拡張する

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
