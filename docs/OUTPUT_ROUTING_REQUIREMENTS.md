# Output Routing Requirements
**出力ルーティングシステム仕様**

## 概要
Acoustic Automatonでは、複数の出力系統を持ち、それぞれ異なる用途に対応します。Logic Inputs / Routingパネルから柔軟にルーティング設定が可能です。

---

## 出力系統の種類

### 1. メイン出力 (Main Output)
**用途:** 実際の演奏時、観衆が聴く音

**仕様:**
- **チャンネル数:** ステレオ (L/R) 2ch
- **拡張性:** 将来的にマルチチャンネル対応可能な設計
- **信号源:**
  - すべての演奏音源 (Faust DSP, サンプル再生, マイク入力等)
  - エフェクトバス (effectsBus) からの処理済み信号
  - 合成バス (synthBus) からの合成音
- **除外される信号:**
  - クリックトラック (メトロノーム)
  - モニタリング専用信号

**接続先:**
- AudioContext.destination (デフォルト)
- または外部オーディオインターフェース (UR22C等) の指定出力ポート

---

### 2. モニター出力 (Monitor Outputs)
**用途:** 奏者やオペレーターに送る音 (返し + クリック)

**仕様:**
- **出力数:** 3系統 (Performer 1, 2, 3)
- **チャンネル数:** 各モノラル or ステレオ (設定可能)
- **信号構成:**
  - **返し (Foldback):** 他の奏者の音を含むミックス
  - **クリックトラック:** メトロノーム信号
  - **自分の音:** 対応する奏者の音を少し大きめにミックス

**ミキシングルール:**
```
Monitor Output 1 = Click + Performer1音(大) + Performer2音(小) + Performer3音(小)
Monitor Output 2 = Click + Performer1音(小) + Performer2音(大) + Performer3音(小)
Monitor Output 3 = Click + Performer1音(小) + Performer2音(小) + Performer3音(大)
```

**音量比率 (例):**
- 自分の音: 0 dB (基準)
- 他の奏者の音: -6 dB
- クリック: -3 dB (調整可能)

**接続先:**
- オーディオインターフェースの個別出力ポート
- または内部ルーティングバス → 外部ミキサー

---

## アーキテクチャ設計

### 出力ノード構造

```
Track 1 (Performer 1) ──┐
Track 2 (Performer 2) ──┼──► effectsBus ──► Main Output (Audience)
Track 3 (Performer 3) ──┘
Click Track ───────────────────► (Main Outputには送らない)

Track 1 ──┐
Track 2 ──┼──► monitorBus ──► Monitor Matrix ──┬──► Monitor Out 1
Track 3 ──┘                                      ├──► Monitor Out 2
Click Track ──────────────────────────────────┴──► Monitor Out 3
```

### BusManager 拡張

現在の `BusManager` クラスに以下を追加:

```typescript
export class BusManager {
    private synthBus: GainNode;
    private effectsBus: GainNode;
    private monitorBus: GainNode;
    
    // 新規追加: メイン出力
    private mainOutput: GainNode;
    
    // 新規追加: モニター出力 (3系統)
    private monitorOutputs: {
        performer1: GainNode;
        performer2: GainNode;
        performer3: GainNode;
    };
    
    // 新規追加: モニターミックスマトリクス
    private monitorMatrix: MonitorMixerMatrix;
}
```

### MonitorMixerMatrix クラス

