# Implementation Master Plan
**実装マスタープラン - 全体整合性チェック**

## 📋 現在の実装状況サマリー

### ✅ 完了済み (Phases 1-3)
- [x] Phase 1: Base Audio Architecture Separation
- [x] Phase 2: TestSignalManager Integration
- [x] Phase 3: RoutingUI Integration

### 🚧 現在進行中の課題
1. **DSP二重読み込み問題** (Controller画面)
2. **Input接続の不安定性** (Logic Input)
3. **ページ間状態共有の欠如** (Performance/Controller)
4. **出力ルーティングシステム未実装** (Monitor/Main Out)

---

## 🎯 優先度付き実装計画

### 🔥 **緊急 (P0) - 即座に対処が必要**

#### 1. DSP二重読み込み修正
**ドキュメント:** (会話履歴で分析済み)
**問題:**
- Audio Output ONでDSPが自動ロード
- Apply DSPボタンでさらに2つ目がロード

**修正方針:**
```typescript
// controller.ts
// Audio Output ON → Base Audioのみ初期化
async function initAudioEngineOnly() {
    await ensureBaseAudio();
    renderUI(); // DSP適用なし
}

// Apply DSP → DSP初期化 + クリーンアップ
async function applyDSPWithCleanup() {
    if (window.faustNode) {
        cleanupExistingDSP(); // 既存ノードを破棄
    }
    await applyFaustDSP();
}

// audioCore.ts
function cleanupExistingDSP(): void {
    if (!window.faustNode) return;
    window.faustNode.disconnect();
    window.faustNode = null;
}
```

**タスク:**
- [ ] `initAudioEngineOnly()` 関数を実装
- [ ] `applyDSPWithCleanup()` 関数を実装
- [ ] `cleanupExistingDSP()` 関数を実装
- [ ] Audio Output toggleを `initAudioEngineOnly()` に変更
- [ ] Apply DSPボタンを `applyDSPWithCleanup()` に変更
- [ ] 動作テスト (DSPが1つだけロードされることを確認)

**所要時間:** 2-3時間

---

#### 2. Input接続安定化
**ドキュメント:** `docs/CROSS_PAGE_STATE_SYNC.md`
**問題:**
- Logic Inputでデバイスを選択しても接続が不安定
- `getUserMedia()` の競合
- リトライロジック不足

**実装方針:**
```typescript
// 新規ファイル: src/engine/audio/devices/connectionManager.ts
export class ConnectionManager {
    private requestQueue: ConnectionRequest[] = [];
    private isProcessing = false;
    
    async requestConnection(logicInputId, deviceId, channelIndex, priority): Promise<boolean>
    private async processQueue(): Promise<boolean>
    private async executeConnection(request): Promise<boolean>
    private async cleanupConnection(logicInputId): Promise<void>
}

// src/engine/audio/devices/inputManager.ts に統合
export class InputManager {
    private connectionManager: ConnectionManager;
    
    async updateDeviceConnectionWithChannel(...) {
        return await this.connectionManager.requestConnection(...);
    }
}
```

**タスク:**
- [ ] `ConnectionManager` クラス実装
- [ ] キューイングシステム実装
- [ ] リトライロジック実装 (最大3回)
- [ ] AudioContext state チェック (suspended → resume)
- [ ] パーミッションエラーハンドリング
- [ ] `InputManager` への統合
- [ ] 接続成功/失敗イベント追加
- [ ] UI通知システム (パーミッション拒否時)
- [ ] 動作テスト (複数デバイス同時接続)

**所要時間:** 4-6時間

---

### 🔴 **高優先度 (P1) - 早急に対処**

#### 3. ページ間状態同期システム
**ドキュメント:** `docs/CROSS_PAGE_STATE_SYNC.md`
**問題:**
- Performance/Controllerで設定が共有されない
- ページ遷移で音が途切れる

**実装方針:**
```typescript
// 新規ファイル: src/engine/state/sharedStateManager.ts
export interface AudioEngineState {
    audioContext: { sampleRate, state, currentTime }
    tracks: Array<{ id, kind, name, volume, routing, enabled }>
    logicInputs: Array<{ id, label, assignedDeviceId, channelIndex, enabled, routing, gain }>
    routing: { mainOutput, monitorOutputs }
    performance: { isPlaying, isPaused, currentTime, currentSection }
}

export class SharedStateManager {
    // localStorage で永続化
    private saveState(): void
    private loadState(): AudioEngineState
    
    // BroadcastChannel でページ間通信
    private broadcastState(): void
    private handleRemoteStateUpdate(remoteState): void
    
    // AudioEngine への適用
    private applyStateToEngine(): void
    
    // 状態更新API
    updateTrack(trackId, updates): void
    updateLogicInput(inputId, updates): void
    updatePerformance(updates): void
}
```

