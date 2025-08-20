## Implementation Status Overview

> **Documentation Update Notice (2025-08-20)**
> This file has been restructured for better organization. Related documentation:
> - `docs/ARCHITECTURE_OVERVIEW.md` - System architecture and design principles
> - `docs/AUDIO_SYSTEM.md` - Detailed audio system documentation
> - `docs/VISUALIZATION_SYSTEM.md` - Visualization system documentation
> - `docs/DEVELOPMENT_ROADMAP.md` - Future development plans
> - `docs/NEXT_TASKS_TEST_SIGNAL_AND_BASE_AUDIO.md` - Historical Phase 1-3 implementation logs

## ✅ Completed Implementation Summary
### 🎯 Phase 1-3: Base Audio Architecture (✅ Completed)
**Status**: ✅ **Fully Implemented**
**Completion Date**: 2025-08-17

#### Core Achievements
- ✅ **Base Audio Layer Separation**: DSP-independent audio functionality
- ✅ **TestSignalManager Integration**: Unified test signal system
- ✅ **RoutingUI Modernization**: Improved user interface integration
- ✅ **Backward Compatibility**: Legacy code continues to function

#### Key Implementation Files
- `src/audio/audioCore.ts` - Two-stage initialization system
- `src/audio/testSignalManager.ts` - Unified test signal management
- `src/audio/routingUI.ts` - TestSignalManager API integration
- `src/controller.ts` - Enhanced UI controls

For detailed implementation logs, see: `docs/NEXT_TASKS_TEST_SIGNAL_AND_BASE_AUDIO.md`

### 2025-08-18 Phase 1: 実際のFaust WASM統合 完了 ✅
**概要**: プレースホルダーのGainNodeから実際のFaust AudioWorkletNodeへの移行完了。リアルタイムDSPコンパイルとパラメータ制御の実装。

#### **Phase 1: FaustWasmLoader 核心実装**
- **新ファイル**: `src/audio/dsp/faustWasmLoader.ts` (212行)
- **核心機能**:
  - `@grame/faustwasm`ライブラリ統合による実際のDSPコンパイル
  - DSPコード → AudioWorkletNode変換の完全自動化
  - LibFaust + FaustCompiler + FaustMonoDspGenerator連携実装
  - パラメータ情報自動抽出とキャッシュ機構
- **技術詳細**:
  - シングルトンパターンによるリソース管理
  - FaustWasm初期化とコンパイラーインスタンス管理
  - DSPファイルロード・解析・AudioWorkletNode生成パイプライン
  - パラメータメタデータ抽出（type, label, address, range）

#### **Phase 2: EffectRegistry v2 実装**
- **修正ファイル**: `src/audio/effects/effectRegistry.ts`
- **重要な変更**:
  - プレースホルダーGainNode → 実際のFaust AudioWorkletNode生成
  - `registerDSPFromFile()` / `registerPrecompiledFaust()` の create() メソッド刷新
  - FaustWasmLoaderとFaustEffectController統合
  - DSP自動スキャン機能（mysynth, testsignals, testsynth対応）
- **メタデータ駆動設計**:
  - .jsonファイルによるDSP分類（source, effect, hybrid, utility）
  - 互換性情報管理（canBeSource, requiresInput, etc.）
  - カテゴリとサブカテゴリによる体系的分類

#### **Phase 3: 包括的テスト機能群**
- **新ファイル**: `src/phase1TestFunctions.ts` (251行)
- **テスト関数**:
  - `testFaustWasmIntegration()`: FaustWasmLoader単体テスト
  - `testEffectRegistryV2()`: EffectRegistry v2統合テスト
  - `testMysynthCreation()`: mysynth音声接続テスト
  - `testSimpleSynth()`: 入力不要testsynthテスト
  - `showRegisteredEffects()`: 登録エフェクト一覧表示
- **デバッグ支援**:
  - 詳細な実行ログとエラー情報
  - パラメータ制御の動作確認
  - 音声出力の実際の確認

#### **Phase 4: テスト用DSP作成**
- **testsynth.dsp**: 入力不要のシンプルなサウスウェーブシンセサイザー
  ```faust
  freq = hslider("freq",440,50,1000,0.01);
  gain = hslider("gain",0.1,0,0.5,0.01);
  process = os.sawtooth(freq) * gain;
  ```
- **testsynth.json**: メタデータ定義（source/test-synth分類）
- **mysynth.json**: パラメータアドレス修正（`/freq` → `/mysynth/freq`）

#### **技術的成果と検証**
- **実際の音声出力確認**: ✅ 440Hz サウスウェーブの実際の音声出力
- **パラメータ制御動作**: ✅ freq/gainリアルタイム制御の確認
- **DSPコンパイル成功**: ✅ FaustコードからAudioWorkletNodeへの変換
- **Effect登録統合**: ✅ 6つのエフェクト（native: 3, faust: 3）正常登録
- **入出力対応**: ✅ 入力不要DSP（testsynth）と入力必要DSP（mysynth）両対応

#### **検証済みログ抜粋**
```
✅ Faust node created: testsynth {inputs: 0, outputs: 1, params: 2}
🎛️ Set param freq (/testsynth/freq) = 440
🎛️ Set param gain (/testsynth/gain) = 0.1
💡 You should now hear a 440Hz sawtooth wave (no input required)
```

#### **実装での重要な学習**
- **入力要件の違い**: mysynth（入力処理型）vs testsynth（入力不要型）の設計差異
- **パラメータアドレッシング**: Faustの階層的パラメータ命名（`/dspname/param`）の重要性
- **AudioWorkletNode統合**: Web Audio APIとFaustWASMの完全統合手法
- **リアルタイムコンパイル**: ブラウザ内でのDSPコード → 実行可能音声ノード変換

### 2025-08-18 Faust DSP 音響問題解決完了 ✅
**概要**: Base Audio 分離後にDSP音声が出力されない問題と音声の不安定性問題を解決。

#### **Phase 1: DSP 音声出力問題診断・解決**
- **問題状況**: テスト信号は正常動作するがFaust DSP音声が無音状態
- **原因特定**: 
  - AudioContext suspended状態での初期化
  - Faust DSPデフォルトパラメータとコード側初期化の競合
  - 音声接続のガベージコレクション
- **技術的解決策**:
  - AudioContext自動resume機能とkeep-alive機構追加（5秒間隔監視）
  - パラメータ競合排除：Faust DSP側デフォルト値（freq=200Hz, gain=0.5, input_mix=0.5）を尊重
  - `window.audioConnections`による音声接続参照保持でガベージコレクション防止

#### **Phase 2: 音声安定性改善**
- **問題**: 期待通りの音が出るが時間経過で音声が消失
- **対策実装**:
  - AudioContext keep-alive機構による自動suspension防止
  - 音声ノード接続の確実な参照保持
  - MicRouter未接続時のsilent input生成とフォールバック処理
- **診断機能追加**: 包括的な音声システム診断とモニタリング機能群
  - `testFaustDSP()`: Faust DSP動作確認
  - `monitorFaustState()`: リアルタイム状態監視
  - `diagnoseAudioChain()`: 音声チェーン全体診断
  - `enablePureSynthMode()`: 純粋シンセサイザーモード
  - `startContinuousMonitor()`: 継続的システム監視

#### **コード変更詳細**
- **audioCore.ts修正**:
  - 競合する初期パラメータ設定を削除してDSPデフォルト値を尊重
  - AudioContext keep-aliveタイマー追加（5秒間隔、自動suspension検出・復旧）
  - 音声接続の確実な参照保持機構追加
  - MicRouter未接続時のsilent input生成
- **controller.ts拡張**:
  - 包括的診断機能群追加（5種類の診断・監視関数）
  - リアルタイム音声システム状態表示
  - Faust DSPパラメータと接続状態の詳細ログ出力

#### **動作確認済み機能**
- **DSP音声出力**: Faust DSPによる合成音が正常に出力
- **パラメータ制御**: freq/gainスライダーによるリアルタイム制御
- **音声安定性**: 長時間再生での音声継続性確保
- **診断システム**: 包括的な音声システム状態監視と問題検出

#### **技術的学習事項**
- **パラメータ競合回避**: DSP側デフォルト値を最優先し、コード側初期化は削除
- **AudioContext管理**: ブラウザの自動suspension対策として能動的keep-alive必須
- **参照管理**: Web Audio APIノードのガベージコレクション防止策の重要性
- **診断重要性**: 複雑な音声システムでは包括的診断機能が問題解決に不可欠

### 2025-08-18 Phase 1: 実際のFaust WASM統合実装完了 ✅
**概要**: プレースホルダのGainNodeを実際のFaust AudioWorkletNodeに置換、DSPコンパイル・ロード・パラメータマッピングの完全自動化を実現。

#### **Step 1: FaustWasmLoader実装**
- **新ファイル**: `src/audio/dsp/faustWasmLoader.ts` (190行)
- **機能実装**:
  - FaustWasm初期化: `instantiateFaustModuleFromFile` + `LibFaust` + `FaustCompiler`
  - DSPコンパイル: `.dsp`ファイル→`FaustMonoDspGenerator`→AudioWorkletNode生成
  - パラメータ自動抽出: `node.getParams()`からUI情報取得・正規化
  - 生成キャッシュ: moduleCache, libFaust, compiler の再利用
- **API設計**:
  ```typescript
  loadFaustNode(ctx: AudioContext, dspName: string): Promise<FaustMonoAudioWorkletNode>
  getParameterInfo(dspName: string): FaustParamInfo[]
  scanAvailableDSP(basePath: string): Promise<string[]>
  ```

#### **Step 2: EffectRegistry v2統合**
- **修正ファイル**: `src/audio/effects/effectRegistry.ts`
- **プレースホルダ置換**:
  - `registerDSPFromFile()`: GainNode → FaustWasmLoader.loadFaustNode()
  - `registerPrecompiledFaust()`: 同様にGainNode → 実WASM
  - エラーハンドリング: WASM失敗時はGainNodeフォールバック（安全性確保）
- **パラメータマッピング強化**:
  - メタデータ(.json)パラメータ優先、FaustWasm自動抽出を補完
  - パラメータ名正規化: label → id変換（小文字・アンダースコア化）

#### **Step 3: FaustEffectController強化**
- **修正ファイル**: `src/audio/dsp/faustEffectController.ts`
- **setParam改善**:
  - エラーハンドリング追加、ログ出力強化
  - `setParamValue`メソッド存在チェック・型安全性向上
  - 範囲クランピング維持（min/max制約）

#### **Step 4: 包括的テストシステム**
- **新ファイル**: `src/phase1TestFunctions.ts` (180行)
- **テスト関数群**:
  - `testFaustWasmIntegration()`: WASM単体テスト・パラメータ確認
  - `testEffectRegistryV2()`: EffectRegistry統合テスト
  - `testMysynthCreation()`: mysynth実音声接続テスト
  - `showRegisteredEffects()`: 登録済みエフェクト一覧表示
- **開発者体験**: ブラウザコンソールで即座に実行可能、段階的デバッグ対応

#### **技術的実装詳細**
- **コンパイルフロー**: `.dsp` → `FaustCompiler` → `FaustMonoDspGenerator` → `AudioWorkletNode`
- **既存API互換**: audioCore.tsの`applyFaustDSP()`との並行運用
- **エラー分離**: WASM失敗でもGainNodeフォールバック、システム全体への影響回避
- **パフォーマンス**: シングルトンLoader、コンパイラ/ライブラリの再利用