```typescript
export interface PerformerMonitorConfig {
    selfGain: number;      // 自分の音のゲイン (例: 0 dB = 1.0)
    othersGain: number;    // 他の奏者のゲイン (例: -6 dB = 0.5)
    clickGain: number;     // クリックのゲイン (例: -3 dB = 0.707)
}

export class MonitorMixerMatrix {
    private ctx: AudioContext;
    private performerTracks: Map<number, AudioNode>; // 1, 2, 3 -> Track output
    private clickTrack: AudioNode;
    
    private outputs: {
        performer1: GainNode;
        performer2: GainNode;
        performer3: GainNode;
    };
    
    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.performerTracks = new Map();
        this.outputs = {
            performer1: ctx.createGain(),
            performer2: ctx.createGain(),
            performer3: ctx.createGain(),
        };
    }
    
    /**
     * 奏者のトラックを登録
     */
    registerPerformerTrack(performerId: 1 | 2 | 3, trackOutput: AudioNode): void {
        this.performerTracks.set(performerId, trackOutput);
        this.rebuildMatrix();
    }
    
    /**
     * クリックトラックを登録
     */
    registerClickTrack(clickOutput: AudioNode): void {
        this.clickTrack = clickOutput;
        this.rebuildMatrix();
    }
    
    /**
     * モニターミックスマトリクスを再構築
     */
    private rebuildMatrix(): void {
        // 既存接続をクリア
        this.clearConnections();
        
        // Performer 1のモニター
        this.mixPerformerMonitor(1, {
            selfGain: 1.0,      // 0 dB
            othersGain: 0.5,    // -6 dB
            clickGain: 0.707    // -3 dB
        });
        
        // Performer 2のモニター
        this.mixPerformerMonitor(2, {
            selfGain: 1.0,
            othersGain: 0.5,
            clickGain: 0.707
        });
        
        // Performer 3のモニター
        this.mixPerformerMonitor(3, {
            selfGain: 1.0,
            othersGain: 0.5,
            clickGain: 0.707
        });
    }
    
    /**
     * 個別奏者のモニターミックスを作成
     */
    private mixPerformerMonitor(
        performerId: 1 | 2 | 3,
        config: PerformerMonitorConfig
    ): void {
        const outputKey = `performer${performerId}` as keyof typeof this.outputs;
        const output = this.outputs[outputKey];
        
        // 自分の音
        const selfTrack = this.performerTracks.get(performerId);
        if (selfTrack) {
            const selfGain = this.ctx.createGain();
            selfGain.gain.value = config.selfGain;
            selfTrack.connect(selfGain).connect(output);
        }
        
        // 他の奏者の音
        [1, 2, 3].forEach(otherId => {
            if (otherId !== performerId) {
                const otherTrack = this.performerTracks.get(otherId as 1 | 2 | 3);
                if (otherTrack) {
                    const otherGain = this.ctx.createGain();
                    otherGain.gain.value = config.othersGain;
                    otherTrack.connect(otherGain).connect(output);
                }
            }
        });
        
        // クリックトラック
        if (this.clickTrack) {
            const clickGain = this.ctx.createGain();
            clickGain.gain.value = config.clickGain;
            this.clickTrack.connect(clickGain).connect(output);
        }
    }
    
    /**
     * モニター出力ノードを取得
     */
    getMonitorOutput(performerId: 1 | 2 | 3): GainNode {
        const key = `performer${performerId}` as keyof typeof this.outputs;
        return this.outputs[key];
    }
    
    /**
     * すべての接続をクリア
     */
    private clearConnections(): void {
        Object.values(this.outputs).forEach(output => {
            try { output.disconnect(); } catch { }
        });
    }
}
```

---

## UI設計: Logic Inputs / Routing パネル

### ルーティングマトリクス表示

```
┌─────────────────────────────────────────────────────────┐
│ Logic Inputs / Routing                                  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ Track          │ Main Out │ Mon 1 │ Mon 2 │ Mon 3 │ Vol │
│ ─────────────────────────────────────────────────────── │
│ Performer 1    │   [✓]    │ [✓]   │ [ ]   │ [ ]   │ ▓░░ │
│ Performer 2    │   [✓]    │ [ ]   │ [✓]   │ [ ]   │ ▓░░ │
│ Performer 3    │   [✓]    │ [ ]   │ [ ]   │ [✓]   │ ▓░░ │
│ Click          │   [ ]    │ [✓]   │ [✓]   │ [✓]   │ ▓░░ │
│                                                           │
│ Monitor Mix Settings:                                     │
│ ┌───────────────────────────────────────────────────┐   │
│ │ Self Level:   [====|====]  0 dB                   │   │
│ │ Others Level: [==|======] -6 dB                   │   │
│ │ Click Level:  [===|=====] -3 dB                   │   │
│ └───────────────────────────────────────────────────┘   │
│                                                           │
│ Output Device Assignment:                                 │
│ ┌───────────────────────────────────────────────────┐   │
│ │ Main Output:  [UR22C Output 1-2 (Stereo)    ▼]   │   │
│ │ Monitor 1:    [UR22C Output 3              ▼]   │   │
│ │ Monitor 2:    [UR22C Output 4              ▼]   │   │
│ │ Monitor 3:    [Internal Speaker            ▼]   │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 実装コンポーネント

**RoutingMatrixUI.ts**
```typescript
export class RoutingMatrixUI {
    private busManager: BusManager;
    private monitorMatrix: MonitorMixerMatrix;
    
