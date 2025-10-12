/**
 * CompositionPlayer - 作品全体の再生制御エンジン
 * 
 * composition.tsで定義された作品構造を読み込み、
 * MusicalTimeManagerと連携してイベントをスケジューリング・実行する。
 */

import { composition, Composition, CompositionEvent, Section } from '../works/composition';
import { initMusicalTimeManager } from '../audio/musicalTimeManager';

interface PlayerState {
    isPlaying: boolean;
    currentSection: string | null;
    currentBar: number;
    currentBeat: number;
    currentTempo: number;
    sectionElapsedTime: number;  // セクション開始からの経過時間（秒）
}

export class CompositionPlayer {
    private composition: Composition;
    private musicalTimeManager: any;
    private currentSection: string | null = null;
    private sectionStartTime: number | null = null;  // 現在再生中セグメントの開始時刻（AudioContext時間）
    private sectionElapsedOffset: number = 0;        // 一時停止などで蓄積された経過時間
    private scheduledEvents: Map<string, number> = new Map();
    private isPlaying: boolean = false;
    private isPaused: boolean = false;
    private eventListeners: Map<string, Function[]> = new Map();

    constructor(private audioContext: AudioContext) {
        this.composition = composition;
    }

    /**
     * 初期化
     */
    async initialize(): Promise<void> {
        console.log('🎼 Initializing CompositionPlayer...');

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
        console.log(`📚 Composition: ${this.composition.sections.length} sections loaded`);
    }

    /**
     * 再生開始
     */
    async play(sectionId?: string): Promise<void> {
        if (this.isPlaying && !this.isPaused) {
            console.warn('⚠️ Already playing');
            return;
        }

        try {
            // 一時停止からの再開
            if (this.isPaused) {
                console.log('⏯️ Resuming playback...');
                this.sectionStartTime = this.audioContext.currentTime;
                this.musicalTimeManager.resume();
                this.isPlaying = true;
                this.isPaused = false;
                this.emit('state-change', this.getState());
                return;
            }

            // 新規再生開始
            console.log('▶️ Starting playback...');

            // セクション指定があれば該当セクションから開始
            if (sectionId) {
                this.currentSection = sectionId;
                await this.seekToSection(sectionId);
                console.log(`📍 Starting from section: ${sectionId}`);
            } else {
                // 最初のセクションから開始
                this.currentSection = this.composition.sections[0]?.id || null;
                console.log(`📍 Starting from first section: ${this.currentSection}`);
            }

            // イベントをスケジュール
            this.scheduleAllEvents();

            // MusicalTimeManager開始
            this.sectionElapsedOffset = 0;
            this.sectionStartTime = this.audioContext.currentTime;
            this.musicalTimeManager.start();
            this.isPlaying = true;
            this.isPaused = false;

            // セクション開始イベントを発火
            if (this.currentSection) {
                this.onSectionChange(this.currentSection);
            }

            console.log(`✅ Playback started`);
            this.emit('state-change', this.getState());

        } catch (error) {
            console.error('❌ Error starting playback:', error);
            this.isPlaying = false;
            throw error;
        }
    }

    /**
     * 一時停止
     */
    pause(): void {
        if (!this.isPlaying || this.isPaused) {
            console.warn('⚠️ Cannot pause - not currently playing');
            return;
        }

        console.log('⏸️ Pausing playback...');
        if (this.sectionStartTime !== null) {
            this.sectionElapsedOffset += this.audioContext.currentTime - this.sectionStartTime;
        }
        this.musicalTimeManager.pause();
        this.isPlaying = false;
        this.isPaused = true;
        this.sectionStartTime = null;

        this.emit('state-change', this.getState());
        console.log('✅ Playback paused');
    }

    /**
     * 停止
     */
    stop(): void {
        if (!this.isPlaying && !this.isPaused) {
            console.warn('⚠️ Already stopped');
            return;
        }

        console.log('⏹️ Stopping playback...');
        this.musicalTimeManager.stop();
        this.isPlaying = false;
        this.isPaused = false;
        this.currentSection = null;
        this.sectionStartTime = null;
        this.sectionElapsedOffset = 0;

        // スケジュール済みイベントをクリア
        this.clearScheduledEvents();

        this.emit('state-change', this.getState());
        console.log('✅ Playback stopped');
    }

    /**
     * 指定セクションへシーク
     */
    private async seekToSection(sectionId: string): Promise<void> {
        const section = this.composition.sections.find(s => s.id === sectionId);
        if (!section) {
            throw new Error(`❌ Section not found: ${sectionId}`);
        }

        console.log(`🎯 Seeking to section: ${sectionId}`);

        // セクション開始位置にシーク
        if (section.start.type === 'musical') {
            const bar = section.start.time.bar;
            const beat = section.start.time.beat || 1;

            // MusicalTimeManagerにシーク機能があればそれを使用
            if (this.musicalTimeManager.seekToBar) {
                this.musicalTimeManager.seekToBar(bar, beat);
                console.log(`✅ Seeked to Bar ${bar}, Beat ${beat}`);
            } else {
                console.warn('⚠️ MusicalTimeManager does not support seeking yet');
            }
        } else if (section.start.type === 'absolute') {
            console.warn('⚠️ Absolute time seeking not yet implemented');
        }
    }

