# Playback Integration Plan - 再生機能統合計画

## 概要

Performanceページの**Playボタン**から作品を再生できるようにする統合実装。
セクション選択機能も含め、MusicalTimeManagerとcomposition.tsを連携させる。

---

## 1. アーキテクチャ概要

```
[Performance Page]
    ↓ Playボタン押下
[PerformanceController]
    ↓ 初期化・開始
[CompositionPlayer] ← 新規作成
    ├─ [MusicalTimeManager] (時間軸管理)
    ├─ [CompositionLoader] (composition.ts読み込み)
    ├─ [EventScheduler] (イベントスケジューリング)
    └─ [SectionController] (セクション制御)
        ↓ イベント配信
[BroadcastChannel] → Player画面・Controller画面
        ↓ 音響処理
[Audio System] (BaseAudio, Tracks, Effects)
```

---

## 2. 新規コンポーネント

### 2.1 CompositionPlayer

**責任**: 作品全体の再生制御

```typescript
// src/performance/compositionPlayer.ts
import { composition, Composition, CompositionEvent } from '../works/composition';
import { getMusicalTimeManager, initMusicalTimeManager } from '../audio/musicalTimeManager';

export class CompositionPlayer {
    private composition: Composition;
    private musicalTimeManager: any;
    private currentSection: string | null = null;
    private scheduledEvents: Map<string, number> = new Map();
    private isPlaying: boolean = false;
    
    constructor(private audioContext: AudioContext) {
        this.composition = composition;
    }
    
    /**
     * 初期化
     */
    async initialize(): Promise<void> {
        // MusicalTimeManagerの初期化
        this.musicalTimeManager = initMusicalTimeManager(
            this.audioContext,
            this.composition.initialTempo
        );
        
        // イベントコールバック設定
        this.musicalTimeManager.onBeat((bar: number, beat: number) => {
            this.handleBeat(bar, beat);
        });
        
        console.log('✅ CompositionPlayer initialized');
    }
    
    /**
     * 再生開始
     */
    async play(sectionId?: string): Promise<void> {
        if (this.isPlaying) {
            console.warn('Already playing');
            return;
        }
        
        // セクション指定があれば該当セクションから開始
        if (sectionId) {
            this.currentSection = sectionId;
            await this.seekToSection(sectionId);
        } else {
            // 最初のセクションから開始
            this.currentSection = this.composition.sections[0].id;
        }
        
        // イベントをスケジュール
        this.scheduleAllEvents();
        
        // MusicalTimeManager開始
        this.musicalTimeManager.start();
        this.isPlaying = true;
        
        console.log(`▶️ Playback started from section: ${this.currentSection}`);
    }
    
    /**
     * 一時停止
     */
    pause(): void {
        if (!this.isPlaying) return;
        
        this.musicalTimeManager.pause();
        this.isPlaying = false;
        console.log('⏸️ Playback paused');
    }
    
    /**
     * 停止
     */
    stop(): void {
        if (!this.isPlaying) return;
        
        this.musicalTimeManager.stop();
        this.isPlaying = false;
        this.currentSection = null;
        this.scheduledEvents.clear();
        console.log('⏹️ Playback stopped');
    }
    
    /**
     * 指定セクションへシーク
     */
    private async seekToSection(sectionId: string): Promise<void> {
        const section = this.composition.sections.find(s => s.id === sectionId);
        if (!section) {
            throw new Error(`Section not found: ${sectionId}`);
        }
        
        // セクション開始位置にシーク
        if (section.start.type === 'musical') {
            // 小節ベースでシーク（MusicalTimeManagerに実装必要）
            console.log(`Seeking to bar ${section.start.time.bar}`);
        } else if (section.start.type === 'absolute') {
            // 絶対時間でシーク
            console.log(`Seeking to ${section.start.time.seconds}s`);
        }
    }
    
    /**
     * 全イベントをスケジュール
     */
    private scheduleAllEvents(): void {
        // 現在のセクションから開始
        const currentSectionIndex = this.composition.sections.findIndex(
            s => s.id === this.currentSection
        );
        
        // 現在以降のセクションのイベントをスケジュール
        for (let i = currentSectionIndex; i < this.composition.sections.length; i++) {
            const section = this.composition.sections[i];
            
            for (const event of section.events) {
                this.scheduleEvent(event);
            }
        }
        
        console.log(`📅 Scheduled ${this.scheduledEvents.size} events`);
    }
    
    /**
     * 個別イベントをスケジュール
     */
    private scheduleEvent(event: CompositionEvent): void {
        if (event.at.type === 'musical') {
            // 音楽的時間でスケジュール
            this.musicalTimeManager.scheduleEvent({
                id: event.id,
                time: event.at.time,
                type: event.type,
                action: event.action,
                parameters: event.parameters,
                description: event.description
            });
        } else if (event.at.type === 'absolute') {
            // 絶対時間でスケジュール
            const scheduleTime = this.audioContext.currentTime + event.at.time.seconds;
            // タイムアウトでスケジュール
            const timeoutId = window.setTimeout(() => {
                this.executeEvent(event);
            }, event.at.time.seconds * 1000);
            
            this.scheduledEvents.set(event.id, timeoutId);
        }
    }
    
    /**
     * 拍ごとのコールバック
     */
    private handleBeat(bar: number, beat: number): void {
        // 現在位置を更新
        console.log(`🎵 Bar ${bar}, Beat ${beat}`);
        
        // セクション境界チェック
        this.checkSectionBoundary(bar, beat);
    }
    
    /**
     * セクション境界チェック
     */
    private checkSectionBoundary(bar: number, beat: number): void {
        for (const section of this.composition.sections) {
            if (section.start.type === 'musical') {
                const startBar = section.start.time.bar;
                const startBeat = section.start.time.beat;
                
                if (bar === startBar && beat === startBeat) {
                    this.onSectionChange(section.id);
                }
            }
        }
    }
    
    /**
     * セクション変更時
     */
    private onSectionChange(sectionId: string): void {
        console.log(`🎬 Section changed: ${sectionId}`);
        this.currentSection = sectionId;
        
        // セクション変更をブロードキャスト
        const channel = new BroadcastChannel('performance-control');
        channel.postMessage({
            type: 'section-change',
            sectionId: sectionId
        });
    }
    
    /**
     * イベント実行
     */
    private executeEvent(event: CompositionEvent): void {
        console.log(`⚡ Executing event: ${event.id} (${event.type})`);
        
        // イベントタイプに応じた処理
        switch (event.type) {
            case 'audio':
                this.executeAudioEvent(event);
                break;
            case 'notation':
                this.executeNotationEvent(event);
                break;
            case 'cue':
                this.executeCueEvent(event);
                break;
            case 'visual':
                this.executeVisualEvent(event);
                break;
            case 'tempo_change':
                this.executeTempoChange(event);
                break;
            case 'system':
                this.executeSystemEvent(event);
                break;
        }
    }
    
    /**
     * オーディオイベント実行
     */
    private executeAudioEvent(event: CompositionEvent): void {
        // TODO: 音響システムとの統合
        console.log(`🔊 Audio event: ${event.action}`, event.parameters);
    }
    
    /**
     * 楽譜表示イベント実行
     */
    private executeNotationEvent(event: CompositionEvent): void {
        // BroadcastChannelでPlayer画面に送信
        const channel = new BroadcastChannel('performance-control');
        channel.postMessage({
            type: 'update-score',
            scoreData: event.parameters,
            target: event.target
        });
    }
    
    /**
     * キューイベント実行
     */
    private executeCueEvent(event: CompositionEvent): void {
        const channel = new BroadcastChannel('performance-control');
        channel.postMessage({
            type: 'cue',
            message: event.parameters?.message || event.description,
            target: event.target,
            priority: event.parameters?.priority || 'normal'
        });
    }
    
    /**
     * ビジュアルイベント実行
     */
    private executeVisualEvent(event: CompositionEvent): void {
        // TODO: Visualizerとの統合
        console.log(`👁️ Visual event: ${event.action}`, event.parameters);
    }
    
    /**
     * テンポ変更実行
     */
    private executeTempoChange(event: CompositionEvent): void {
        const newBpm = event.parameters?.targetBpm;
        if (newBpm) {
            this.musicalTimeManager.setTempo({
                bpm: newBpm,
                numerator: event.parameters?.numerator || 4,
                denominator: event.parameters?.denominator || 4
            });
            console.log(`🎼 Tempo changed to ${newBpm} BPM`);
        }
    }
    
    /**
     * システムイベント実行
     */
    private executeSystemEvent(event: CompositionEvent): void {
        console.log(`⚙️ System event: ${event.action}`, event.parameters);
        
        // Section A特有のシステムイベント
        if (event.action === 'initialize_section_a') {
            // TODO: Section A初期化処理
        } else if (event.action === 'start_random_performance_scheduler') {
            // TODO: ランダム演奏スケジューラー開始
        }
    }
    
    /**
     * 現在の状態取得
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            currentSection: this.currentSection,
            musicalTime: this.musicalTimeManager?.getStatus()
        };
    }
}
```