    constructor(busManager: BusManager) {
        this.busManager = busManager;
        this.monitorMatrix = busManager.getMonitorMatrix();
    }
    
    /**
     * ルーティングマトリクスを描画
     */
    renderMatrix(): void {
        const tracks = listTracks();
        const container = document.getElementById('routing-matrix');
        
        // HTML生成...
    }
    
    /**
     * トラックの出力先を変更
     */
    toggleTrackOutput(
        trackId: string,
        output: 'main' | 'monitor1' | 'monitor2' | 'monitor3',
        enabled: boolean
    ): void {
        const track = getTrackById(trackId);
        if (!track) return;
        
        if (output === 'main') {
            if (enabled) {
                this.busManager.routeToMainOutput(track);
            } else {
                this.busManager.removeFromMainOutput(track);
            }
        } else {
            const performerId = parseInt(output.replace('monitor', '')) as 1 | 2 | 3;
            if (enabled) {
                this.monitorMatrix.addTrackToMonitor(performerId, track);
            } else {
                this.monitorMatrix.removeTrackFromMonitor(performerId, track);
            }
        }
    }
    
    /**
     * モニターミックス設定を更新
     */
    updateMonitorMixConfig(config: PerformerMonitorConfig): void {
        this.monitorMatrix.updateConfig(config);
    }
}
```

---

## 実装手順

### Phase 1: BusManager拡張
- [x] 既存の `monitorBus` を保持
- [ ] `mainOutput` ノードを追加
- [ ] `monitorOutputs` (3系統) を追加
- [ ] 既存APIとの互換性を維持

### Phase 2: MonitorMixerMatrix実装
- [ ] `MonitorMixerMatrix` クラス作成
- [ ] 奏者トラック登録API実装
- [ ] クリックトラック登録API実装
- [ ] ミックスマトリクス自動構築ロジック実装

### Phase 3: Track統合
- [ ] Track出力を `mainOutput` と `monitorOutputs` に分岐可能に
- [ ] `TrackLifecycleManager` にルーティング設定を統合
- [ ] Click Track専用の出力設定 (Main除外, Monitor専用)

### Phase 4: UI実装
- [ ] `RoutingMatrixUI` コンポーネント作成
- [ ] チェックボックスによるルーティング切り替え
- [ ] モニターミックス設定スライダー
- [ ] 出力デバイス選択ドロップダウン

### Phase 5: デバイス割り当て
- [ ] Web Audio API の `setSinkId()` 対応
- [ ] オーディオインターフェース (UR22C) の個別出力選択
- [ ] デバイス変更時の自動再接続

---

## テスト計画

### 単体テスト
- [ ] MonitorMixerMatrix のミキシング比率テスト
- [ ] BusManager の出力分岐テスト
- [ ] Track routing切り替えテスト

### 統合テスト
- [ ] 3人の奏者 + クリックの同時再生
- [ ] モニター出力の音量比率確認
- [ ] メイン出力にクリックが含まれないことを確認

### パフォーマンステスト
- [ ] 複数出力による CPU負荷測定
- [ ] レイテンシ測定 (メイン vs モニター)

---

## 将来の拡張

### マルチチャンネル対応
- 5.1ch, 7.1ch サラウンド出力
- Ambisonics対応 (空間オーディオ)

### ネットワークオーディオ
- AES67 / Dante対応
- リモート奏者へのモニター送信

### 自動ミキシング
- AI による最適なモニターバランス調整
- 演奏内容に応じた動的なゲイン制御

---

## 参考資料
- [AUDIO_SYSTEM.md](./AUDIO_SYSTEM.md) - オーディオシステム全体設計
- [AUDIO_CONCEPTS_CLARIFICATION.md](./AUDIO_CONCEPTS_CLARIFICATION.md) - Track/Bus/LogicInput概念
- [PERFORMER_TARGETING_GUIDE.md](./PERFORMER_TARGETING_GUIDE.md) - 奏者指定システム
