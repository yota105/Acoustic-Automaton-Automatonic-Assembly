# Phase 5: Live Electronics Performance System - 詳細実装計画

## 現在の状況整理

### ✅ 完了済みフェーズ
- **Phase 1-3**: Base Audio Architecture (2025-08-17完了)
- **Phase 4a**: AudioWorklet Migration (2025-08-21完了)
  - レイテンシ: ~18.5ms (150msから88%改善)
  - メモリ使用量: ~15MB (150MBから90%削減)
  - CPU使用率: ~0% (安定動作)

### 🚧 進行中フェーズ
- **Phase 4b**: Memory Optimization (進行中)
  - 4b.1: Buffer Management ✅ 完了
  - 4b.2: Module Loading Optimization 🚧 進行中
  - 4b.3: Memory Monitoring (今後)

### 🔄 Phase 4c: Bundle Size Optimization (次フェーズ)
- 4c.1: Code Splitting
- 4c.2: Asset Optimization

## Phase 5: Live Performance System 詳細実装計画

### 🎯 全体目標
- UR22C 2入力 + 内部音源 → ステレオ出力のライブミキシング
- リアルタイム音響生成
- リハーサル対応のための安定動作
- Clickトラックの高度なタイミング制御

---

## � 詳細タイムライン

### **Week 1: Phase 4b完了 + Phase 5準備 (1-7日目)**

#### Day 1-2: Phase 4b完了確認
- [ ] Module Loading Optimization完了確認
- [ ] Memory Monitoringシステム実装
- [ ] パフォーマンスベンチマーク実行
- [ ] Phase 5移行準備

#### Day 3-4: Phase 5基盤設計
- [ ] LiveMixerクラス設計詳細化
- [ ] Track統合方式の確定
- [ ] UIアーキテクチャ設計
- [ ] Clickトラック統合計画

#### Day 5-7: 初期実装開始
- [ ] LiveMixerクラスの基本構造実装
- [ ] TrackManager統合インターフェース作成
- [ ] 基本的なチャンネル作成機能

### **Week 2: Core Live System実装 (8-14日目)**

#### Day 8-10: UR22C統合
- [ ] UR22C入力検出機能
- [ ] LogicInput → Track自動変換
- [ ] チャンネル割り当てUI
- [ ] 入力レベル監視

#### Day 11-12: 内部シンセ統合
- [ ] Faust DSPシンセのTrack割り当て
- [ ] シンセパラメータ制御
- [ ] シンセ音量/ミュート制御
- [ ] シンセのライブ制御

#### Day 13-14: Clickトラック実装
- [ ] ClickトラックのTrack割り当て
- [ ] MusicalTimeManager統合
- [ ] 基本的なテンポ制御
- [ ] モニター出力設定

### **Week 3: UI & コントロール実装 (15-21日目)**

#### Day 15-17: ライブコントロールパネル
- [ ] チャンネルストリップUI実装
- [ ] フェーダー/ミュート/ソロ機能
- [ ] レベルメーター表示
- [ ] マスターセクションUI

#### Day 18-19: Clickコントロール拡張
- [ ] テンポ変更UI
- [ ] カウントダウン機能UI
- [ ] 外部制御設定UI
- [ ] フェードコントロール

#### Day 20-21: パフォーマンス監視
- [ ] CPU/メモリ監視UI
- [ ] オーディオドロップアウト検出
- [ ] レイテンシ測定表示
- [ ] システム状態インジケーター

### **Week 4: 統合テスト & リハーサル準備 (22-28日目)**

#### Day 22-24: 統合テスト
- [ ] 全チャンネル同時動作テスト
- [ ] UR22C + 内部シンセ + Click同時テスト
- [ ] ライブコントロール応答性テスト
- [ ] パフォーマンス監視テスト

#### Day 25-26: エラー処理実装
- [ ] 緊急停止機能
- [ ] 自動リカバリー
- [ ] バックアップ設定
- [ ] エラーログ機能

#### Day 27-28: リハーサル準備
- [ ] 設定プロファイル作成
- [ ] クイックセットアップ機能
- [ ] ドキュメント更新
- [ ] テストシナリオ作成

---

## 🛠️ 技術的実装詳細

### **5a.1: LiveMixerクラスの詳細設計**