#### **動作確認項目**
✅ `.dsp`ファイル自動検出・コンパイル  
✅ `mysynth.dsp` → 実AudioWorkletNode生成  
✅ パラメータ自動抽出・UI情報マッピング  
✅ `setParamValue('/mysynth/freq', 440)` による実時間制御  
✅ EffectRegistry v2でのmysynth生成（プレースホルダ撤廃）  
✅ エラー時フォールバック動作  

#### **次段階への影響**
- **Track Lifecycle Manager**: 実FaustNodeでのTrack生成・破棄テスト可能
- **パラメータUI**: 自動抽出パラメータでの動的UI生成基盤確立
- **プリセット管理**: パラメータ値一括設定・保存機能の拡張準備完了

#### **重要な技術的発見**
- **FaustWasm API変更**: `FaustWasm` → `LibFaust` + `FaustCompiler`パターン必須
- **パラメータ取得**: `node.getParams()`は非同期、try-catch必須
- **AudioWorklet制約**: `gen.load(ctx.audioWorklet)`が必要、ブラウザ依存あり

### 2025-08-18 DSPフォルダ構成リファクタリング ✅
**概要**: DSPファイルのカテゴリ別整理とEffectRegistry v2実装準備。

#### **フォルダ構成変更**
- **新構成**: 
  ```
  public/dsp/
    ├── mysynth.dsp (既存・メインシンセサイザー)
    ├── testsignals.dsp (既存・テスト信号)
    ├── synths/ (新規・シンセサイザー系DSP用)
    └── effects/ (新規・エフェクト系DSP用)
  ```
- **目的**: EffectRegistry v2でのカテゴリ別管理とメタデータ駆動ロードの準備
- **将来の配置方針**:
  - `synths/`: 音源生成系DSP（oscillator, sampler, noise generator等）
  - `effects/`: 音響処理系DSP（reverb, filter, compressor等）
  - ルートレベル: 既存互換・特別用途DSP

#### **EffectRegistry v2への影響**
- **パス解決**: カテゴリ別サブディレクトリからの自動検索対応
- **メタデータ管理**: 各サブディレクトリに対応する.jsonファイル配置予定
- **ロードロジック**: ディレクトリ構造に基づくカテゴリ自動判定機能

### 2025-08-18 EffectRegistry v2 完全実装完了 ✅
**概要**: メタデータ駆動による包括的なエフェクト管理システムの完全実装と統合。

#### **Phase 1: インターフェース拡張完了**
- **新型定義**:
  - `EffectCategory`: 'source' | 'effect' | 'hybrid' | 'utility'
  - `DSPCompatibility`: 配置可能性判定インターフェース
  - `EffectRegistryEntry`: dspPath, compatibility, subCategory フィールド追加
- **カテゴリ自動判定**: ディレクトリ構造からの初期カテゴリ推定機能
- **既存ネイティブエフェクト更新**: Gain/LPF/Delay の compatibility 情報追加

#### **Phase 2: メタデータシステム実装**
- **メタデータファイル作成**: 
  - `public/dsp/mysynth.json`: mysynth.dsp用メタデータ例
  - refId, category, compatibility, params の包括的記述
- **自動検索・登録機能**: `scanAndRegisterDSPFiles()` 実装
  - DSPファイルとメタデータファイルの自動ペアリング
  - 初期化時の自動登録プロセス統合

#### **Phase 3: UI統合完了**
- **Controller初期化**: Base Audio準備時にDSP auto-scan追加
- **Effects Chain拡張**: カテゴリ別エフェクト追加ボタン実装
- **視覚的改善**: カテゴリ別色分け機能
  - Source: 緑 / Effect: 青 / Hybrid: 紫 / Utility: 灰

#### **Phase 4: バグ修正とシステム安定化完了**
- **8件の主要バグ修正**:
  - オーディオエンジン初期化フロー改善
  - エフェクトチェーン管理の最適化
  - テスト機能のエラーハンドリング強化
  - UI応答性とフィードバック改善
- **Track音量制御問題解決**: Faustトラック音量が0まで下がらない問題を重複接続排除で解決
- **UI簡素化**: 冗長な制御要素と危険なテスト機能の削除
  - Audio Engine トグルボタン削除（自動起動に統一）
  - 重複Master音量制御削除
  - 危険なDirect Audio Test機能完全削除

#### **技術的実装詳細**
- **プリロードシステム**: Promise キャッシュによる多重要求抑止
- **型安全性**: 全インターフェースのTypeScript型定義完備
- **エラーハンドリング**: メタデータ読み込み失敗時の適切なフォールバック
- **後方互換性**: 既存ネイティブエフェクトとの統合維持
- **音声ルーティング最適化**: 重複接続防止とクリーンなチェーン管理
- **診断機能**: 包括的なシステム診断とトラブルシューティング機能

#### **完成した機能群**
- **メタデータ駆動エフェクト管理**: DSPファイルとメタデータの自動ペアリング
- **カテゴリベース分類**: source/effect/hybrid/utility 自動分類
- **視覚的フィードバック**: カテゴリ別色分けとステータス表示
- **安全な操作環境**: 危険な直接操作機能の完全排除
- **ストリームライン化されたワークフロー**: 一貫した操作体験

#### **品質指標**
- **バグ解決率**: 100% (8/8件完了)
- **システム安定性**: 音声ルーティングの重複問題解決
- **UI安全性**: 危険機能完全削除による安全な操作環境確立
- **ユーザビリティ**: 冗長要素削除による操作明確化

#### **動作確認済み機能**
✅ Base Audio 単独初期化 → テスト信号動作  
✅ 従来フロー (Apply DSP) → 全機能正常動作  
✅ Logic Input Tone/Noise/Impulse ボタン → 音声出力確認  
✅ Direct Audio Test → outputGainNode 直接出力確認  
✅ エラーメッセージ → 適切なガイダンス表示  

#### **効果・意義**
- **UX 改善**: DSP 適用前でも Logic Inputs のテスト信号が即座に利用可能
- **開発効率**: Base Audio 層での音声テストが高速化
- **保守性**: テスト信号生成の一元化, 重複コード削除
- **拡張性**: TestSignalManager による将来的な信号種類追加基盤
- **後方互換**: 既存ワークフローに影響なし

#### **次期実装ターゲット** 
**Track Lifecycle Manager**: DSP 有効化時の Track 自動生成・破棄と 15-20ms フェード処理によるクリックノイズ完全排除

### 2025-08-11 Master メータ追加 & テスト音エラー改善
- controller.ts: Master 行にレベルメータ+dB表示を追加 (outputGainNode 直前で測定)。
- routingUI.ts: テスト音注入前に AudioContext/BusManager 未初期化時はアラートで Apply DSP を要求。
- 動作: Master メータは FaustSynth+TrackVolume+MasterFX 後の最終レベルを表示。テスト音は前提条件不足時にユーザーガイド。
- TODO: analyser の作成/破棄を最適化 (キャッシュ化) / テスト音の DSP ベース実装 (testsignals.dsp 統合)。

### 2025-08-11 Master FX 遅延キュー拡張
- busManager: enqueueFxOp / flushFxOps / applyFxOp を追加し add/remove/move/bypass/clear を遅延キュー対応。
- controller: 既存 masterFxQueue を汎用 action 形式へ拡張し UI 操作全て enqueue。
- 目的: エンジン未初期化時も一連の編集操作を順番維持して適用可能に。
- TODO: registrar 統合後は refId ベース add へ移行。

### 2025-08-11 LogicInput 初期 Enable OFF / テスト音改善 / testsignals.dsp 追加
- LogicInputManager.add(): enabled を常に false 初期化 (明示)。
- routingUI: テスト音注入前に ensureInput + ルーティング全OFF時は monitor を一時true にして再生後戻す。
- 追加: public/dsp/testsignals.dsp (将来 Worklet 化して統一的にテスト信号生成予定)。
- 目的: 初期状態で勝手に音が鳴らない安全側、必要なときに確実にテスト音出せるよう改善。
- TODO: testsignals.dsp を自動ロードして専用 Track / Param UI から選択再生する統合 (後段)。

### 2025-08-11 Step3: 論理Input テスト音 & 入力メータ追加
- 追加: `routingUI.ts` に Tone / Noise / Imp ボタン (440Hz 0.5s, ホワイトノイズ 0.5s, インパルス 0.1s) を各論理Input行へ。
- 追加: 簡易入力メータ (RMS→非線形変換) を per LogicInput 表示。
- 追加: `busManager.ts` に getInputGainNode(logicId) ゲッター（テスト音注入/メータ接続用）。
- 実装メモ: 現状メータは rAF ごとに一時 AnalyserNode を作成→接続→値取得→切断（低チャンネル数想定で負荷軽微）。必要なら永続 Analyser キャッシュへ最適化予定。
- TODO: 物理デバイス未アサイン時は Tone/Noise/Imp を自動で sourceNode に接続or警告表示、Clear/Persist 予約。

### 2025-08-11 Track Volume 未反映バグ修正
- 原因: Faustノードを直接 master effectsBus (effectsInput) に接続しており Track.volumeGain を経由していなかったため、UIスライダー変更 (userVolume→volumeGain.gain) が実出力に影響しなかった。
- 対応: audioCore での直接接続を除去し、Track生成時に volumeGain -> effectsBus 接続へ統一。
- 影響: Track mute/solo/volume が正しく出力へ反映。複数 Track 拡張時の一貫性向上。
- TODO: 既存接続が存在する場合の再初期化 (Apply DSP) シーケンス最適化 (二重接続防止) / Track dispose 時 disconnect 追加確認。

### 2025-08-11 Master FX 遅延キュー (案4) 実装
- 目的: Audio Engine 初期化前 (DSP未ロード/permission未取得) でも Master FX 追加操作を予約可能にする。
- 実装:
  - `controller.ts` に `masterFxQueue` (現状 addEffect のみ) を追加。
  - busManager 未定義時はキューへ push、`audio-engine-initialized` イベント受信で flush。
  - `audioCore.ts` で busManager 構築後に `audio-engine-initialized` CustomEvent 発火。
  - UI ボタン (+Gain/+LPF/+Delay) は queueMasterFxAdd 経由に変更。
- 動作: Audio Output OFF や initAudio 前でも FX ボタンを押せばキューに溜まり、初期化後一括適用。
- 制限 / TODO:
  - Clear 操作は busManager 存在時のみ (未存在時の予約未対応)。
  - remove/move/bypass の予約は未実装 (必要なら action 拡張)。
  - 重複押下チェックや最大長制限は未実装 (必要に応じ導入)。
- 次候補:
  - 予約アクション種拡張 (remove/move/bypass)
  - キュー表示/キャンセル UI (デバッグ用)
  - Track Insert FX に同様の遅延キュー仕組み適用検討

### 2025-08-11 Master FX クロスフェード Rebuild 実装
- 変更: `busManager.ts` の `rebuildChain()` を差し替え、旧チェーンと新チェーンを 20ms 線形クロスフェード。
- 実装詳細:
  - 旧チェーン末尾に tailGain を保持し、新チェーンに新 tailGain を生成。
  - crossfadeDuration(20ms) 中に old.tailGain.gain → 0, new.tailGain.gain → 1 へ linearRamp。
  - フェード完了後に旧ノードを遅延 disconnect (余裕 60ms)。
  - 即時切替時 (crossfadeEnabled=false) は以前の挙動(クリック可能性あり)。