    /**
     * 全イベントをスケジュール
     */
    private scheduleAllEvents(): void {
        console.log('📅 Scheduling events...');

        // 現在のセクションから開始
        const currentSectionIndex = this.composition.sections.findIndex(
            s => s.id === this.currentSection
        );

        if (currentSectionIndex === -1) {
            console.warn('⚠️ Current section not found in composition');
            return;
        }

        let eventCount = 0;

        // 現在以降のセクションのイベントをスケジュール
        for (let i = currentSectionIndex; i < this.composition.sections.length; i++) {
            const section = this.composition.sections[i];

            for (const event of section.events) {
                this.scheduleEvent(event);
                eventCount++;
            }
        }

        // グローバルイベントもスケジュール
        if (this.composition.globalEvents) {
            for (const event of this.composition.globalEvents) {
                this.scheduleEvent(event);
                eventCount++;
            }
        }

        console.log(`✅ Scheduled ${eventCount} events`);
    }

    /**
     * 個別イベントをスケジュール
     */
    private scheduleEvent(event: CompositionEvent): void {
        if (event.at.type === 'musical') {
            // 音楽的時間でスケジュール
            // MusicalTimeManagerのscheduleEvent機能を使用
            if (this.musicalTimeManager.scheduleEvent) {
                this.musicalTimeManager.scheduleEvent({
                    id: event.id,
                    time: event.at.time,
                    callback: () => this.executeEvent(event)
                });
            } else {
                // フォールバック: 拍ごとにチェック
                console.warn('⚠️ MusicalTimeManager.scheduleEvent not available, using beat-based checking');
            }
        } else if (event.at.type === 'absolute') {
            // 絶対時間でスケジュール
            const scheduleTime = event.at.time.seconds * 1000;
            const timeoutId = window.setTimeout(() => {
                this.executeEvent(event);
            }, scheduleTime);

            this.scheduledEvents.set(event.id, timeoutId);
        }
    }

    /**
     * スケジュール済みイベントをクリア
     */
    private clearScheduledEvents(): void {
        for (const timeoutId of this.scheduledEvents.values()) {
            window.clearTimeout(timeoutId);
        }
        this.scheduledEvents.clear();
        console.log('🗑️ Cleared scheduled events');
    }

    /**
     * 拍ごとのコールバック
     */
    private handleBeat(bar: number, beat: number): void {
        // 現在位置を更新して配信
        this.emit('beat', { bar, beat });

        // セクション境界チェック
        this.checkSectionBoundary(bar, beat);

        // イベント実行チェック（scheduleEvent未対応の場合のフォールバック）
        this.checkEventExecution(bar, beat);
    }

    /**
     * セクション境界チェック
     */
    private checkSectionBoundary(bar: number, beat: number): void {
        // 絶対時間ベースのセクション境界もチェック
        const currentAbsoluteTime = this.audioContext.currentTime - (this.musicalTimeManager?.startTime || 0);

        for (const section of this.composition.sections) {
            // 音楽的時間でのチェック
            if (section.start.type === 'musical') {
                const startBar = section.start.time.bar;
                const startBeat = section.start.time.beat || 1;

                if (bar === startBar && beat === startBeat && section.id !== this.currentSection) {
                    this.onSectionChange(section.id);
                    return;
                }
            }

            // 絶対時間でのチェック
            if (section.start.type === 'absolute') {
                const startSeconds = section.start.time.seconds;
                const endSeconds = section.end?.type === 'absolute' ? section.end.time.seconds : Infinity;

                // 現在時刻がこのセクションの範囲内で、まだこのセクションに切り替わっていない場合
                if (currentAbsoluteTime >= startSeconds &&
                    currentAbsoluteTime < endSeconds &&
                    section.id !== this.currentSection) {
                    this.onSectionChange(section.id);
                    return;
                }
            }
        }
    }

    /**
     * イベント実行チェック（拍ベース）
     */
    private checkEventExecution(bar: number, beat: number): void {
        // 現在のセクションのイベントをチェック
        const currentSection = this.composition.sections.find(s => s.id === this.currentSection);
        if (!currentSection) return;

        for (const event of currentSection.events) {
            if (event.at.type === 'musical') {
                const eventBar = event.at.time.bar;
                const eventBeat = event.at.time.beat || 1;

                if (bar === eventBar && beat === eventBeat) {
                    this.executeEvent(event);
                }
            }
        }
    }