---

## 3. Performance.html への統合

### 3.1 セクション選択UI

```html
<!-- Performance.html に追加 -->
<div class="section-control">
    <h2>Section Control</h2>
    
    <div class="section-selector">
        <label for="section-select">Select Section:</label>
        <select id="section-select">
            <option value="">-- Select Section --</option>
            <option value="section_a_intro">Section A: Introduction</option>
            <option value="section_b">Section B: Development</option>
            <!-- 他のセクションを動的に追加 -->
        </select>
    </div>
    
    <div class="playback-info">
        <div class="info-item">
            <span class="label">Current Section:</span>
            <span id="current-section" class="value">--</span>
        </div>
        <div class="info-item">
            <span class="label">Musical Time:</span>
            <span id="musical-time" class="value">Bar 1, Beat 1</span>
        </div>
        <div class="info-item">
            <span class="label">Tempo:</span>
            <span id="current-tempo" class="value">60 BPM</span>
        </div>
    </div>
</div>

<style>
.section-control {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
}

.section-selector {
    margin-bottom: 1rem;
}

.section-selector label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
}

.section-selector select {
    width: 100%;
    padding: 0.5rem;
    font-size: 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.playback-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #ddd;
}

.info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.info-item .label {
    font-size: 0.875rem;
    color: #666;
    font-weight: 500;
}

.info-item .value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1a1a1a;
}
</style>
```