- 目的: エフェクト追加/削除/順序変更時のクリックノイズ低減。
- 制限 / TODO:
  - 個別エフェクト bypass トグルもフルチェーン再構築 (最適化余地)
  - Feedback/Delay系で状態引き継ぎ不可 (ポンッとリセット感) → 将来: ノード種別ごと状態マイグレーション検討
  - crossfadeDuration を可変設定にする dev API 未提供

### 2025-08-11 Master FX ルーティング有効化 & 次アクション候補
- 変更: `audioCore.ts` で `faustNode` 出力先を `outputGainNode` 直結から `busManager.effectsBus` へ変更 (`getEffectsInputNode()` 新設)。
- 追加: `busManager.ts` に `getEffectsInputNode()` ゲッター。
- 結果: Master Effects Chain パネルで追加する Gain / LPF / Delay が実際の合成音へ反映されるようになった。
- 注意: 現状チェーン再構築時はクリックノイズが生じ得る (即時disconnect/connect)。短時間クロスフェード導入予定。
- 既知の制限:
  - パラメータUIなし (Gain値, LPF freq/Q, DelayTime を直接操作不可)
  - エフェクト追加順序変更時のノイズ / ドロップアウト軽減未実装
  - Track別インサートチェーンとは独立管理 (統合/共通API化未着手)
- 次アクション候補:
  1. Crossfade Rebuild Manager (旧/新チェーンを並列+15msフェード)
  2. Master Chain も EffectRegistry ベースへ移行 (param 読み出し共通化)
  3. `fxAPI.setParam(trackId,effectId,paramId,value)` 実装 (Track Insert 先行)
  4. Persistence v2: Track.effects 永続化 (refId/params/bypass/order)
  5. Debug: チェーン状態/接続グラフを console.table 出力する dev API

### 2025-08-10 動的Faustエフェクト挿入アーキテクチャ方針 (Draft)
- 目的: Reverb / Compressor など複数の Faust DSP (および Web Audio ネイティブノード) を Track 単位で動的に追加・削除・順序変更・バイパスし、プログラム/外部コントローラー/オートメーションからパラメータ操作可能にする。
- 方針変更点:
  - 既存: Master Effects Bus に単一直列チェーン (GUI) → 今後: Track ごとに独立した Insert Chain + (後段) Send/Aux Bus。
  - チェーンは宣言的 JSON (ProjectState) とランタイム操作 API の両対応。
  - Faust 効果は共通 Loader / キャッシュを経由して AudioWorkletNode を生成。既にロード済み wasm/code は再利用。
- コア抽象:
  - EffectRegistryEntry { refId, kind:'faust'|'native', create(ctx):Promise<EffectInstance>, params:[{id,label,addr?,min,max,default,scale?}] }
  - EffectInstance { id, node:AudioNode, kind, refId, bypass:boolean, paramMap:{ [paramId]: { set(v:number,time?:number):void } }, dispose() }
  - Track.effects: EffectInstance[] (順序 = シグナルフロー)
- API (window.fxAPI 予定):
  - add(trackId, refId, position?) → effectId
  - remove(trackId, effectId)
  - move(trackId, effectId, newIndex)
  - setBypass(trackId, effectId, flag)
  - setParam(trackId, effectId, paramId, value, opts={time?, ramp?})
  - list(trackId) → meta[]
  - loadPreset(trackId, presetName)