    /**
     * セクション変更時
     */
    private onSectionChange(sectionId: string): void {
        console.log(`🎬 Section changed: ${sectionId}`);

        const previousSection = this.currentSection;
        this.currentSection = sectionId;

        // セクション開始時刻を記録
        this.sectionElapsedOffset = 0;
        this.sectionStartTime = this.audioContext.currentTime;
        console.log(`⏱️ Section start time recorded: ${this.sectionStartTime.toFixed(2)}s`);

        // セクション情報を取得
        const section = this.composition.sections.find(s => s.id === sectionId);

        // イベント配信
        this.emit('section-change', {
            sectionId,
            previousSection,
            section
        });

        // BroadcastChannelで他のウィンドウに通知
        this.broadcastMessage({
            type: 'section-change',
            sectionId: sectionId,
            timestamp: Date.now()
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
            default:
                console.warn(`⚠️ Unknown event type: ${event.type}`);
        }

        // イベント実行を配信
        this.emit('event-executed', event);
    }

    /**
     * オーディオイベント実行
     */
    private executeAudioEvent(event: CompositionEvent): void {
        console.log(`🔊 Audio event: ${event.action}`, event.parameters);

        // BroadcastChannelで配信
        this.broadcastMessage({
            type: 'audio-event',
            action: event.action,
            parameters: event.parameters,
            target: event.target,
            description: event.description,
            timestamp: Date.now()
        });
    }

    /**
     * 楽譜表示イベント実行
     */
    private executeNotationEvent(event: CompositionEvent): void {
        console.log(`🎼 Notation event: ${event.action}`, event.parameters);

        // BroadcastChannelでPlayer画面に送信
        this.broadcastMessage({
            type: 'update-score',
            scoreData: event.parameters,
            target: event.target,
            description: event.description,
            timestamp: Date.now()
        });
    }

    /**
     * キューイベント実行
     */
    private executeCueEvent(event: CompositionEvent): void {
        const message = event.parameters?.message || event.description || 'Cue';
        console.log(`📢 Cue event: ${message}`);

        this.broadcastMessage({
            type: 'cue',
            message: message,
            target: event.target,
            priority: event.parameters?.priority || 'normal',
            timestamp: Date.now()
        });
    }

    /**
     * ビジュアルイベント実行
     */
    private executeVisualEvent(event: CompositionEvent): void {
        console.log(`👁️ Visual event: ${event.action}`, event.parameters);

        this.broadcastMessage({
            type: 'visual-event',
            action: event.action,
            parameters: event.parameters,
            target: event.target,
            timestamp: Date.now()
        });
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

            this.emit('tempo-change', { bpm: newBpm });
        }
    }

    /**
     * システムイベント実行
     */
    private executeSystemEvent(event: CompositionEvent): void {
        console.log(`⚙️ System event: ${event.action}`, event.parameters);

        // Section A特有のシステムイベント
        if (event.action === 'initialize_section_a') {
            console.log('🎬 Initializing Section A systems...');
            // TODO: Section A初期化処理
        } else if (event.action === 'start_random_performance_scheduler') {
            console.log('🎲 Starting random performance scheduler...');
            // TODO: ランダム演奏スケジューラー開始
        }

        this.emit('system-event', event);
    }

    /**
     * BroadcastChannelでメッセージ配信
     */
    private broadcastMessage(message: any): void {
        try {
            const channel = new BroadcastChannel('performance-control');
            channel.postMessage(message);
            channel.close();
        } catch (error) {
            console.error('❌ Error broadcasting message:', error);
        }
    }

    /**
     * イベントリスナー登録
     */
    on(eventName: string, callback: Function): void {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName)!.push(callback);
    }

    /**
     * イベント発火
     */
    private emit(eventName: string, data?: any): void {
        const listeners = this.eventListeners.get(eventName);
        if (listeners) {
            for (const callback of listeners) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`❌ Error in event listener (${eventName}):`, error);
                }
            }
        }
    }

    /**
     * 現在の状態取得
     */
    getState(): PlayerState {
        const musicalTimeStatus = this.musicalTimeManager?.getStatus?.();

        // セクション開始からの経過時間を計算
        let sectionElapsed = this.sectionElapsedOffset;
        if (this.sectionStartTime !== null) {
            sectionElapsed += this.audioContext.currentTime - this.sectionStartTime;
        }

        return {
            isPlaying: this.isPlaying,
            currentSection: this.currentSection,
            currentBar: musicalTimeStatus?.position?.bar || 1,
            currentBeat: musicalTimeStatus?.position?.beat || 1,
            currentTempo: musicalTimeStatus?.currentTempo || this.composition.initialTempo.bpm,
            sectionElapsedTime: sectionElapsed
        };
    }

    /**
     * 作品情報取得
     */
    getComposition(): Composition {
        return this.composition;
    }

    /**
     * セクション一覧取得
     */
    getSections(): Section[] {
        return this.composition.sections;
    }
}