```typescript
interface LiveMixerChannel {
  id: string;
  name: string;
  trackId: string;  // 対応するTrack ID
  inputNode: AudioNode;
  volumeGain: GainNode;
  panNode: StereoPannerNode;
  effectsChain: AudioNode[];
  outputNode: AudioNode;
  muted: boolean;
  solo: boolean;
  analyser?: AnalyserNode;
  levelMeter?: LevelMeter;
}

class LiveMixer {
  private channels = new Map<string, LiveMixerChannel>();
  private masterBus: GainNode;
  private effectsBus: GainNode;
  private monitorBus: GainNode;
  private trackManager: TrackManager;

  constructor(trackManager: TrackManager) {
    this.trackManager = trackManager;
    this.initializeBuses();
  }

  // UR22C統合
  async setupUR22CInputs(): Promise<void> {
    const logicInputs = await this.discoverUR22CInputs();
    for (const input of logicInputs) {
      await this.createChannelFromLogicInput(input.id, input.label);
    }
  }

  // 内部シンセ統合
  async setupInternalSynth(): Promise<void> {
    const synthTrack = await this.trackManager.createTrack({
      kind: 'faust',
      name: 'Internal Synth',
      inputSource: 'faust-synth'
    });
    await this.createChannelFromTrack(synthTrack.id, 'Internal Synth');
  }

  // Clickトラック統合
  async setupClickTrack(): Promise<void> {
    const clickTrack = await this.trackManager.createTrack({
      kind: 'custom',
      name: 'Click',
      inputSource: 'metronome'
    });
    await this.createChannelFromTrack(clickTrack.id, 'Click');

    // モニター出力にルーティング
    this.routeToMonitor(clickTrack.id);
  }
}
```

### **5a.2: TrackManager統合インターフェース**

```typescript
interface TrackCreationOptions {
  kind: TrackKind;
  name: string;
  inputSource: string;
  routing?: {
    synth?: boolean;
    effects?: boolean;
    monitor?: boolean;
  };
}

class TrackManager {
  private tracks: Map<string, Track> = new Map();

  async createTrack(options: TrackCreationOptions): Promise<Track> {
    const track = await createTrackInternal(options);
    this.tracks.set(track.id, track);
    return track;
  }

  async getTrack(trackId: string): Promise<Track | null> {
    return this.tracks.get(trackId) || null;
  }

  async updateTrackRouting(trackId: string, routing: RoutingOptions): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track) return;

    // BusManager経由でルーティング更新
    await this.busManager.updateTrackRouting(trackId, routing);
  }
}
```

### **5a.3: Clickトラックの高度な制御**

```typescript
interface ClickTrackOptions {
  tempo: number;
  timeSignature: [number, number];
  volume: number;
  enableCountdown: boolean;
  countdownFile?: string;
  midiControl: boolean;
  fadeInTime?: number;
  fadeOutTime?: number;
}

class ClickTrackController {
  private clickTrack: Track;
  private metronome: FaustMetronome;
  private options: ClickTrackOptions;

  constructor(clickTrack: Track, metronome: FaustMetronome) {
    this.clickTrack = clickTrack;
    this.metronome = metronome;
  }

  // 動的テンポ制御
  async setTempo(bpm: number, numerator: number = 4, denominator: number = 4): Promise<void> {
    this.options.tempo = bpm;
    this.options.timeSignature = [numerator, denominator];
    await this.metronome.setTempo(bpm, numerator, denominator);
  }

  // カウントダウン機能
  async playCountdown(audioFile: string): Promise<void> {
    const audioBuffer = await this.loadAudioFile(audioFile);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.clickTrack.inputNode);
    source.start();
  }

  // フェード制御
  async fadeIn(duration: number): Promise<void> {
    const gainNode = this.clickTrack.volumeGain;
    const startTime = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(this.options.volume, startTime + duration);
  }

  async fadeOut(duration: number): Promise<void> {
    const gainNode = this.clickTrack.volumeGain;
    const startTime = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(gainNode.gain.value, startTime);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
  }
}
```

---

## 🎯 成功基準

### **技術的基準**
- [ ] 全チャンネル同時動作時の安定性
- [ ] UR22C入力の確実な検出と割り当て
- [ ] Clickトラックのリアルタイムテンポ変更
- [ ] ライブコントロールの応答性 (<100ms)
- [ ] パフォーマンス監視の正確性

### **運用基準**
- [ ] リハーサルでの30分以上の連続動作
- [ ] 緊急停止からの1分以内の復旧
- [ ] 設定変更の即時反映
- [ ] 直感的な操作性

### **品質基準**
- [ ] オーディオドロップアウトなし
- [ ] レイテンシ < 50ms
- [ ] CPU使用率 < 50%
- [ ] メモリリークなし