- ロード戦略:
  - Faust dsp: 事前ビルド wasm + json (public/audio/*.wasm + *.json) を fetch → instantiate → createNode。
  - ネイティブ: DynamicsCompressorNode, BiquadFilterNode, GainNode など。
- 差し替え / 挿入アルゴリズム (MVP → 拡張):
  1. MVP: 既存チェーン全 disconnect → 再 connect (クリックノイズ容認)。
  2. 拡張: 並列 (旧チェーン / 新チェーン) を crossfadeGain(10–30ms) でブレンドしポップ回避。
- パラメータ制御:
  - Faust: address ("/effect/param") を paramId にマッピング。setParamValue 直接呼び出し。スムージングはオプション。
  - ネイティブ: AudioParam.linearRampToValueAtTime で最小ポップ。
- 永続化 (ProjectState v2 案):
  - tracks[i].effectsChain = [{ refId, effectId, bypass, params:{paramId:value}, order }]
  - 追加ロード手順: createTrack → for each effect entry load & setParam → apply order → apply bypass。
- コントローラーマッピング (後段):
  - mappingTable: controllerKey → { trackId,effectId,paramId, transform? }
  - MIDI/ゲームパッド/OSC input → lookup → fxAPI.setParam。
- オートメーション (後段):
  - automationPoints: [{ trackId,effectId,paramId,time,value,curve }]
  - transport 実装後 scheduler で反映。
- エラーハンドリング:
  - Loader 失敗 → placeholder GainNode (unity) + warning ログ、再試行可能。
  - Param 不在 → 無視 + 一度だけ警告。
- 性能配慮:
  - 同一 refId の多重ロードを Promise キャッシュ。
  - 再配線回数削減 (バッチ操作: move + setParam の連続を microtask 末尾で一括 rebuild)。
- セキュリティ/安定性:
  - 外部追加 dsp パスは allowlist (public/dsp/effects/*)。
  - 未知 kind は拒否。
- GUI 次段階:
  - Track 行に fx インジケータ (数/警告) / クリックでモーダル or パネル。
  - エフェクトパラメータの折りたたみ UI。

- 実装ステップ (推奨順):
  1. EffectRegistry + Faust / Native Loader 抽象追加。
  2. Track.effects 配列 + 単純 rebuild 実装 (MVP)。
  3. fxAPI 公開 + 基本 add/remove/move/setParam/setBypass。
  4. ProjectState 保存/復元へ chain 反映 (暫定 JSON)。
  5. Crossfade 差し替え / バッチ再構築最適化。
  6. Controller Mapping / Automation 下地。
  7. UI 拡張 (Trackごと詳細)。

- 既存との差分影響: busManager の master チェーン機能は保持しつつ、Track 単位チェーンへ段階移行。現行 GUI (Effects Chain パネル) は当面 master chain デバッグ用として残す。

- 要確認 (ユーザー回答希望):
  1. Reverb / Compressor Faust ファイルは事前ビルド(wasm)前提か、ランタイムコンパイル(compiler利用)も許可か。
  2. Track 数の想定上限 (例: 8 / 16 / 32 ?) → キャッシュ/再配線戦略調整。
  3. エフェクト追加時の許容遅延 (ms) とクリックノイズ許容度合い。
  4. パラメータ自動化の時間精度要求 (例: 5ms / 20ms / audio-rate 不要)。
  5. Controller マッピング対象: MIDI のみか、Gamepad / OSC / WebSocket 等も初期から視野に入れるか。
  6. Persist 形式: 既存 localStorage 分割 (tracksState / logicInputs) に統合するか、新 ProjectState (単一キー) を早期導入するか。
  7. Bypass 動作: 完全切断か、0dB pass-through (CPU最小差) か希望。
  8. 将来の Send/Aux (reverb 共有) を前提に今から Bus/Effect を二層 (Insert vs Send) に分けるべきか。

---

### 2025-08-10 Effects Chain GUI (MVP)
- 追加: `busManager.ts` に FXチェーンメタ (`EffectsChainItem`) と操作API
  - `addEffect(type)`, `removeEffect(id)`, `toggleBypass(id)`, `moveEffect(id,newIndex)`, `getEffectsChainMeta()`
  - チェーン再構築時に `effects-chain-changed` CustomEvent 発火
  - 対応ノード種: gain / biquad(lowpass) / delay / fallback(gain)
- 追加: `controller.ts` に FXパネル (右下Trackパネル左側) 幅300px
  - List行: インデックス, bypass(On/Byp), ↑, ↓, ✕
  - 追加ボタン: +Gain / +LPF / +Delay / Clear
  - 並び替え/削除/バイパス操作で即再構築・イベント駆動再描画
- 設計方針: 現段階ではマスターEffectsバスのみ対象。後段でTrack別インサートやSend/Aux拡張予定。
- 未実装/TODO:
  - 各エフェクトのパラメータUI (Gain値, Filter freq/Q, DelayTime/Feedback等)
  - Bypass 時の遅延ライン保持/フェード (ポップ回避)
  - 保存形式への反映 (Track/ProjectState v2 で chain serialize)
  - エフェクト種類プラガブル化 (登録テーブル化)
  - Drag & Drop 並び替え UI
  - Multi-select / 一括bypass

### 2025-08-10 DeviceDiscovery 永続化 & 有効トグル追加
- 追加: `deviceDiscovery.ts` に localStorage 永続化 (key: `audioDevices/v1`).
  - 保存: { version:1, devices:[{id,label,enabled,kind}...] }
  - 初期化時に既存 state をロード→ enumerate で最新デバイスへ enabled 状態を引き継ぐ。
- 追加API: `setDeviceEnabled(id, enabled)` → イベント `audio-device-enabled-changed` 発火。
- enumerate 時: 既存 enabled 状態を維持 / 新規は true。
- 今後: UI 側で物理デバイスON/OFF管理を論理Inputアサイン前に反映させる基盤。
- TODO: 無効化された input デバイスを論理Inputセレクタへフィルタ表示 / Disabled 表示。

### 2025-08-10 LogicInput persistence v3 拡張
- 追加: `logicInputs.ts` を v3 へマイグレーション対応。
  - 新 key: `logicInputs/v3` ( `{ version:3, inputs: [...] }` )
  - 追加フィールド: `order` (表示順), `trackMixSnapshot` (対応Track未生成時の volume/mute/solo 記録領域, 将来統合用)
  - 既存 v2 / v1 からの段階的マイグレーション実装 (読み込み後 v3 形式で保存)
  - 並び順正規化: `normalizeOrder()` で欠損/重複を再採番
  - API拡張:
    - `reorder(id,newIndex)` : LogicInput 並び替え + イベント `logic-inputs-reordered`
    - `updateTrackMixSnapshot(id, snapshot)` : ミックス状態部分保存 + イベント `logic-input-mix-snapshot-changed`
  - 既存: `setTrackId`, `setLabel`, `remove` 等は v3 対応済
- 理由: Track 側永続化(v1)追加後、論理InputとTrack間の状態統合準備 (後続で統合 or 片側集約) の足場を早期確保。
- TODO / 次段階候補:
  1. Track 側 persistence v1 と `trackMixSnapshot` の重複領域統合方針設計 (v4 or ProjectState)
  2. reorder UI (ドラッグ&ドロップ) プロトタイプ → `reorder()` 呼び出し
  3. Effects Chain GUI 実装準備 (LogicInput 列に FX 状態アイコン予定)
  4. `updateTrackMixSnapshot` を Track イベント (mute/solo/volume) から自動反映 (まだ未接続)
- リスク: Track ID 再割当で旧 snapshot が孤立する可能性。短期は許容。将来 ProjectState で明示的整合性チェックを追加予定。

### 2025-08-10 Track状態永続化(v1) 追加
- 追加: `tracks.ts` に最小の永続化層(v1) 実装。
  - 保存対象: `id`, `name`, `userVolume`, `muted`, `solo`
  - localStorage key: `tracksState/v1` (`{ version:1, tracks:[...] }` 形式)
  - 初回ロード時に一度だけreadし `loadedTrackState` に保持 → Track生成時 `applyPersistentState()` で適用。
  - 変更トリガ: `track-volume-changed`, `tracks-changed`, `track-name-changed` をフックし 120ms デバウンスで保存。
- 方針: LogicInput 側 persistence(v2) と分離し、後続で ProjectState 統合 (v2 or v3)へマイグレーション予定。
- 理由: 先にミキシング系(音量/mute/solo/名称) を失わない基盤を確保し、Effects Chain GUI や Track追加 UI 作業時の再読込ストレスを回避。
- 制限 / 未実装:
  - `kind` や `dspChain` 内容、routing、解析メータ状態は未保存。
  - LogicInput ↔ Track の `trackId` リンク状態は LogicInput persistence に依存（統合後v3で一括にする）。
  - 将来: バージョン v2 で `kind`, routing snapshot, FX chain, order を追加予定。
- リスク: Track削除 → 同ID再利用時に過去 state が適用される可能性。短期は許容 (ID生成ポリシー改良で回避予定)。
- 次アクション(候補優先順):
  1. LogicInput persistence v3 設計 (mute/solo/volume/name を統合 or リンク方針確立)
  2. Effects Chain GUI プロトタイプ (ノード列挙 + remove + add placeholder)
  3. Virtual / MicTrack 削除経路で `disposeTrack()` 呼び出しの未処理 TODO 解消
  4. Track reorder に備えた order フィールド保存 (v2 schema 準備)
  5. Meter拡張 (peak / clip hold 保存は不要だがUI最適化)

### 2025-08-10 モジュール分割方針
- **背景:**
  - controller.tsが肥大化し、論理Inputリスト管理・物理デバイス管理・アサインUI・ルーティングUIなど責務が明確に分かれてきたため、保守性・拡張性向上のためモジュール分割を行う。
- **分割予定:**
  1. `src/audio/logicInputs.ts` : 論理Inputリストの管理・編集・保存
  2. `src/audio/deviceAssignment.ts` : 論理Inputと物理デバイスのアサイン管理（セレクタUI含む）
  3. `src/audio/routingUI.ts` : ルーティングUI（論理Input単位のルーティング・ゲイン設定UI）
  4. `src/audio/physicalDevicePanel.ts` : 物理デバイス一覧・状態表示UI
  5. `src/controller.ts` : エントリーポイント・全体初期化・各UI/ロジックの統合のみ
- **メリット:**
  - 責務分離による保守性・テスト性の向上
  - 今後の機能追加やUI刷新も安全かつ効率的に行える
  - 作品固有ロジックやUIのテンプレート化も容易
- **次アクション:**
  - 上記方針に従い、段階的に分割・移行を進める
  - 分割・移行の進捗は本mdに随時追記

### 2025-08-10 方針修正: 論理Inputリストと物理デバイスのアサイン分離
- **背景:**
  - これまでのMic Routing UIは「物理/仮想MicTrackを一元管理し、物理デバイスの有効化やルーティングを直接操作」する形だったが、Input/Output Device Listと機能が重複し、曲中で使うInput番号（論理Input）と物理デバイスの分離ができていなかった。
- **新方針:**
  1. 「曲中で使うInputリスト（論理Input番号）」を明示的に管理し、各Inputにラベルや用途などのメタ情報を持たせる。
  2. 物理Input（デバイス）と論理InputのアサインUIを分離。物理デバイス一覧は状態表示のみに特化し、論理Inputリストには「どの物理デバイスをアサインするか」を選択するセレクタを設置。
  3. Mic Routing UIは「論理Inputリストの管理・アサインUI」に置き換え、ルーティングやゲイン等の設定は論理Input単位で行う。
  4. 物理デバイスが未接続の場合は「未アサイン」や「無効」などの状態を表示。
- **UI/データ構造例:**
    | Input番号 | ラベル | アサイン物理デバイス | ルーティング | ゲイン |
    |-----------|--------|---------------------|--------------|--------|
    | 1         | Vocal  | 内蔵マイク          | Synth, Mon   | 1.0    |
    | 2         | Guitar | USB Audio           | Fx, Mon      | 0.8    |
    ...
    物理デバイスリスト:
    | デバイス名 | 状態 |
    |------------|------|
    | 内蔵マイク | 有効 |
    | USB Audio  | 有効 |
    ...
**今後の実装:**
  - 論理Inputリストの管理・編集・物理デバイス（マイク・スピーカー両方）のアサインUI設計・実装
  - 各デバイス（マイク/スピーカー）には有効/無効のトグルを設ける
  - 既存のMic Routing UIは廃止または簡素化し、Input/Output Device Listは状態表示に特化
  - ルーティングやゲイン等の設定は論理Input単位で行う
  - 物理デバイスの有効/無効はInput/Output Device Listで管理
  - **将来的な拡張:** 外部コントローラーやMIDIデバイス等も同一リストでアサイン可能にする構想。ただし現段階ではオーディオデバイス（マイク・スピーカー）のみ対象とし、拡張しやすい構造とする。
  - 拡張時はデバイス種別ごとに必要な追加パラメータ（例: コントローラー用設定等）を持てるように設計する
  - 実装後は本mdに進捗を追記すること

### 2025-08-10 Step2: MicTrack生成・Trackベース化
- `src/audio/tracks.ts` に createMicTrack を追加
- `src/audio/inputManager.ts` でマイク有効化時にMicTrackを生成するよう修正
- MicTrackは gainNode をTrackとしてラップし、TrackListに現れる
- 既存UIやInputManagerの動作は維持
- 気づき: MicTrack生成は物理マイク有効化時のみ。仮想MicTrackや予約はStep3以降で検討

### 2025-08-10 Step1: Trackラップ & audioAPI導入
- `src/audio/tracks.ts` 新規作成、Track型・createTrackEnvironment・listTracks実装
- `src/controller.ts` でinitAudio完了時にTrack生成、window.audioAPI.listTracks()導入
- 既存window.faustNode互換維持、UI/param操作は従来通り動作
- 気づき: Track導入後も既存UI壊さず段階移行可能。今後はMicTrackやParamRegistry拡張へ

### 2025-08-10 追記: TrackList最小UI + mute/solo/volume 管理導入
- 追加: `tracks.ts` に userVolume フィールド / applyMuteSoloState() / setTrackVolume() / toggleMute() / toggleSolo() / `tracks-changed` CustomEvent 発火
- 追加: `controller.ts` に固定位置の最小 TrackList パネル（Name, Mute, Solo, Volume Slider）
- 動作: Mute/ Solo 状態変更時に全Trackへ反映（solo存在時はsolo以外0）
- 互換: 既存FaustノードUIはそのまま、Track機構は段階的拡張可能
- 今後拡張予定:
  1. Trackごとのレベルメータ (AnalyserNode) 表示
  2. Track追加/削除UI（Faust複数ロード, Virtual / Sample Track プロトタイプ）
  3. ParamRegistry 導入による Faust Param UI 分離
  4. LogicInput / MicTrack 二重構造の統合ポリシー策定（論理Input→Track生成 or Trackタグ付け）
  5. Effects Bus 実装 & TrackList上でのBus種別表示（kindバッジ）
  6. Track状態永続化（volume/mute/solo）を ProjectState 保存に組込み
- 留意点: 現状 userVolume を直接GainNodeで適用、後段でオートメーション/フェード導入時は AudioParam スケジューリングへ移行

### 2025-08-10 追記: Trackレベルメータ(MVP) 実装
- 追加: `tracks.ts` に analyser + getTrackLevels() / lastLevel
- 追加: `controller.ts` TrackList行へメータバー (rAF更新, RMS→簡易コンプレッション)
- 設計: volumeGain を tap し analyser 出力未接続 (コスト低) / smoothing=0.7
- カラースケール: <0.6 緑 / 0.6–0.85 黄 / >0.85 赤 (簡易クリップ指標)
- 今後拡張: peak保持・dB表示・メータ更新パネル折り畳み最適化
- 次候補: EffectsBus 骨組 or LogicInput↔Track trackId 同期強化

### 2025-08-10 追記: EffectsBus 骨組み導入
- `busManager.ts` に insertEffectsChain([])/clearEffectsChain() 実装
- 初期状態: effectsBus は destination に直結（バイパス）
- 追加チェーン: effectsBus -> node1 -> node2 -> ... -> destination 再構築処理
- 今後: UI からノード追加・順序変更 / クロスフェード差し替え / プリセット保存
- TODO: チェーン差し替え時のポップ回避 (短いフェード), ParamRegistry統合

### 2025-08-10 追記: UI再配置 & Track操作性改善
- 変更: Logic Input / Routing パネルを右上へ移動 (固定幅/スクロール対応, デバイス表示統合)
- 変更: TrackList を右下へ移動 (幅340px, max-height 40vh, スクロール)
- 改良: Track行レイアウトを grid 化 (Name / Meter / Mute / Solo / Volume)
- 追加: dB表示ミニラベル (-∞ 表示, 20*log10, smoothing継承)
- 改良: Volumeスライダー ホイール操作対応 (±0.01 step), 数値%表示
- スタイル: ライト枠・影・角丸で視認性向上
- 次: LogicInput ↔ Track 名同期 / EffectsChain UI プロトタイプ

# 実装方針ロードマップ (Draft)

> **注意**
> このソフトウェアは「まず自分の作品（ライブエレクトロニクス等）を作る」→「後でテンプレートや配布用に“空”の状態にする」ことを前提としています。
> そのため、**作品固有のロジックやUIは必ず「モジュール」や「設定ファイル」として分離**し、テンプレート化時に簡単に除外・切り替えできるようにしてください。
> 今後AIが自動実装する際も、この方針に従い「作品用」と「汎用部」を明確に分けて実装します。



## 目的
単一 `window.faustNode` / 手続き的 UI から、複数トラック・複数DSP・拡張可能なタイムライン/ルーティング/保存機構へ漸進的に移行する。

また、Faust以外のロジック（例：コントローラー入力や独自のインタラクション、MIDI・ゲームパッド・Web API連携など）も、同じ仕組みの中で自然に拡張・統合できることを目指します。
さらに、**立体音響や複数マイキング、複数出力（例：マルチスピーカー/マルチマイク）**など、入出力が独立した複数トラックになるケースにも柔軟に対応できるよう、エンジンON後に各入出力をMicrophone Routing UIから自由にアサイン・テストできる仕組みを早期に導入します。
作品用のTrack/Param/ルーティング/外部連携などは「分離したファイル・モジュール・設定」として管理し、テンプレート化時に容易に“空”にできる設計を徹底します。

---

## 全体アーキテクチャ層



## 進捗記録・運用方針

今後この `IMPLEMENTATION_PLAN.md` に沿って作業を進める際は、どこまで進んだか・どのような実装/修正を行ったか・次にやるべきこと等を必ず記録・追記してください。

### 推奨運用
- 本ファイル内に「進捗ログ」セクションを新設し、日付・内容・担当・次アクション等を時系列で追記する
  - 例: `## 進捗ログ` の下に日付ごとに記録
- もしくは `PROGRESS_LOG.md` など別ファイルを作成し、そちらに進捗をまとめる

どちらの場合も、
  - 日付
  - 実施内容（どのステップ・どのファイルをどう変更したか）
  - 気づき・課題・TODO
  - 次のアクション
を簡潔に残すことを推奨します。

これにより、後から見返した際に進捗や設計意図が分かりやすくなります。
2. Track Layer: Track + DSPChain 管理（`audio/tracks.ts`）
3. Source Layer: Mic / FaustSynth / Sample 生成ファクトリ（`audio/sources/*`）
4. DSP Layer: Faustロード抽象（`audio/dsp/faustLoader.ts`）
5. Routing Layer: Source→Bus 接続（初期は Master固定 → `audio/routing/routingMatrix.ts`）
6. Param Registry: DSPパラメータ列挙・設定API（`audio/params/paramRegistry.ts`）
7. Transport / Scheduler（必要段階で導入）: 再生位置・Clip/Automationスケジュール（`audio/transport/transport.ts`）
8. Persistence: ProjectState JSON dump/load（`audio/project/state.ts`）
9. Event Bus: UI同期の pub/sub（薄い `EventTarget`）

---

## ディレクトリ案
```
src/audio/
  audioCore.ts
  tracks.ts
  routing/routingMatrix.ts
  dsp/faustLoader.ts
  sources/micSource.ts
  sources/faustSource.ts
  sources/sampleSource.ts
  params/paramRegistry.ts
  transport/transport.ts (後)
  project/state.ts (後)
```

---


## コア抽象（最小形）
```ts
// TrackKindは今後も拡張可能（例: 'controller', 'midi', 'custom' など）
type TrackKind = 'mic' | 'faust' | 'sample' | 'bus' | 'controller' | 'midi' | 'custom';

interface DSPUnit {
  id: string;
  node: AudioNode;
  getParamJSON?(): Promise<any>;
  setParam?(addr:string,v:number): void;
}

interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  inputNode: AudioNode;
  volumeGain: GainNode;
  outputNode: AudioNode; // = volumeGain
  dspChain: DSPUnit[];
  muted: boolean;
  solo: boolean;
  // 必要に応じて外部入力やコントローラーとの紐付け情報も追加可能
}

interface RoutingAssignment { sourceId: string; busId: string; gain: number; enabled: boolean; }
```

### Faust以外のロジックや外部インタラクションの拡張例
- TrackKindに'controller'や'midi'などを追加し、コントローラー入力やMIDIイベントをトラックやパラメータに反映できる
- ParamRegistryやEventBusを通じて、外部イベントから任意のパラメータやトラックを操作できる
- 例: コントローラーのノブ操作で特定Trackのパラメータを動かす、MIDIノートでSampleTrackをトリガする など

---

## UI 分割方針
| モジュール | 役割 |
| --- | --- |
| `bootstrap.ts` | DOMContentLoaded → 初期化呼び出し |
| `ui/trackList.ts` | Track列表示・追加・mute/solo/volume |
| `ui/paramPanel.ts` | Track選択 + DSP選択 + Param生成 |
| `ui/micPanel.ts` | 現 mic routing UI を段階移行 |
| `ui/transportBar.ts` | 再生/停止/位置/ループ (後) |
| `ui/visualizerControls.ts` | ウィンドウ操作分離 |
| `ui/projectMenu.ts` | Save/Load |

暫定 `window.audioAPI` に統一アクセスポイント:
```ts
window.audioAPI = {
  listTracks, createFaustTrack, createMicTrack,
  getTrackParams, setParam, attachFaust, saveProject, loadProject
};
```

---



## 段階的導入ステップ

---
#### 【2025-08-10 追記】マイク未接続時のMicTrack有効化予約・仮想トラックについて

現状のStep2では「物理マイクが未接続の場合はMicTrackも生成されない」設計が基本です。
「マイクが未接続でもMicTrackを仮想的に作成し、後から物理マイクが繋がったら自動で有効化」や、
「UI上でMicTrackの有効化を“予約”できる」仕組みは、Step3（複数入出力トラックのアサインUI・入出力テスト機能の導入）や、
さらに後の拡張で扱うことを想定しています。

もしStep2の段階で“仮想MicTrack”や“有効化予約”も扱いたい場合は、設計・実装方針の追加検討が必要です。
---
| Step | 目的 | 影響範囲 |
| ---- | ---- | -------- |
| 1 | `tracks.ts` 導入／既存 Faust を Track 化／`window.faustNode` 互換維持 | 追加のみ |
| 2 | Mic 有効化で MicTrack 作成／メータ接続を Track ベース化 | InputManager 微修正 |
| 3 | **複数入出力トラックのアサインUI（Microphone Routing拡張）と入出力テスト機能の導入**<br>（立体音響・複数マイキング・マルチスピーカー等に対応。エンジンON後に各入出力を自由にアサイン・テストできる） | Routing/UI/InputManager拡張 |
| 4 | Faust以外の外部インタラクション（コントローラー入力・MIDI・Web API等）をTrack/ParamRegistry/EventBus経由で扱える土台を用意 | TrackKind拡張・API追加 |
| 5 | 複数 Faust DSP ロード API (`attachFaust`) | 新UI準備 |
| 6 | ParamRegistry 追加 → 既存自動生成UI内部置換 | `renderFaustParams` |
| 7 | TrackList UI（mute/solo/volume）導入 | 新UI追加 |
| 8 | RoutingMatrix 骨組（現状 master のみ）→ 将来 Aux 拡張 | 音声再配線ユーティリティ |
| 9 | Transport（play/pause/position） + SampleClip MVP | 新ファイル |
| 10 | AutomationPoint（Param変化） | Scheduler 拡張 |
| 11 | ProjectState 保存/復元 | JSON I/O |
| 12 | Aux Bus / Send / Sidechain / Scene | 後期 |

---

## Transport / Timeline (後半)
MVP: 秒ベース `Transport` + lookAhead scheduler(0.2s / 50ms tick)  
後: TempoMap, Beat変換, Automation補間, Clip編集。

---

## パラメータ管理
- 初回 getJSON → 正規化 → キャッシュ
- UIは Track + DSP選択でフィルタ
- Set: `paramRegistry.set(trackId,dspIndex,address,value)`
- Automation対応時: scheduler が paramRegistry 経由で apply (AudioParamなら `setValueAtTime`)

---

## Routing 戦略（段階）
1. 固定: Track.output → masterGain
2. Matrix: assignments[] を再構築時にフェード（5–10ms）で disconnect/connect
3. Aux: Send用 GainNode を Track毎生成 → BusTrack.input に複数接続
4. Sidechain: ControlBus (Analyser/EnvelopeFollower) から ParamDrive

---

## 保存形式 (例)
```json
{
  "version": 1,
  "tracks": [
    { "id": "synth1", "kind": "faust", "dsp": [{ "type": "faust", "path": "/dsp/mysynth.dsp", "params": {...}}], "volume":1, "mute":false }
  ],
  "routing": [{ "sourceId":"synth1", "busId":"master", "gain":1, "enabled":true }],
  "clips": [],
  "automation": []
}
```

---

## リスク & 回避
| リスク | 回避策 |
| ------ | ------ |
| 複数Faust初期化遅延 | 遅延ロード・同一hashキャッシュ |
| 再配線ポップノイズ | Gainフェード (setValueAtTime) |
| UI肥大によるパフォーマンス低下 | requestAnimationFrame バッチ／非表示停止 |
| 互換崩壊 | `window.faustNode` 段階的撤去計画 |
| State不整合 | EventBus 1出所 (Track追加/削除/param変更) |

---

## 最初の具体タスク（推奨順）
1. `src/audio/tracks.ts` 追加 + `createTrackEnvironment` 実装
2. controller.ts の initAudio 完了時に Track 包装
3. `window.audioAPI.listTracks()` を確認
4. Mic 有効化時に MicTrack 生成（出力は master）
5. ParamRegistry 下書き（今は透過 delegates）
6. TrackList UI 最小（列挙＋volume）

---

## 以降の拡張トリガ
- サンプル再生要件成立 → Transport/Clips 開始
- エフェクトチェーン差替頻発 → DSPホットスワップ（旧/新クロスフェード）
- 外部保存ニーズ → ProjectState 先行

---

## 成功条件 (短期)
- 既存UI壊さず複数 Faust Track 追加が可能
- MicTrack が TrackList に現れ volume/mute 反映
- ParamUI が Track切替できる（将来）

## 成功条件 (中期)
- RoutingMatrix で ON/OFF / Gain 変更即反映
- 再生/停止 + SampleClip スケジュール動作
- 保存/復元で同じ音構成が再現

---

## まとめ
この設計では、Faustだけでなくコントローラー入力やMIDI、Web APIなど「外部インタラクション」もTrack/ParamRegistry/EventBusの抽象を通じて柔軟に統合できます。
小規模ステップで Track/DSP/Routing/Param を分離し、互換レイヤを残しつつ徐々に UI とロジックを解耦。後段で Transport/Automation や外部インタラクションも自然追加。

また、将来的にはMax/MSPのような「ノード（Track/DSP/Bus/Param）を線でつなぐ」ビジュアルエディタや、
信号フロー・ルーティング・パラメータをスタイリッシュに可視化・編集できるUIも目指します。
Faustの自動ビジュアライズ機能や、全体構成のテキスト記述との連携も意識し、
「直感的で美しいパッチング体験」を提供できるよう拡張していきます。

### DSP分類システム (将来拡張)
- **目的**: Synthカテゴリ、Effectカテゴリ、およびその境界が曖昧なDSPを適切に管理・配置する体系の確立。
- **分類方針**:
  - **Source系**: 音源生成（oscillator, sampler, noise generator等）- 新Track作成に適用
  - **Effect系**: 音響処理（reverb, filter, compressor等）- 既存Track Insert/Send配置
  - **Hybrid系**: 音源+エフェクト融合（granular reverb, vocoder, self-oscillating filter等）- 用途に応じて柔軟配置
  - **Utility系**: 分析・制御（analyzer, envelope follower, sequencer等）- 制御信号生成
- **Track配置ルール**:
  ```typescript
  interface DSPCompatibility {
    canBeSource: boolean;     // 新Track単独配置可能
    canBeInsert: boolean;     // Insert chain配置可能  
    canBeSend: boolean;       // Send/Return配置可能
    requiresInput: boolean;   // 入力音声必須
  }
  ```
- **UI動作**: DSP追加時に分類に基づいて配置選択肢を自動提示
- **ビジュアル表現**: カテゴリ別色分け（Source:緑, Effect:青, Hybrid:紫, Utility:灰）でノード識別
- **メタデータ管理**: public/dsp/ 下の.dspファイルに対応する.jsonでカテゴリ情報管理
- **実装段階**: EffectRegistry拡張時にcategory/subCategoryフィールド追加、UI側で配置ロジック分岐

### Track生成・破棄・クリックノイズ対策 (重要)
- **Synth系DSP Track管理**: DSP有効化時にTrack自動生成、無効化時に安全破棄
- **柔軟なTrack生成タイミング**: 
  - 即座生成（UI操作時）
  - 遅延生成（条件待ち：デバイス接続、プリセット読み込み等）  
  - 一括生成（プロジェクト復元時）
- **クリックノイズ回避機構**:
  ```typescript
  // Track生成時のフェードイン
  async createTrackSafely(config: TrackConfig): Promise<Track> {
    const track = createTrack(config);
    track.volumeGain.gain.setValueAtTime(0, audioContext.currentTime);
    track.volumeGain.gain.linearRampToValueAtTime(
      config.initialVolume, audioContext.currentTime + 0.015
    );
    return track;
  }
  
  // Track破棄時のフェードアウト
  async dismissTrackSafely(track: Track): Promise<void> {
    const fadeTime = 0.02; // 20ms
    track.volumeGain.gain.linearRampToValueAtTime(
      0, audioContext.currentTime + fadeTime
    );
    setTimeout(() => {
      track.dispose(); // 接続解除・リソース解放
      removeFromTrackList(track.id);
    }, fadeTime * 1000 + 10); // 余裕をもって破棄
  }
  ```
- **状態管理**: LogicInput ↔ Track 関連付けの動的更新、persistence v3での状態保持
- **UI反映**: TrackList上でのリアルタイム出現・消失、メータ状態のスムーズ遷移

## 🚀 次期実装優先順位 (2025-08-18 更新)

### **🎯 現在の状況**
- ✅ **Base Audio分離実装**: `ensureBaseAudio()` + `applyFaustDSP()` 完了
- ✅ **TestSignalManager**: tone/noise/impulse テスト信号システム完成
- ✅ **Faust DSP音響問題**: 音声出力・安定性問題完全解決
- ✅ **AudioContext管理**: keep-alive機構、参照保持、診断システム実装済み
- ✅ **Track基礎システム**: mute/solo/volume、メータ表示、永続化v1対応済み
- ✅ **Effects Chain GUI**: Master FXチェーン追加・削除・順序変更・バイパス機能実装済み
- ✅ **EffectRegistry v2**: カテゴリ分類、メタデータ駆動、busManager統合完了

### **Phase 1: 実際のFaust WASM統合 (最高優先)**
1. **mysynth.dsp WASM化**
   - 現在プレースホルダのGainNodeを実際のFaust AudioWorkletNodeに置換
   - メタデータからのパラメータ自動マッピング
   - DSP→WASM→AudioWorkletNode生成パイプライン実装

2. **プリコンパイルFaust対応**
   - 事前ビルドWASMファイルの自動検出・ロード
   - コンパイル済みDSPの高速インスタンス化
   - パラメータ情報の自動抽出

### **Phase 2: Track Lifecycle Manager 実装**
1. **安全なTrack生成・破棄システム**
   - 15ms フェードイン、20ms フェードアウト実装
   - LogicInput ↔ Track 動的連携
   - クリックノイズ完全排除機構

2. **LogicInput & Track 統合**
   - trackId フィールド追加
   - 生成/削除フロー実装
   - pending状態管理

### **Phase 3: UI拡張・ユーザビリティ向上**
1. **エフェクト選択UI改善**
   - カテゴリ別ドロップダウンメニュー
   - エフェクト説明・プレビュー機能
   - パラメータ編集UI統合

2. **Effects Chain表示拡張**
   - パラメータ値のリアルタイム表示
   - Bypass視覚化改善
   - ドラッグ&ドロップ並び替え

### **Phase 4: ProjectState v2 統合**
1. **統一保存形式実装**
   - tracksState/v1 + logicInputs/v3 → projectState/v2
   - Track.effectsChain + EffectRegistry v2参照の永続化
   - Migration システム実装

### **Phase 5: Insert/Send 二層アーキテクチャ**
1. **Send/Aux Bus システム**
   - Track Insert Effects + Send Bus 分離
   - AuxBus 実装
   - ループ防止チェック

---

### **🎯 即座に開始すべき作業**

現在の最優先タスクは **Phase 1: 実際のFaust WASM統合** です。

#### **1. mysynth.dsp の実WASM化**
- 現在のEffectRegistry v2は実装完了しているが、プレースホルダのGainNodeを使用
- mysynth.dspを実際のFaust AudioWorkletNodeとして動作させる
- メタデータ(.json)とDSPコードの自動連携

#### **2. 実装検証**
- ブラウザでEffectRegistry v2のカテゴリボタン動作確認
- DSP自動スキャン機能のテスト
- エフェクト追加・削除の実動作確認

**準備ができましたか？Phase 1の実装を開始しましょう！**

### 2025-08-10 Step3 準備: LogicInput と Track 統合方針 (Draft)
- 現状課題:
  - LogicInput(論理Input管理 + ルーティングUI + persistence) と Track (mute/solo/volume + 将来Param/UI) が並立し重複する責務あり。
  - MicTrack生成は物理マイク有効化経路(InputManager)経由、LogicInput側で有効化/アサインしても即 Track 化されないタイムラグ/不整合の余地。
- 統合ゴール(段階的):
  1. LogicInput = Track 作成トリガ(一対一)。
  2. 物理デバイスアサイン完了 + enabled=true で MicTrack (kind 'mic') 自動生成。
  3. 未アサイン/disabled の LogicInput は“pending”状態 (Track未生成) としてUI表示。
  4. LogicInput 削除で対応する Track を安全にdispose。
  5. TrackList 側で name 編集 → LogicInput.label へ反映(単一ソースオブトゥルース label)。
- 選択アプローチ:
  - Phase A: Trackは生成後 read-only (name/mute/solo/volumeのみ)。ラベル編集は LogicInput 側→再レンダー。
  - Phase B: 双方向同期 (Track名変更→LogicInput更新) 実現。
- 追加フィールド案:
  - LogicInput: trackId?: string | null (生成済み Track 参照)。
  - Track: originLogicInputId?: string (逆参照)。
- メータ導入計画:
  1. Track.volumeGain 後段に AnalyserNode を挿入。
  2. requestAnimationFrame で全Trackメータを1ループ集計 → TrackList UI に描画。
  3. 非表示時(パネル折りたたみ予定)は計測停止でCPU節約。
- Effects Bus 実装前倒し理由:
  - RoutingUI の synth/effects/monitor フラグを実音声上で可視化確認しやすくする。
  - BusManager に insertEffectsChain(trackId, nodes[]) 形の拡張フックを追加予定。
- Persistence 次フェーズ:
  - logicInputs v1 既存 → v2 で trackId, pending 状態, lastVolume 追加。
  - Migration: v1 ロード時は欠損フィールドをデフォルト補完。
- 直近タスク (優先順):
  1. LogicInput に trackId 追加 & 生成/削除フロー (Phase A)。
  2. LogicInput enable / device assign イベントで ensureTrack() 実装。
  3. Track dispose ユーティリティ追加 (tracks.ts)。
  4. TrackList にメータ欄(簡易横バー)追加。
  5. logicInputs persistence v2 migration。
  6. EffectsBus (仮: ノードパス passthrough → 後でFXチェーン挿入)。
- リスクと対策:
  - 二重生成: ensureTrack で既存 trackId チェック。
  - 破棄漏れ: disposeTrack(trackId) で AudioNode.disconnect + 配列除去 + events。
  - Migration失敗: versionタグ必須 + try/catch ログ。
- 成功条件(統合フェーズ完了):
  - LogicInput の enable/assign 操作だけで TrackList に出現/消滅。
  - Track mute/solo/volume が LogicInput 経由のルーティングに矛盾なく適用。
  - 再読込後も Track/LogicInput 対応関係が復元。

### 2025-08-11 低レイテンシ対応方針 & ユーザー回答反映
- 本節はユーザー回答(事前コンパイル優先 / 最大256 Track / クリックノイズ不可 / Controller拡張: MIDI+Gamepad+OSC 後段 / 早期ProjectState統合 / クロスフェードによるバイパス / Insert+Send二層導入 ) を反映。

#### 1. EffectRegistry 拡張
- Entry 追加フィールド: `preload():Promise<void>` / `category?` / `latencySec?` / `kind: 'faust-precompiled' | 'faust-compile' | 'native'` (compile は将来実装 placeholder)
- Promise キャッシュ: `registryLoadCache[refId]` で多重要求抑止。
- 一括プリロード: `fxAPI.preloadAll(refIds?)` → UI 起動時 or セッションロード時に先行。

#### 2. チェーン再構築 (RebuildManager)
- 操作キュー `pendingOps` に add/remove/move/setBypass を push → microtask 末尾で 1 回 `apply()`。
- `apply()` 手順:
  1. 変更前の active chain snapshot 取得。
  2. 新 chain インスタンス(ノード)準備 (不足分 create, 削除対象を retain until fade end)。
  3. 並列パス: (oldPathGain=1, newPathGain=0) を Master 合流点手前で合成。
  4. `linearRamp` で crossfade (default 0.02s)。
  5. フェード完了後 old ノード群 disconnect + dispose (bypass保持ノード除外)。
- 連続高速操作: crossfade 中に再度発火した場合は 前回 newPath を old とみなし再入。

#### 3. Bypass 実装
- ノード自体保持 (CPU軽微) / 内部 wetGain=0 でミュート。
- Bypass 切替時は (wet 0→1 or 1→0) を `bypassFadeMs` (default 15ms) で平滑。
- 完全除去希望時は `remove()` API を使用。

#### 4. Param Scheduler
- API: `setParam(trackId,effectId,paramId,value,{time?,ramp?='linear',smoothMs?})`。
- `time` 指定なし: 現在時刻 + 0.001s (ガード) で開始。
- `smoothMs` 省略時: デフォルト 15ms (コンプレッサ閾値など突発変化抑制)。
- ramp 種: 'linear' / 'exp' (exp は終値>0 の場合のみ) / 'step'。
- Faustパラメータ: 当面 message (UI thread) 送信 + 内部平滑 (必要時) → 将来 SharedArrayBuffer 書き込みへ拡張可能な抽象 (`FaustParamAdapter`).

#### 5. Adaptive Scheduling
- `automationTickMs` 初期 5ms。負荷計測 (p95 > 3ms) で 8ms へ自動引き上げ。逆に余裕 (p95 < 1ms) で 3ms へ短縮可能 (上限/下限設定)。
- Metrics: `rebuildDurationMs`, `paramBatchSize`, `schedulerDriftMs` を ring buffer で保持し `fxAPI.getMetrics()` で取得。

#### 6. ProjectState v2 統合
- 旧: `tracksState/v1` + `logicInputs/v3` → 新: `projectState/v2` 単一保存。
- スキーマ差分:
```json
{
  "version": 2,
  "tracks": [
    { "id":"t1","kind":"faust","name":"Synth1","volume":0.8,"mute":false,"solo":false,
      "effectsChain":[
        { "refId":"revLarge","effectId":"e1","bypass":false,
          "params": { "decay":2.5, "mix":0.35 }, "order":0 }
      ],
      "sends": [ { "busId":"auxVerb","gain":0.5 } ]
    }
  ],
  "auxBuses": [ { "id":"auxVerb","effectsChain":[],"name":"ReverbBus" } ],
  "logicInputs": [ /* 既存 v3 fields + trackId */ ],
  "mappings": [ /* controller mapping (将来) */ ],
  "automation": [ /* points (後段) */ ]
}
```
- Migration 手順:
  1. 既存 keys 読込 → Track / LogicInput マージ → effectsChain 空配列付与。
  2. 保存時は新キー `projectState/v2` へ書込。旧キーは残置 (後でクリーンアップ)。

#### 7. Insert / Send 二層
- Track: `insertEffects[]` → outputGain → (sendTapGain[]) → master / aux buses。
- Send: Track毎 `sendGains[busId]` (0..1)。ProjectState に `sends` 配列。
- AuxBus: `auxBuses[]` (構造は Track に近いが master へ最終合流 / ループ防止チェック)。
- 早期は UI 未提供 (内部状態のみ)。

#### 8. 大規模 (最大256 Track) 対策
- Analyser 遅延生成 + 可視 Track 限定更新。
- `EffectInstance.latencySec?` で将来補正予約 (現在は未使用)。
- プリロード: 初回起動時に必須 FX(refId allowlist) を parallel fetch。

#### 9. エラーフォールバック
- ロード失敗: placeholder GainNode unity + `effect.meta.error=true`。
- 再試行 API: `fxAPI.retryLoad(effectId)`。

#### 10. 公開 API (初期)
```ts
fxAPI = {
  preloadAll, add, remove, move, setBypass, setParam, list, loadPreset,
  getMetrics, saveProject, loadProject
}
```

#### 11. 実装ステップ更新
1. EffectRegistry (preload, Promise cache) + Precompiled Faust Loader stub
2. Track model 拡張: `insertEffects`, `sends`, AuxBus 型追加
3. RebuildManager (MVP: crossfade) + fxAPI 基本操作
4. ProjectState v2 migration 実装 (旧キー読み込み→統合保存)
5. Param Scheduler + setParam smoothing
6. Bypass crossfade 実装 + metrics 収集
7. Send/Aux 内部配線 (UI無し)
8. UI: Track行 FXインジケータ + 簡易 list() 表示
9. (必要時) MIDI Adapter stub / MappingRegistry スケルトン
10. 最適化: バッチ rebuild / adaptive scheduling

### 2025-08-18 Phase 2: TrackLifecycleManager & 音声ルーティング修正完了 ✅
**概要**: Track生成・破棄の安全化、音声ルーティング問題の解決、エフェクトレジストリの操作性向上を完了。

#### **Phase 1: 音声ルーティング緊急修正**
- **問題状況**: DSP音声は生成されているがスピーカーから無音、メータも動作せず
- **根本原因**: busManager に outputGainNode と effectsInput が存在しない
- **技術的解決**:
  - busManager 初期化時に outputGainNode, effectsInput を追加生成
  - 音声チェーン修正: `effectsInput → outputGainNode → destination`
  - トラック接続先を busManager.effectsInput に統一
- **動作確認**: mysynth, testsynth から実際の音声出力復活

#### **Phase 2: TrackLifecycleManager実装**
- **新ファイル**: `src/audio/trackLifecycleManager.ts` (178行)
- **設計パターン**: シングルトン、安全なライフサイクル管理
- **主要機能**:
  - `createTrackSafely()`: 15ms フェードイン付き安全Track生成
  - `dismissTrackSafely()`: 20ms フェードアウト後自動削除
  - AudioContext 自動設定・フォールバック機能（window.audioCtx利用）
  - 統計情報取得（getStats）とエラーハンドリング
- **統合**: audioCore.ensureBaseAudio でのAudioContext自動設定

#### **Phase 3: EffectRegistry操作性大幅向上**
- **スキャン機能改良**:
  - 重複スキャン抑制: 全ベースDSP登録済みの場合は自動スキップ
  - より詳細なログ出力とスキップ理由の明確化
  - `force` オプションによる強制再スキャン対応
- **開発者向けAPI拡張**:
  - `fx` グローバルヘルパー: scan(), ls(), inst(), reset(), verbose(), ensure()
  - デバッグインターフェース: effectRegistryDebug 拡張
  - ユーティリティ関数: resetEffectRegistry(), ensureEffect()
  - 冗長ログ制御: setEffectRegistryVerbose()

#### **Phase 4: 実動作テスト完了**
- **検証シナリオ**:
  1. fx.reset() → 全エフェクト削除（ネイティブ保持）
  2. fx.scan() → DSPファイル再登録（3個検出: mysynth, testsignals, testsynth）
  3. fx.ls() → 登録済みエフェクト一覧表示（ネイティブ3 + DSP3 = 計6個）
  4. fx.inst('testsynth') → Faust AudioWorkletNode生成成功
- **結果**: 全音声出力正常、エフェクト操作も簡易化完了

#### **技術的改善点**
- **自動AudioContext設定**: TrackLifecycleManager が未設定時に window.audioCtx をフォールバック採用
- **接続ログ強化**: Track生成時の接続先をログ出力で可視化
- **エラーメッセージ改善**: 失敗時により具体的な原因と対処方法を表示
- **スキャンロジック最適化**: 既存登録状況を考慮した無駄な処理削減

#### **開発体験向上**
- **ワンライナー操作**: `fx.inst('testsynth')` で即座にエフェクト生成
- **状態確認簡易化**: `fx.ls()` で登録状況、`fx.has('id')` で存在確認
- **リセット機能**: `fx.reset()` で開発時の状態初期化
- **冗長ログ制御**: `fx.verbose(false)` で本番環境向け静音化

#### **次段階準備完了**
- **Insert FXチェーンAPI**: Track単位でのエフェクト追加・削除・並び替え機能
- **GUI同期**: リアルタイムメータとパラメータUI連携
- **永続化**: エフェクトチェーン状態の保存・復元機能
- **カテゴリ拡張**: synths/, effects/ サブディレクトリ自動スキャン

#### **品質指標**
- **音声出力**: ✅ 全DSP音声正常出力
- **操作性**: ✅ fx.* APIによる直感的操作
- **安定性**: ✅ フェード処理によるクリックノイズ防止
- **開発効率**: ✅ リセット・再スキャンによる高速反復開発

## 🎼 **プロジェクト目的・現状分析** (2025-08-19 プロジェクト理解修正)

### 🎯 **プロジェクトの真の目的**
**現代音楽・エレクトロニクス・ミクスト音楽のためのリアルタイム演奏制御システム**

#### **基本コンセプト**
- **テキストベース記述**: 音声処理・映像生成を事前にスクリプト記述
- **時間軸制御**: テンポ・拍数・小節数による音楽的時間管理
- **本番演奏システム**: 完成した作品の確実・安定したライブ実行
- **マルチウィンドウ**: 奏者向け画面（複数）+ オペレータ制御画面
- **外部連携**: 照明・映像・録音システムとの統合

#### **想定される使用場面**
```
現代音楽コンサート:
奏者 → 楽器演奏 + エレクトロニクス制御
↓
音響システム → リアルタイムDSP処理 + 音響空間制御  
↓
映像システム → 音響連動ビジュアル生成
↓
統合制御 → オペレータによる全体統括
```

### 📊 **音響エンジン実装状況**

#### ✅ **完全実装済み（音響基盤）**
1. **Base Audio分離** - テスト信号がDSP適用前から利用可能
2. **Faust WASM統合** - リアルタイムDSPコンパイル・パラメータ制御
3. **TrackLifecycleManager** - 15ms/20msフェード付き安全Track管理
4. **EffectRegistry v2** - メタデータ駆動・カテゴリ自動判定・fx APIヘルパー
5. **音声ルーティング** - busManager with outputGainNode/effectsInput
6. **永続化v1** - Track状態(volume/mute/solo/name)のlocalStorage保存

#### 🚧 **部分実装済み（拡張可能）**
1. **Insert FXチェーン基盤** - Track.insertEffects[]配列・基本CRUD API実装済み
2. **Master FXチェーン** - クロスフェード対応・遅延キュー機能
3. **GUI・メータ** - 基本的なレベル表示・カテゴリ別色分け
4. **診断・デバッグ** - 包括的な状態診断・テスト関数群

#### ❌ **未実装（現代音楽演奏システム要件）**
1. **音楽的時間軸制御** - テンポ・拍子・小節ベースのスケジューリング
2. **マルチウィンドウシステム** - 奏者画面・オペレータ画面分離
3. **スコア・キュー表示** - 演奏者向け楽譜・指示表示
4. **外部システム連携** - OSC・MIDI・HTTP通信による統合制御
5. **パフォーマンス記述言語** - 時間軸・トリガー・条件分岐記述システム

### 🎼 **現代音楽演奏システム設計**

#### **音楽的時間軸制御システム**
```typescript
// 時間記述システム（現代音楽対応）
type MusicalTime = 
  | { type: 'absolute', seconds: number }           // 絶対時間: 125.5秒
  | { type: 'musical', bars: number, beats: number, subdivisions?: number } // 音楽時間: 32小節2拍目
  | { type: 'tempo_relative', beats: number }       // テンポ相対: 64拍後
  | { type: 'trigger_wait', triggerId: string }     // トリガー待ち: "soloist_phrase_end"
  | { type: 'conductor_cue', cueId: string }        // 指揮者キュー: "section_B_start"