**タスク:**
- [ ] `AudioEngineState` インターフェース定義
- [ ] `SharedStateManager` クラス実装
- [ ] localStorage 読み書き実装
- [ ] BroadcastChannel 初期化
- [ ] ページ間メッセージング実装
- [ ] `applyStateToEngine()` 実装
- [ ] `audioCore.ts` への統合 (起動時に状態復元)
- [ ] `controller.ts` への統合 (設定変更時に保存)
- [ ] `performance.ts` への統合 (演奏状態の同期)
- [ ] 状態変更リスナーシステム実装
- [ ] デバッグUI追加 (状態確認パネル)
- [ ] テスト: Controller→Performance 設定反映
- [ ] テスト: Performance→Controller 状態反映
- [ ] テスト: ページリロード時の復元

**所要時間:** 8-12時間

---

### 🟡 **中優先度 (P2) - 順次対応**

#### 4. 出力ルーティングシステム
**ドキュメント:** `docs/OUTPUT_ROUTING_REQUIREMENTS.md`
**要件:**
- メイン出力 (観衆向け)
- モニター出力 x3 (奏者向け)

**実装フェーズ:**

##### Phase 1: BusManager拡張
```typescript
// src/engine/audio/core/busManager.ts
export class BusManager {
    private mainOutput: GainNode;
    private monitorOutputs: {
        performer1: GainNode;
        performer2: GainNode;
        performer3: GainNode;
    };
}
```
**タスク:**
- [ ] `mainOutput` ノード追加
- [ ] `monitorOutputs` (3系統) 追加
- [ ] 既存APIとの互換性維持

##### Phase 2: MonitorMixerMatrix実装
```typescript
// 新規ファイル: src/engine/audio/routing/monitorMixerMatrix.ts
export class MonitorMixerMatrix {
    registerPerformerTrack(performerId: 1|2|3, trackOutput: AudioNode): void
    registerClickTrack(clickOutput: AudioNode): void
    getMonitorOutput(performerId: 1|2|3): GainNode
    updateConfig(config: PerformerMonitorConfig): void
}
```
**タスク:**
- [ ] `MonitorMixerMatrix` クラス実装
- [ ] 奏者トラック登録API
- [ ] クリックトラック登録API
- [ ] ミックスマトリクス自動構築
- [ ] ゲイン設定 (自分: 0dB, 他: -6dB, クリック: -3dB)

##### Phase 3: Track統合
**タスク:**
- [ ] Trackを複数出力先に分岐可能に
- [ ] Click Track専用設定 (Main除外)
- [ ] `TrackLifecycleManager` にルーティング統合

##### Phase 4: UI実装
```typescript
// 新規ファイル: src/ui/routingMatrixUI.ts
export class RoutingMatrixUI {
    renderMatrix(): void
    toggleTrackOutput(trackId, output, enabled): void
    updateMonitorMixConfig(config): void
}
```
**タスク:**
- [ ] ルーティングマトリクス表示
- [ ] チェックボックスによる出力切り替え
- [ ] モニターミックス設定スライダー
- [ ] Logic Inputs / Routingパネルへ統合

##### Phase 5: デバイス割り当て
**タスク:**
- [ ] Web Audio API `setSinkId()` 対応
- [ ] オーディオインターフェース出力選択
- [ ] デバイス変更時の自動再接続

**所要時間:** 16-24時間 (全Phase合計)

---

## 📊 全体タイムライン

### Week 1: 緊急対応
```
Day 1-2: DSP二重読み込み修正 (P0-1)
Day 3-5: Input接続安定化 (P0-2)
Day 6-7: テスト・デバッグ
```

### Week 2-3: 状態同期
```
Day 8-12: SharedStateManager実装 (P1-3)
Day 13-15: 各ページへの統合
Day 16-17: テスト・デバッグ
```

### Week 4-6: 出力ルーティング
```
Week 4: BusManager拡張 + MonitorMixerMatrix (Phase 1-2)
Week 5: Track統合 + UI実装 (Phase 3-4)
Week 6: デバイス割り当て + テスト (Phase 5)
```

**合計所要時間:** 約6週間 (1日4-6時間作業想定)

---

## 🔍 抜けチェックリスト

### ドキュメント整合性
- [x] AUDIO_SYSTEM.md - オーディオアーキテクチャ
- [x] OUTPUT_ROUTING_REQUIREMENTS.md - 出力ルーティング
- [x] CROSS_PAGE_STATE_SYNC.md - 状態同期
- [x] DEVELOPMENT_ROADMAP.md - 開発ロードマップ
- [ ] DSP二重読み込み修正のドキュメント化 ⚠️

### 技術的依存関係
```
DSP修正 → Input安定化 → 状態同期 → 出力ルーティング
   ↓           ↓            ↓              ↓
 独立実装    独立実装   Track統合必要  Track統合必要
```

### 未カバーの領域

#### ⚠️ 1. エラーハンドリング統一
**問題:** 各モジュールでエラー処理がバラバラ
**対策:**
- [ ] エラーハンドリング方針のドキュメント作成
- [ ] 統一エラー通知システム実装
- [ ] ユーザー向けエラーメッセージ設計