---

## 4. Performance.ts の更新

```typescript
// src/performance.ts
import { CompositionPlayer } from './performance/compositionPlayer';
import { ensureBaseAudio } from './audio/audioCore';

class PerformanceController {
    private compositionPlayer: CompositionPlayer | null = null;
    private audioContext: AudioContext | null = null;
    
    // ... 既存コード ...
    
    private async handlePlay(): Promise<void> {
        this.log('▶️ Play button pressed');
        
        if (!this.state.isPlaying) {
            try {
                // Audio Contextの初期化
                if (!this.audioContext) {
                    this.log('🔧 Initializing Audio System...');
                    await ensureBaseAudio();
                    this.audioContext = (window as any).audioContext;
                }
                
                // CompositionPlayerの初期化
                if (!this.compositionPlayer) {
                    this.log('🎼 Initializing CompositionPlayer...');
                    this.compositionPlayer = new CompositionPlayer(this.audioContext);
                    await this.compositionPlayer.initialize();
                }
                
                // セクション選択
                const sectionSelect = document.getElementById('section-select') as HTMLSelectElement;
                const selectedSection = sectionSelect?.value || undefined;
                
                if (this.state.isPaused) {
                    // Resume from pause
                    this.state.isPaused = false;
                    this.state.isPlaying = true;
                    this.compositionPlayer.resume();
                    this.log('⏯️ Resuming performance from pause');
                } else {
                    // Start new performance
                    this.state.isPlaying = true;
                    this.state.startTime = Date.now();
                    this.state.elapsedTime = 0;
                    
                    await this.compositionPlayer.play(selectedSection);
                    this.log('🚀 Starting new performance');
                    
                    if (selectedSection) {
                        this.log(`📍 Starting from section: ${selectedSection}`);
                    }
                }
                
                // 状態更新開始
                this.startStatusUpdater();
                this.updateStatusDisplay();
                
            } catch (error) {
                this.log(`❌ Error starting playback: ${error}`);
                console.error(error);
                this.state.isPlaying = false;
            }
        } else {
            this.log('⚠️ Performance is already playing');
        }
    }
    
    private handlePause(): void {
        this.log('⏸️ Pause button pressed');
        
        if (this.state.isPlaying && !this.state.isPaused) {
            this.state.isPaused = true;
            this.state.isPlaying = false;
            
            if (this.compositionPlayer) {
                this.compositionPlayer.pause();
            }
            
            this.log('⏸️ Performance paused');
            this.updateStatusDisplay();
        } else if (this.state.isPaused) {
            this.log('⚠️ Performance is already paused');
        } else {
            this.log('⚠️ Cannot pause - performance is not playing');
        }
    }
    
    private handleStop(): void {
        this.log('⏹️ Stop button pressed');
        
        if (this.state.isPlaying || this.state.isPaused) {
            this.state.isPlaying = false;
            this.state.isPaused = false;
            this.state.elapsedTime = 0;
            
            if (this.compositionPlayer) {
                this.compositionPlayer.stop();
            }
            
            this.log('⏹️ Performance stopped');
            this.updateStatusDisplay();
        } else {
            this.log('⚠️ Performance is not playing');
        }
    }
    
    /**
     * 状態更新（1秒ごと）
     */
    private startStatusUpdater(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = window.setInterval(() => {
            if (this.state.isPlaying && this.compositionPlayer) {
                const state = this.compositionPlayer.getState();
                
                // 現在のセクション表示
                const sectionElement = document.getElementById('current-section');
                if (sectionElement && state.currentSection) {
                    sectionElement.textContent = state.currentSection;
                }
                
                // 音楽的時間表示
                const timeElement = document.getElementById('musical-time');
                if (timeElement && state.musicalTime) {
                    const pos = state.musicalTime.position;
                    timeElement.textContent = `Bar ${pos.bar}, Beat ${pos.beat}`;
                }
                
                // テンポ表示
                const tempoElement = document.getElementById('current-tempo');
                if (tempoElement && state.musicalTime) {
                    tempoElement.textContent = `${state.musicalTime.currentTempo} BPM`;
                }
                
                this.updateStatusDisplay();
            }
        }, 1000);
    }
}
```