// パフォーマンス記述例（エレクトロニクス・ミクスト作品）
const performance = {
  "title": "Resonance Fields - for violin and electronics",
  "composer": "Contemporary Composer",
  "duration": "12:30",
  "performers": ["violin", "electronics_operator"],
  
  "timeline": [
    {
      "section": "I. Preparation",
      "time": { "type": "absolute", "seconds": 0 },
      "actions": [
        { "type": "start_metronome", "bpm": 60, "subdivision": 4, "performers": ["violin"] },
        { "type": "prepare_electronics", "dsp_chain": ["granular_delay", "spectral_filter"] },
        { "type": "visual_cue", "message": "準備完了", "target": "performer_1" }
      ]
    },
    {
      "section": "II. Entrance - violin solo",
      "time": { "type": "conductor_cue", "cueId": "violin_entrance" },
      "actions": [
        { "type": "activate_input", "source": "violin_mic", "gain": 0.9 },
        { "type": "apply_dsp", "target": "violin", "effects": ["subtle_reverb"] },
        { "type": "start_visual", "mode": "waveform_analysis" }
      ]
    },
    {
      "section": "III. Electronics entry",
      "time": { "type": "musical", "bars": 8, "beats": 1 },
      "actions": [
        { "type": "fade_in_synth", "dsp": "spectral_synth", "duration": "4_beats" },
        { "type": "crossfade_visual", "from": "waveform", "to": "spectral_cascade" },
        { "type": "send_osc", "address": "/lighting/fade_to_blue", "args": [3.0] }
      ]
    }
  ]
}
```

#### **マルチウィンドウシステム設計**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   奏者画面       │    │  指揮者画面      │    │ オペレータ制御   │
│                │    │                │    │                │
│ ♪ 60 BPM (4/4)  │    │ ♫ スコア表示     │    │ 🎛️ 音響制御      │
│ 📍 32小節1拍目   │    │ 📍 進行状況     │    │ 📊 レベルメータ   │
│ 🎵 "Entrance"   │    │ 🎯 次回キュー    │    │ 🔗 外部システム   │
│ 🎤 Input Level  │    │ ⏱️ タイミング   │    │ 🎬 映像同期      │
│ 💡 "cresc."     │    │ 🎼 パート表示    │    │ 📡 OSC/MIDI     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### **外部システム統合**
```typescript
interface ContemporaryMusicSystem {
  // 照明システム連携
  lighting: {
    sendOSC(address: string, args: number[]): void;
    // 例: /lighting/scene_change "ethereal" 5.0
    syncToAudio(analysisType: 'amplitude' | 'spectral' | 'onset'): void;
  };
  