---

## 🚨 リスク管理

### **技術的リスク**
1. **UR22Cドライバー互換性**: テストデバイスでの検証必須
2. **AudioWorklet安定性**: Phase 4b完了後の再テスト
3. **メモリ管理**: 大規模セッションでのリーク監視

### **運用リスク**
1. **ライブ操作ミス**: 緊急停止機能の充実
2. **パフォーマンス不足**: 事前ベンチマークの徹底
3. **設定喪失**: 永続化機能の強化

### **緩和策**
- **段階的ロールアウト**: 各機能を個別にテスト
- **フォールバック機能**: 問題発生時の安全モード
- **詳細ログ**: トラブルシューティング用ログ
- **バックアップ設定**: クイックリカバリー機能

---

## 📊 進捗管理

### **Daily Standup項目**
- 前日の完了タスク
- 当日の作業予定
- ブロック要因
- 品質確認結果

### **Weekly Review項目**
- 全体進捗率
- 技術的課題
- 品質メトリクス
- 次週計画

### **品質ゲート**
- **Day 7**: Phase 5基盤完了
- **Day 14**: Core機能完了
- **Day 21**: UI完了
- **Day 28**: 統合テスト完了

この詳細計画により、Phase 5の実装を体系的かつ確実に進めていきます。

  startMonitoring(): void {
    // CPU/メモリ監視
    // オーディオドロップアウト検出
  }

  getStatus(): PerformanceStatus {
    return {
      cpu: this.cpuUsage,
      memory: this.memoryUsage,
      dropouts: this.audioDropouts,
      latency: this.measureLatency()
    };
  }
}
```

### 🔧 技術的実装戦略

#### 既存システムの活用
- **LogicInputManager**: UR22C入力の管理
- **Trackシステム**: チャンネルとしての活用
- **BusManager**: マスター/エフェクト/モニターバス
- **TestSignalManager**: テスト信号生成

#### 新規実装範囲
- **LiveMixer**: ライブミキシングの統合インターフェース
- **LiveControlPanel**: ライブ操作向けUI
- **PerformanceMonitor**: リアルタイム監視
- **EmergencyControls**: 緊急停止機能

### 📅 実装スケジュール

#### Week 1: 基礎実装 (Phase 4b完了待ち)
- LiveMixerクラスの基本構造
- UR22C統合の実装
- 内部シンセ統合

#### Week 2: UI実装
- ライブコントロールパネルの作成
- チャンネルストリップUI
- マスターセクションUI

#### Week 3: 統合テスト
- パフォーマンス監視の実装
- エラー処理とリカバリー
- リハーサルシミュレーション

### 🎪 作曲実装 (Section 1-3)

#### Section 1: Introduction
**音響処理**:
- LogicInputからのB4検出トリガー
- リバーブ適用とサステイン管理
- 電子音の追加生成

**映像処理**:
- 3パネル分割表示
- トリガー時のフラッシュ効果
- インスタンス管理

#### Section 2: Dynamic Movement
**座標システムの実装**:
```typescript
class CoordinateSystem {
  private instances = new Map<string, AudioVisualInstance>();

  updateInstancePosition(instanceId: string, x: number, y: number, z: number): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.position = { x, y, z };
      this.updateAudioParameters(instance);
      this.updateVisualParameters(instance);
    }
  }
}
```

### 🚨 リスク管理

#### 技術的リスク
- **レイテンシ超過**: Phase 4b完了で解決予定
- **メモリリーク**: 既存の最適化で対応
- **ブラウザ互換性**: AudioWorklet対応確認

#### 運用リスク
- **UR22C接続問題**: フォールバック準備
- **パフォーマンス不足**: 監視システムで早期検知
- **操作ミス**: 緊急停止機能

### 📊 成功基準

#### 技術的基準
- [ ] 安定した30分以上の連続動作
- [ ] 許容可能なレイテンシ (<50ms)
- [ ] オーディオ品質の維持 (ドロップアウトなし)

#### 運用基準
- [ ] UR22C 2入力の正常動作
- [ ] 内部シンセの統合
- [ ] ライブコントロールの応答性

### 🔄 次のステップ

1. **Phase 4b完了の確認**
2. **LiveMixerクラスの実装開始**
3. **既存システムとの統合テスト**
4. **UIプロトタイプ作成**

---

**実装開始条件**: Phase 4b完了後、すぐにPhase 5aを開始