#### ⚠️ 2. ログシステムの統一
**問題:** console.log が散在、デバッグが困難
**対策:**
- [ ] ログレベル定義 (DEBUG/INFO/WARN/ERROR)
- [ ] LogManagerクラス実装
- [ ] ログ出力先の統一 (console + UI)

#### ⚠️ 3. テスト戦略
**問題:** 自動テストがない
**対策:**
- [ ] ユニットテストフレームワーク導入 (Vitest)
- [ ] 重要機能のテストケース作成
- [ ] CI/CD パイプライン構築

#### ⚠️ 4. パフォーマンス監視
**問題:** CPU/メモリ使用量の可視化不足
**対策:**
- [ ] PerformanceMonitor強化
- [ ] リアルタイムメトリクス表示
- [ ] パフォーマンスボトルネックの特定

#### ⚠️ 5. ドキュメント同期
**問題:** 実装とドキュメントの乖離
**対策:**
- [ ] コード変更時のドキュメント更新ルール策定
- [ ] 実装完了時のドキュメントレビュー
- [ ] 定期的なドキュメント棚卸し

---

## 🎯 実装判断基準

### 実装すべきもの (Must Have)
1. ✅ DSP二重読み込み修正
2. ✅ Input接続安定化
3. ✅ 状態同期システム (localStorage + BroadcastChannel)
4. ✅ 基本的な出力ルーティング (Main + Monitor x3)

### 検討中 (Should Have)
1. ⚠️ エラーハンドリング統一
2. ⚠️ ログシステム改善
3. ⚠️ デバイス割り当てUI

### 後回し (Nice to Have)
1. 📋 SharedWorker実装 (ブラウザ対応次第)
2. 📋 IndexedDB移行 (大量データ時)
3. 📋 ServiceWorker統合 (オフライン対応)
4. 📋 自動テスト (時間があれば)

---

## 📝 実装開始前のチェックリスト

### 環境準備
- [ ] 開発環境の動作確認 (npm run dev)
- [ ] Git branchの確認 (feature/work-architecture)
- [ ] 依存パッケージの更新確認

### ドキュメント確認
- [ ] AUDIO_SYSTEM.md を読む
- [ ] OUTPUT_ROUTING_REQUIREMENTS.md を読む
- [ ] CROSS_PAGE_STATE_SYNC.md を読む
- [ ] 会話履歴でDSP問題を確認

### 実装順序の最終確認
1. DSP二重読み込み修正 (2-3h)
2. Input接続安定化 (4-6h)
3. 状態同期システム (8-12h)
4. 出力ルーティング (16-24h)

**合計:** 約30-45時間

---

## 🚀 次のアクション

### 即座に開始できるタスク
1. **DSP修正 (P0-1)** - ドキュメント不要、すぐ実装可能
2. **ConnectionManager実装 (P0-2)** - 設計完了、実装開始可能

### 追加調査が必要なタスク
1. **SharedStateManager** - BroadcastChannel のブラウザ対応確認
2. **setSinkId()** - Web Audio API対応状況の確認

### ステークホルダー確認が必要な項目
1. モニター出力の音量比率 (自分: 0dB, 他: -6dB でOK?)
2. ページ遷移時の挙動 (音継続 vs 一時停止?)
3. エラー通知方法 (モーダル vs トースト vs ログのみ?)

---

## ✅ 最終確認

### 実装方針は共有されているか?
- ✅ **はい** - 全ドキュメントに記載済み
- ✅ CROSS_PAGE_STATE_SYNC.md に詳細設計
- ✅ OUTPUT_ROUTING_REQUIREMENTS.md に出力仕様
- ✅ DEVELOPMENT_ROADMAP.md に全体計画

### 抜けはないか?
- ⚠️ **一部あり** - 以下を追加推奨:
  1. エラーハンドリング統一方針
  2. ログシステム設計
  3. テスト戦略
  4. パフォーマンス監視強化
  5. DSP修正のドキュメント化

### 実装を開始できるか?
- ✅ **はい** - 以下の順序で開始推奨:
  1. DSP二重読み込み修正 (最優先)
  2. Input接続安定化 (緊急)
  3. 状態同期システム (高優先度)
  4. 出力ルーティング (中優先度)

---

## 📌 推奨事項

### すぐに実装すべきもの
```
1. DSP修正 (2-3h) - すぐ開始可能
2. ConnectionManager (4-6h) - 設計完了
```

### 並行して準備すべきもの
```
1. DSP修正ドキュメント作成
2. エラーハンドリング方針策定
3. テスト環境整備
```

### 後で検討すべきもの
```
1. SharedWorker移行 (ブラウザ対応次第)
2. 自動テスト導入 (時間があれば)
3. CI/CD構築 (プロジェクト成熟後)
```

**このマスタープランに基づいて実装を進めることで、全体の整合性を保ちながら効率的に開発できます。** 🚀