  // 映像システム連携  
  video: {
    triggerEffect(effectId: string, intensity: number): void;
    syncVisualToScore(barNumber: number, beatPosition: number): void;
    // 例: パーティクル生成を音響解析と同期
  };
  
  // 録音システム連携
  recording: {
    startMultitrackRecording(tracks: string[]): void;
    addMarker(label: string, timecode: string): void;
    // 例: 楽章ごと、重要なキューポイントでマーカー追加
  };
  
  // 空間音響制御
  spatialAudio: {
    moveSoundSource(sourceId: string, position: [number, number, number]): void;
    controlAmbisonicRotation(azimuth: number, elevation: number): void;
    // 例: 奏者の音像を空間内で移動、電子音の3D配置
  };
}
```

#### **演奏支援機能**
```typescript
interface PerformerAssistance {
  // メトロノーム・クリック
  metronome: {
    setComplexMeter(numerator: number, denominator: number, subdivision?: number): void;
    // 例: 7/8拍子、複雑な拍子への対応
    enableRitardando(startBar: number, endBar: number, finalTempo: number): void;
    setClickSound(type: 'traditional' | 'subtle' | 'custom', volume: number): void;
  };
  
  // 楽譜・指示表示
  scoreDisplay: {
    showCurrentMeasure(measureNumber: number): void;
    highlightNextCue(cueType: 'dynamics' | 'technique' | 'electronics'): void;
    displayPerformanceNote(message: string, duration: number): void;
    // 例: "次：sul ponticello", "エレクトロニクス開始まで4小節"
  };
  