---

## 5. 実装ステップ

### Phase 1: 基本再生機能
- [x] `CompositionPlayer`クラス作成
- [ ] `performance.ts`への統合
- [ ] `performance.html`にセクション選択UI追加
- [ ] 基本的なPlay/Pause/Stop機能実装

### Phase 2: イベントシステム統合
- [ ] `MusicalTimeManager`との連携
- [ ] イベントスケジューリング実装
- [ ] BroadcastChannelでのイベント配信

### Phase 3: セクション制御
- [ ] セクション自動切り替え
- [ ] セクション選択からの再生開始
- [ ] シーク機能実装

### Phase 4: 状態表示
- [ ] リアルタイム状態更新
- [ ] 現在位置表示（Bar/Beat）
- [ ] テンポ表示

### Phase 5: Section A統合
- [ ] Section Aイベントの実装
- [ ] RandomPerformanceScheduler統合
- [ ] 音響処理システムとの連携

---

## 6. 必要な追加機能（MusicalTimeManager）

### 6.1 シーク機能

```typescript
// musicalTimeManager.ts に追加
seekToBar(bar: number, beat: number = 1): void {
    if (this.isPlaying) {
        console.warn('Cannot seek while playing');
        return;
    }
    
    this.currentBar = bar;
    this.currentBeat = beat;
    
    // 経過時間を計算
    // ... 実装
}
```

### 6.2 レジューム機能

```typescript
resume(): void {
    if (this.isPlaying) return;
    
    // 現在の音楽的位置を保持して再開
    this.startTime = this.audioContext.currentTime - this.getCurrentAbsoluteTime();
    this.isPlaying = true;
    
    console.log('▶️ Musical time resumed');
    this.scheduleNextEvents();
}
```

---

## 7. テスト計画

### 7.1 単体テスト
- [ ] CompositionPlayer初期化
- [ ] イベントスケジューリング
- [ ] セクション切り替えロジック

### 7.2 統合テスト
- [ ] Play→Pause→Play の動作
- [ ] セクション選択からの再生
- [ ] イベント配信の確認（BroadcastChannel）

### 7.3 実演テスト
- [ ] 全セクション通しての再生
- [ ] 各イベントタイプの動作確認
- [ ] Player画面との連携確認

---

## 8. 次のステップ

1. **CompositionPlayerの実装** - まずは基本構造を作成
2. **performance.tsへの統合** - Play/Pause/Stopボタンとの接続
3. **セクション選択UIの追加** - HTMLとスタイルの実装
4. **動作確認** - 基本的な再生機能のテスト

この計画で進めますか？それとも何か調整が必要でしょうか？