  // 音響フィードバック
  audioFeedback: {
    enableMonitoring(source: 'self' | 'electronics' | 'mix'): void;
    setMonitorLevel(level: number): void;
    provideIntonationReference(pitch: number): void; // A=440Hz等
  };
}
```

### 🚀 **実装ロードマップ（現代音楽演奏システム対応）**

#### **Phase 1: 音楽的時間軸システム構築** (優先度: 最高)
**目標**: テンポ・拍子・小節ベースの時間制御エンジン
```typescript
// 実装対象
- MusicalTimeManager: 音楽的時間軸制御
- TempoEngine: 複雑拍子・テンポ変化対応  
- PerformanceScheduler: スコア記述→実行変換
- CueSystem: 奏者・指揮者向けキュー管理
```
**現状活用**: 既存audioCore, busManager, effectRegistryを時間軸制御下に統合
**作業量**: 中 (5-7日)

#### **Phase 2: マルチウィンドウ・パフォーマンスUI** (優先度: 高)
**目標**: 奏者向け画面・オペレータ制御画面の分離
```typescript
// 実装対象  
- PerformerWindow: メトロノーム・楽譜・キュー表示
- OperatorWindow: 全体制御・システム監視
- WindowManager: Tauri マルチウィンドウ管理
- InterWindowCommunication: リアルタイム同期
```
**現状活用**: controller.tsをOperatorWindow向けに拡張、新規PerformerWindow作成
**作業量**: 中 (4-6日)

#### **Phase 3: パフォーマンス記述言語** (優先度: 高)
**目標**: JSON/YAML形式での演奏スクリプト記述・実行
```typescript
// 実装対象
- PerformanceScript: 演奏記述パーサー
- TimelineExecutor: スクリプト→リアルタイム実行
- TriggerSystem: 条件分岐・待機制御
- ScriptValidator: 事前検証・エラー検出
```
**現状活用**: effectRegistry, trackLifecycleManagerを時間軸で制御
**作業量**: 大 (7-10日)

#### **Phase 4: 外部システム統合** (優先度: 中)
**目標**: OSC・MIDI・HTTP通信による統合制御
```typescript
// 実装対象
- OSCInterface: Open Sound Control 送受信
- MIDIController: MIDI機器・ソフトウェア連携
- HTTPGateway: RESTful API・WebSocket通信
- ExternalSyncManager: 遅延補償・同期制御
```
**現状活用**: 既存音響エンジンをネットワーク制御可能に拡張
**作業量**: 中 (4-6日)

#### **Phase 5: 演奏支援・可視化強化** (優先度: 中)
**目標**: 楽譜表示・音響フィードバック・映像同期
```typescript
// 実装対象
- ScoreRenderer: 楽譜・指示表示エンジン
- AudioVisualSync: 音響解析→映像生成連携
- MonitoringSystem: 奏者向け音響モニタリング
- RecordingIntegration: マルチトラック録音・マーカー
```
**現状活用**: visualizers/ を演奏支援向けに特化拡張
**作業量**: 大 (8-12日)

### 🎯 **現在の音響基盤との統合方針**

#### **保持・活用する実装** (変更最小限)
- ✅ **Faust WASM統合**: 現代音楽の複雑なDSP要件に最適
- ✅ **TrackLifecycleManager**: 演奏中の動的Track制御に必須
- ✅ **EffectRegistry**: エフェクトのリアルタイム切り替えに活用
- ✅ **音声ルーティング**: 複数奏者・電子音の統合ミキシング

#### **拡張・改修する実装**
- 🔄 **時間制御**: 絶対時間→音楽的時間軸への拡張
- 🔄 **UI分離**: 単一画面→マルチウィンドウ演奏環境
- 🔄 **制御API**: 手動操作→スクリプト自動実行への拡張

#### **新規実装が必要な領域**
- 🆕 **MusicalTimeManager**: 音楽的時間軸制御エンジン
- 🆕 **PerformanceScript**: 演奏記述・実行システム
- 🆕 **ExternalSync**: 外部システム統合
- 🆕 **PerformerUI**: 奏者向け専用インターフェース

### 💡 **現代音楽システムとしての特徴**

#### **技術的強み**
- **リアルタイムDSP**: Faust WASMによる高品質音響処理
- **柔軟な時間制御**: 複雑拍子・テンポ変化・不規則構造対応
- **統合制御**: 音響・映像・照明の一元管理
- **演奏支援**: 奏者の負担軽減・正確な演奏実現

#### **想定される作品例**
```
1. "Interactive Soundscape" - 奏者の演奏に応答する電子音響
2. "Temporal Layers" - 複数時間軸が重層する作品
3. "Spatial Electronics" - 3D音響空間での音像移動
4. "Multimedia Performance" - 音響・映像・照明の統合芸術
```

現在の実装基盤は**現代音楽演奏システムとして非常に適している**状態です。音響エンジンの品質が高く、時間軸制御とマルチウィンドウ対応を追加することで、**プロレベルの現代音楽演奏環境**が実現できます。

## 今後のロードマップ

### **現代音楽演奏システムへの進化**

現在のプロジェクトは**音響処理エンジンとして高品質で安定**している状態です。これを基盤として、**現代音楽・エレクトロニクス・ミクスト音楽のための演奏制御システム**へと発展させる段階に入りました。

### **保持すべき既存実装**
- ✅ **Faust WASM統合**: 現代音楽の複雑なDSP要件に最適
- ✅ **TrackLifecycleManager**: リアルタイム音源制御に必須  
- ✅ **EffectRegistry**: エフェクトのライブ切り替えに活用
- ✅ **音声ルーティング**: 複数奏者・電子音の統合に最適
- ✅ **Insert FXチェーン基盤**: 演奏中のエフェクト制御に活用

### **新規実装が必要な核心機能**

#### **1. 音楽的時間軸制御システム** (最優先)
- MusicalTimeManager: テンポ・拍子・小節ベース時間制御
- PerformanceScheduler: 楽譜記述→リアルタイム実行
- CueSystem: 奏者・指揮者向けキューイング

#### **2. マルチウィンドウ演奏環境** (高優先)
- PerformerWindow: 奏者向けメトロノーム・楽譜・指示表示
- OperatorWindow: オペレータ制御・システム監視
- WindowSyncManager: リアルタイム同期・通信

#### **3. 外部システム統合** (中優先)  
- OSC/MIDI/HTTP通信による照明・映像・録音システム連携
- 空間音響制御・アンビソニック対応
- ネットワーク遅延補償・同期制御

### **段階的実装方針**
1. **Phase 1**: 音楽的時間軸 → 既存システムの時間制御化
2. **Phase 2**: マルチウィンドウ → Tauri環境活用
3. **Phase 3**: 演奏記述言語 → JSON/YAML スクリプト実行
4. **Phase 4**: 外部連携 → 統合演奏環境完成
5. **Phase 5**: 演奏支援強化 → 楽譜表示・録音統合

現在の実装基盤により、**プロレベルの現代音楽演奏システム**の実現は十分に現実的です。

## ⏰ **開発期間予測** (2025-08-19 算出)

### **現状基盤**: 1週間完了 ✅
- 高品質音響エンジン・Faust WASM統合・Track管理システム
- **工数**: 約40-50時間の集中実装

### **現代音楽演奏システム拡張**: 10-12週間予測

#### **Phase 1: 音楽的時間軸システム** (2-3週間)
- MusicalTimeManager・TempoEngine・PerformanceScheduler・CueSystem
- 複雑拍子・テンポ変化・既存システム統合
- **工数**: 60-80時間

#### **Phase 2: マルチウィンドウ演奏環境** (1.5-2週間)  
- PerformerWindow・OperatorWindow・Tauri マルチウィンドウ
- リアルタイム同期・ウィンドウ間通信
- **工数**: 40-60時間

#### **Phase 3: 演奏記述言語・実行** (2-2.5週間)
- PerformanceScript・TimelineExecutor・TriggerSystem
- JSON/YAML パーサー・条件分岐・検証システム
- **工数**: 60-80時間

#### **Phase 4: 外部システム統合** (1-1.5週間)
- OSC・MIDI・HTTP通信・遅延補償・同期制御
- 照明・映像・録音システム連携
- **工数**: 30-45時間

#### **Phase 5: 演奏支援・最終調整** (1-1.5週間)
- 楽譜表示・音響フィードバック・全体最適化
- **工数**: 30-45時間

### **総期間**: **コア機能 9-12週間 + 拡張バッファ 2-4週間**

### **将来拡張予測**
- **短期** (+2-4週間): 高度楽譜表示・空間音響・AI支援
- **中期** (+4-8週間): VR/AR統合・機械学習・ネットワーク演奏  
- **長期** (+8-16週間): 複数会場同時・AI楽譜生成・聴衆参加

**根拠**: 現在の開発速度(1日7-8時間高効率)・音響基盤90%完成・アーキテクチャ優秀により上位レイヤー実装に集中可能

---

## 📖 **新チャット移行時の参照指針**

### **📋 必読セクション**
1. **プロジェクト目的**: 現代音楽・エレクトロニクス・ミクスト音楽演奏制御システム
2. **音響エンジン実装状況**: 完全実装済み・部分実装済み・未実装の詳細
3. **現代音楽演奏システム設計**: 時間軸制御・マルチウィンドウ・外部連携仕様
4. **実装ロードマップ**: Phase 1-5の詳細・既存基盤活用方針
5. **開発期間予測**: 10-12週間コア実装・拡張予測

### **🔧 技術基盤確認項目**
- **完全実装**: Faust WASM・TrackLifecycleManager・EffectRegistry・音声ルーティング
- **活用可能**: tracks.ts Insert FX API・busManager・audioCore・永続化v1
- **fx APIヘルパー**: `fx.scan()`, `fx.inst()`, `fx.ls()`, `fx.reset()`

### **🎯 次の実装優先順位**
1. **MusicalTimeManager**: 音楽的時間軸制御エンジン (最優先)
2. **マルチウィンドウ**: Tauri環境でのPerformer/Operator画面分離
3. **PerformanceScript**: 演奏記述→実行変換システム

### **💡 重要な設計方針**
- 既存音響基盤は高品質で変更最小限
- 時間制御は絶対時間→音楽的時間軸への拡張
- UI は単一画面→マルチウィンドウ演奏環境へ
- 制御は手動操作→スクリプト自動実行への拡張
