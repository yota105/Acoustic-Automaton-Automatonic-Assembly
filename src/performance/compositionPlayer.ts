/**
 * CompositionPlayer - 作品全体の再生制御エンジン
 * 
 * composition.tsで定義された作品構造を読み込み、
 * MusicalTimeManagerと連携してイベントをスケジューリング・実行する。
 */

import { composition, Composition, CompositionEvent, Section } from '../works/composition';
import { initMusicalTimeManager } from '../audio/musicalTimeManager';
import { getControllerMessenger } from '../messaging/controllerMessenger';
import { RandomPerformanceScheduler } from './randomScheduler';
import { getGlobalSectionA } from '../engine/audio/synthesis/sectionAAudioSystem';
import type { PerformerTarget, TimingParameters } from './randomScheduler';

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
    private readonly messenger = getControllerMessenger();
    private randomScheduler: RandomPerformanceScheduler | null = null;
    private mimicryStartAudioTime: number | null = null;
    private notificationSettings: {
        leadTimeSeconds: number;
        countdownSeconds: number;
        scoreData?: any;
    } | null = null;
    private lastPrimeScoreData: Record<string, any> | null = null;
    private executedEventIds: Set<string> = new Set();
    private absoluteStartOffsetSeconds = 0;

    // Section A: 演奏者追跡（3人が1回ずつ演奏したら電子音）
    private sectionAPerformedIds: Set<string> = new Set();
    private sectionAFirstTonePlayed: boolean = false;

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
                this.broadcastPlaybackState('playing');
                return;
            }

            // 新規再生開始
            console.log('▶️ Starting playback...');
            this.executedEventIds.clear();
            this.absoluteStartOffsetSeconds = 0;

            let startPosition: { bar: number; beat: number } | null = null;
            let targetSection: Section | undefined;

            // セクション指定があれば該当セクションから開始
            if (sectionId) {
                this.currentSection = sectionId;
                targetSection = this.composition.sections.find(s => s.id === sectionId);
                startPosition = await this.seekToSection(sectionId);
                console.log(`📍 Starting from section: ${sectionId}`);
            } else {
                // 最初のセクションから開始
                targetSection = this.composition.sections[0];
                this.currentSection = targetSection?.id || null;
                console.log(`📍 Starting from first section: ${this.currentSection}`);
            }

            if (targetSection?.start.type === 'absolute') {
                this.absoluteStartOffsetSeconds = targetSection.start.time.seconds;
            }

            if (this.currentSection) {
                this.applyPreStartNotation(this.currentSection, startPosition ?? undefined, this.absoluteStartOffsetSeconds);
            }

            // MusicalTimeManager開始
            this.sectionElapsedOffset = 0;
            this.sectionStartTime = this.audioContext.currentTime;
            this.musicalTimeManager.start(startPosition ?? undefined);

            // イベントをスケジュール
            this.scheduleAllEvents();
            this.isPlaying = true;
            this.isPaused = false;

            // セクション開始イベントを発火
            if (this.currentSection) {
                this.onSectionChange(this.currentSection);
            }

            console.log(`✅ Playback started`);
            this.emit('state-change', this.getState());
            this.broadcastPlaybackState('playing');

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
        this.broadcastPlaybackState('paused');
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
        this.absoluteStartOffsetSeconds = 0;

        this.stopRandomPerformanceScheduler('composition player stopped');

        // スケジュール済みイベントをクリア
        this.clearScheduledEvents();
        this.executedEventIds.clear();

        this.emit('state-change', this.getState());
        this.broadcastPlaybackState('stopped');
        console.log('✅ Playback stopped');
    }

    /**
     * 指定セクションへシーク
     */
    private async seekToSection(sectionId: string): Promise<{ bar: number; beat: number } | null> {
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
                return { bar, beat };
            } else {
                console.warn('⚠️ MusicalTimeManager does not support seeking yet');
            }
        } else if (section.start.type === 'absolute') {
            console.warn('⚠️ Absolute time seeking not yet implemented');
        }

        return null;
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
        if (this.executedEventIds.has(event.id)) {
            console.log(`⏭️ Skipping schedule for already executed event: ${event.id}`);
            return;
        }

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
            const relativeSeconds = event.at.time.seconds - this.absoluteStartOffsetSeconds;
            if (relativeSeconds < 0) {
                console.log(`⏭️ Skipping past absolute event: ${event.id}`);
                return;
            }

            const scheduleTime = relativeSeconds * 1000;
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
        const elapsedSinceStart = this.audioContext.currentTime - (this.musicalTimeManager?.startTime || 0);
        const currentAbsoluteTime = this.absoluteStartOffsetSeconds + elapsedSinceStart;

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

        if (this.randomScheduler) {
            const sectionLabel = section?.name ?? sectionId;
            this.randomScheduler.updateSection(sectionId, sectionLabel);
        }

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
        if (this.executedEventIds.has(event.id)) {
            console.log(`🚫 Duplicate event execution prevented: ${event.id}`);
            return;
        }
        this.executedEventIds.add(event.id);

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

        const parameters = event.parameters ?? {};
        const broadcastTarget = event.target ?? 'performers';

        // Player画面向け（Now/Next 対応）の通知
        this.broadcastMessage({
            type: 'notation',
            target: broadcastTarget,
            data: {
                action: event.action,
                parameters,
                description: event.description
            },
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

        // 現在の音楽的時間を取得
        const musicalTime = this.musicalTimeManager ? {
            bar: this.musicalTimeManager.getCurrentBar?.() || 1,
            beat: this.musicalTimeManager.getCurrentBeat?.() || 1,
            tempo: this.musicalTimeManager.getCurrentTempo?.()?.bpm || 60
        } : { bar: 1, beat: 1, tempo: 60 };

        this.broadcastMessage({
            type: 'visual-event',
            eventId: event.id,
            action: event.action,
            parameters: event.parameters,
            target: event.target,
            // 時間同期用の情報
            audioContextTime: this.audioContext.currentTime,
            musicalTime: musicalTime,
            sectionId: this.currentSection,
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

        switch (event.action) {
            case 'initialize_section_a':
                console.log('🎬 Initializing Section A systems...');
                this.initializeSectionA(event);
                break;
            case 'prime_now_next_notifications':
                this.handleNotificationPriming(event);
                break;
            case 'start_random_performance_scheduler':
                this.startRandomPerformanceScheduler(event);
                break;
            case 'update_timing_parameters':
                this.updateRandomSchedulerTiming(event);
                break;
            case 'update_random_scheduler_score_strategy':
                this.updateRandomSchedulerScoreStrategy(event);
                break;
            case 'stop_random_performance_scheduler':
                this.stopRandomPerformanceScheduler('stop_random_performance_scheduler event');
                break;
            case 'enable_section_a_mimicry':
                this.mimicryStartAudioTime = this.audioContext.currentTime;
                console.log(`[CompositionPlayer] 🎯 Mimicry baseline set at audio time ${this.mimicryStartAudioTime.toFixed(2)}s`);
                this.enableSectionAMimicry(event);
                break;
            default:
                break;
        }

        // Broadcast system event for controller/visual UIs to react (e.g., countdown overlays)
        try {
            this.broadcastMessage({
                type: 'system-event',
                action: event.action,
                parameters: event.parameters,
                target: event.target,
                description: event.description,
                sectionId: this.currentSection,
                timestamp: Date.now()
            });
        } catch (err) {
            console.warn('[CompositionPlayer] Failed to broadcast system-event:', err);
        }

        this.emit('system-event', event);
    }

    /**
     * Section A 初期化
     */
    private async initializeSectionA(_event: CompositionEvent): Promise<void> {
        console.log('[CompositionPlayer] 🎬 Initializing Section A...');

        // Section A 固有の状態をリセット
        this.sectionAPerformedIds.clear();
        this.sectionAFirstTonePlayed = false;

        try {
            const sectionA = getGlobalSectionA();
            await sectionA.initialize();

            // セクション開始時刻を記録
            sectionA.startSection();

            console.log('[CompositionPlayer] ✅ Section A initialized - waiting for 3 performers to play');
        } catch (error) {
            console.error('[CompositionPlayer] ❌ Section A initialization failed:', error);
        }
    }

    /**
     * 演奏者が「Play now!」を受け取ったときに呼ばれる
     */
    private handlePerformerPlayNow(performerId: string): void {
        // Section A中のみ処理
        if (this.currentSection !== 'section_a_intro') {
            return;
        }

        // 初回トーン再生済みなら以降は処理しない
        if (this.sectionAFirstTonePlayed) {
            return;
        }

        // 演奏者を記録
        this.sectionAPerformedIds.add(performerId);
        console.log(`[CompositionPlayer] 🎵 Performer ${performerId} played (${this.sectionAPerformedIds.size}/3)`);

        // 3人全員が演奏したら電子音を鳴らす
        if (this.sectionAPerformedIds.size >= 3) {
            this.sectionAFirstTonePlayed = true;
            console.log('[CompositionPlayer] 🎵 All 3 performers have played! Playing first tone cue...');

            setTimeout(async () => {
                try {
                    const sectionA = getGlobalSectionA();
                    const phase = sectionA.getCurrentPhase();
                    await sectionA.playToneCue({
                        frequencyHz: 493.883, // B4
                        durationSeconds: 8,
                        level: 0.22,
                        phase
                    });

                    // 電子音再生後、演奏者の2回目以降のスケジュールを再開
                    if (this.randomScheduler) {
                        console.log('[CompositionPlayer] 🔄 Resuming performer scheduling after first tone');
                        this.randomScheduler.setPauseAfterFirstPerformance(false);
                    }
                } catch (error) {
                    console.error('[CompositionPlayer] Failed to play tone cue:', error);
                }
            }, 3000); // 3秒待ってから再生(カウントダウンと被らないように)
        }
    }

    /**
     * Section A Mimicry機能を有効化(グラニュラー引き伸ばし)
     */
    private enableSectionAMimicry(event: CompositionEvent): void {
        console.log('[CompositionPlayer] 🎵 Enabling Section A Mimicry (Granular Time-Stretch)...');

        const params = event.parameters || {};
        const evaluationIntervalSeconds = params.evaluationIntervalSeconds || 8;
        const maxSimultaneousVoices = params.maxSimultaneousVoices || 2;

        // 定期的に録音データを評価してグラニュラー再生
        const intervalId = setInterval(() => {
            this.evaluateAndPlayGranular(maxSimultaneousVoices);
        }, evaluationIntervalSeconds * 1000);

        // Section終了時にインターバルをクリア
        const cleanup = () => {
            clearInterval(intervalId);
            console.log('[CompositionPlayer] Mimicry evaluation interval cleared');
        };

        this.on('section-end', cleanup);
        this.on('stop', cleanup);

        console.log(`[CompositionPlayer] ✅ Mimicry enabled (check every ${evaluationIntervalSeconds}s, max ${maxSimultaneousVoices} voices)`);
    }

    /**
     * 録音データを評価してグラニュラー再生
     */
    private async evaluateAndPlayGranular(maxVoices: number): Promise<void> {
        try {
            const { getGlobalMicRecordingManager } = await import('../engine/audio/devices/micRecordingManager');
            const { getGlobalGranularPlayer } = await import('../engine/audio/devices/granularPlayer');
            const { sectionASettings } = await import('../works/acoustic-automaton/sectionsConfig');

            const recordingManager = getGlobalMicRecordingManager();
            const granularPlayer = getGlobalGranularPlayer();
            const sectionA = getGlobalSectionA();
            const mimicrySettings = sectionASettings.mimicry;
            const nowAudioTime = this.audioContext.currentTime;
            const baselineAudioTime = this.mimicryStartAudioTime ?? nowAudioTime;
            const recentWindow = mimicrySettings.recentRecordingWindowSeconds ?? 0;

            // 現在のアクティブなボイス数をチェック
            const currentVoices = granularPlayer.getActiveVoiceCount();
            if (currentVoices >= maxVoices) {
                console.log(`[CompositionPlayer] Max voices reached (${currentVoices}/${maxVoices}), skipping granular playback`);
                return;
            }

            // すべての録音を取得
            const stats = recordingManager.getStats();
            const allRecordings: any[] = [];

            for (const performerId of Object.keys(stats.recordingsByPerformer)) {
                const recordings = recordingManager.getRecordingsByPerformer(performerId);
                allRecordings.push(...recordings);
            }

            if (allRecordings.length === 0) {
                console.log('[CompositionPlayer] No recordings available for granular playback');
                return;
            }

            const eligibleRecordings = allRecordings
                .filter(rec => {
                    if (rec.recordedAt < baselineAudioTime) {
                        return false;
                    }
                    if (recentWindow > 0 && (nowAudioTime - rec.recordedAt) > recentWindow) {
                        return false;
                    }
                    return true;
                })
                .sort((a, b) => b.recordedAt - a.recordedAt);

            if (eligibleRecordings.length === 0) {
                console.log('[CompositionPlayer] No eligible recordings after mimicry baseline/window');
                return;
            }

            // ランダムに録音を選択
            const selectionPool = eligibleRecordings.slice(0, Math.min(4, eligibleRecordings.length));
            const randomRecording = selectionPool[Math.floor(Math.random() * selectionPool.length)];

            // グラニュラー設定を選択(ランダムに primary または textureAlternative)
            const useAlternative = Math.random() > 0.5;
            const settings = useAlternative
                ? sectionASettings.granular.textureAlternative
                : sectionASettings.granular.primary;

            // エフェクトバス(リバーブ経由)を出力先として取得
            const effectsBus = sectionA.getEffectsBus();

            // グラニュラー再生開始
            const voiceId = granularPlayer.playGranular(
                randomRecording,
                effectsBus,
                settings
            );

            console.log(`[CompositionPlayer] 🌊 Granular voice started: ${voiceId}`);
            console.log(`  Source: ${randomRecording.performerId}, duration: ${randomRecording.duration.toFixed(2)}s`);
            console.log(`  Recorded at (audio time): ${randomRecording.recordedAt.toFixed(2)}s (baseline ${baselineAudioTime.toFixed(2)}s, now ${nowAudioTime.toFixed(2)}s)`);
            console.log(`  Settings: ${useAlternative ? 'textureAlternative' : 'primary'}`);

        } catch (error) {
            console.error('[CompositionPlayer] Failed to play granular:', error);
        }
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
     * 再生状態をビジュアルに通知
     */
    private broadcastPlaybackState(state: 'playing' | 'paused' | 'stopped'): void {
        console.log(`📡 Broadcasting playback state: ${state}`);

        // 現在の音楽的時間を取得
        const musicalTime = this.musicalTimeManager ? {
            bar: this.musicalTimeManager.getCurrentBar?.() || 1,
            beat: this.musicalTimeManager.getCurrentBeat?.() || 1,
            tempo: this.musicalTimeManager.getCurrentTempo?.()?.bpm || 60
        } : { bar: 1, beat: 1, tempo: 60 };

        this.broadcastMessage({
            type: 'playback-state',
            state: state,
            audioContextTime: this.audioContext.currentTime,
            musicalTime: musicalTime,
            sectionId: this.currentSection,
            timestamp: Date.now()
        });
    }

    private applyPreStartNotation(
        sectionId: string,
        startPosition?: { bar: number; beat: number },
        absoluteOffsetSeconds: number = 0
    ): void {
        const section = this.composition.sections.find(s => s.id === sectionId);
        if (!section) {
            return;
        }

        for (const event of section.events) {
            if (event.type !== 'notation') {
                continue;
            }

            const parameters = event.parameters ?? {};
            const target = parameters.target ?? parameters?.data?.target;
            if (target !== 'next') {
                continue;
            }

            let shouldExecute = false;

            if (event.at.type === 'musical') {
                if (!startPosition) {
                    continue;
                }
                const eventBar = event.at.time.bar;
                const eventBeat = event.at.time.beat || 1;
                if (eventBar < startPosition.bar || (eventBar === startPosition.bar && eventBeat <= startPosition.beat)) {
                    shouldExecute = true;
                }
            } else if (event.at.type === 'absolute') {
                const eventSeconds = event.at.time.seconds;
                if (eventSeconds <= absoluteOffsetSeconds) {
                    shouldExecute = true;
                }
            }

            if (shouldExecute) {
                console.log(`⏩ Priming skipped notation event: ${event.id}`);
                this.executeEvent(event);
            }
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

    private handleNotificationPriming(event: CompositionEvent): void {
        const params = event.parameters ?? {};
        const leadTimeSeconds = Number.isFinite(params.leadTimeSeconds)
            ? Number(params.leadTimeSeconds)
            : this.notificationSettings?.leadTimeSeconds ?? 1;
        const countdownSeconds = Number.isFinite(params.countdownSeconds)
            ? Number(params.countdownSeconds)
            : leadTimeSeconds;

        const scoreData = params.scoreData ? this.cloneScoreData(params.scoreData) : null;
        const perPerformerScoreData = Object.prototype.hasOwnProperty.call(params, 'perPerformerScoreData')
            ? (params.perPerformerScoreData ? this.cloneScoreData(params.perPerformerScoreData) : null)
            : undefined;
        const changedKeys = this.computeChangedPerformerKeys(scoreData);

        this.notificationSettings = {
            leadTimeSeconds,
            countdownSeconds,
            scoreData: scoreData ?? this.notificationSettings?.scoreData,
        };

        if (this.randomScheduler) {
            if (scoreData) {
                this.randomScheduler.updateScoreData(scoreData);
            } else if (scoreData === null && Object.prototype.hasOwnProperty.call(params, 'scoreData')) {
                this.randomScheduler.updateScoreData(null);
            }

            if (perPerformerScoreData !== undefined) {
                this.randomScheduler.updatePerPerformerScoreData(perPerformerScoreData);
            }
        }

        const shouldBroadcast = params.broadcastCountdown !== false;
        if (shouldBroadcast) {
            this.dispatchPrimeCountdowns(event, scoreData, changedKeys, leadTimeSeconds, countdownSeconds);
        }

        this.lastPrimeScoreData = scoreData ?? this.lastPrimeScoreData;

        console.log('[CompositionPlayer] Notification settings primed', this.notificationSettings);
    }

    private cloneScoreData<T>(scoreData: T): T {
        try {
            return JSON.parse(JSON.stringify(scoreData));
        } catch (error) {
            console.warn('[CompositionPlayer] Failed to clone score data, using shallow copy', error);
            if (Array.isArray(scoreData)) {
                return [...scoreData] as unknown as T;
            }
            if (scoreData && typeof scoreData === 'object') {
                return { ...(scoreData as Record<string, any>) } as T;
            }
            return scoreData;
        }
    }

    private pickRandomFrom<T>(pool: readonly T[]): T {
        if (!pool.length) {
            throw new Error('[CompositionPlayer] pickRandomFrom called with empty pool');
        }
        const index = Math.floor(Math.random() * pool.length);
        return pool[index];
    }

    private buildDynamicScoreStrategy(params: any, fallbackScoreData: any): {
        sharedScoreData?: any;
        perPerformerScoreData?: Record<string, any> | null;
        scoreGenerator?: (performer: PerformerTarget) => any;
    } {
        const strategy: {
            sharedScoreData?: any;
            perPerformerScoreData?: Record<string, any> | null;
            scoreGenerator?: (performer: PerformerTarget) => any;
        } = {};

        if (Object.prototype.hasOwnProperty.call(params, 'scoreData')) {
            strategy.sharedScoreData = params.scoreData ? this.cloneScoreData(params.scoreData) : null;
        } else if (fallbackScoreData !== undefined) {
            strategy.sharedScoreData = fallbackScoreData;
        }

        if (Object.prototype.hasOwnProperty.call(params, 'perPerformerScoreData')) {
            strategy.perPerformerScoreData = params.perPerformerScoreData
                ? this.cloneScoreData(params.perPerformerScoreData)
                : null;
        }

        if (params.dynamicScore === null) {
            strategy.scoreGenerator = undefined;
        } else if (params.dynamicScore) {
            const normalized = this.normalizeDynamicScoreConfig(params.dynamicScore);
            strategy.scoreGenerator = (performer: PerformerTarget) => {
                const entry = normalized[performer.performerId];
                if (!entry) {
                    return null;
                }

                const payload = this.cloneScoreData(entry.base);
                if (entry.notePool.length) {
                    payload.notes = this.pickRandomFrom(entry.notePool);
                }
                return payload;
            };
        }

        return strategy;
    }

    private normalizeDynamicScoreConfig(rawConfig: Record<string, any>): Record<string, { base: any; notePool: string[] }> {
        const result: Record<string, { base: any; notePool: string[] }> = {};

        for (const [performerId, definition] of Object.entries(rawConfig ?? {})) {
            if (!definition || typeof definition !== 'object') {
                continue;
            }

            const notePoolRaw = Array.isArray((definition as any).notePool)
                ? (definition as any).notePool
                : [];
            const notePool = notePoolRaw
                .map((value: any) => String(value))
                .filter((value: string) => Boolean(value));

            const sanitized = { ...(definition as Record<string, any>) };
            delete sanitized.notePool;

            if (!notePool.length && !sanitized.notes) {
                continue;
            }

            result[performerId] = {
                base: this.cloneScoreData(sanitized),
                notePool,
            };
        }

        return result;
    }

    private computeChangedPerformerKeys(nextScoreData: Record<string, any> | null): string[] {
        if (!nextScoreData) {
            return [];
        }

        if (!this.lastPrimeScoreData) {
            return Object.keys(nextScoreData);
        }

        const changed: string[] = [];
        for (const key of Object.keys(nextScoreData)) {
            const nextValue = nextScoreData[key];
            const prevValue = this.lastPrimeScoreData[key];

            if (prevValue === undefined) {
                changed.push(key);
                continue;
            }

            const nextSerialized = JSON.stringify(nextValue);
            const prevSerialized = JSON.stringify(prevValue);
            if (nextSerialized !== prevSerialized) {
                changed.push(key);
            }
        }

        return changed;
    }

    private dispatchPrimeCountdowns(
        event: CompositionEvent,
        scoreData: Record<string, any> | null,
        changedKeys: string[],
        leadTimeSeconds: number,
        countdownSeconds: number,
    ): void {
        const params = event.parameters ?? {};
        const resolvedScoreData = scoreData ?? this.lastPrimeScoreData;
        const performerKeys = changedKeys.length
            ? changedKeys
            : resolvedScoreData
                ? Object.keys(resolvedScoreData)
                : (this.composition.performers ?? []).map(p => p.id);

        if (!performerKeys.length) {
            return;
        }

        const baseCountdown = Number.isFinite(countdownSeconds) && countdownSeconds > 0
            ? countdownSeconds
            : (Number.isFinite(leadTimeSeconds) && leadTimeSeconds > 0 ? leadTimeSeconds : 1);

        const staggerSeconds = Number.isFinite(params.countdownStaggerSeconds)
            ? Math.max(0, Number(params.countdownStaggerSeconds))
            : 0;

        const description = event.description ?? event.label ?? 'Prepare for next cue';

        performerKeys.forEach((performerKey, index) => {
            const playerNumber = this.extractPlayerNumber(performerKey);
            if (!playerNumber) {
                console.warn('[CompositionPlayer] Unable to resolve player number for countdown target', performerKey);
                return;
            }

            const extraDelay = staggerSeconds * index;
            const secondsRemaining = Math.max(0.1, baseCountdown + extraDelay);

            this.messenger.send({
                type: 'countdown',
                target: playerNumber,
                data: {
                    secondsRemaining,
                    message: description,
                    sectionId: this.currentSection,
                    performerId: performerKey,
                    scoreData: resolvedScoreData ? { [performerKey]: resolvedScoreData[performerKey] } : undefined,
                },
            });
        });
    }

    private startRandomPerformanceScheduler(event: CompositionEvent): void {
        const params = event.parameters ?? {};
        const performerIds = Array.isArray(params.performers) ? params.performers : [];
        const targets = this.mapPerformerTargets(performerIds);

        if (!targets.length) {
            console.warn('[CompositionPlayer] No performer targets resolved for random scheduler', performerIds);
            return;
        }

        const baseTiming = this.normalizeTimingParameters(params.initialTiming, {
            minInterval: 4000,
            maxInterval: 7000,
            distribution: 'uniform',
        });

        const leadTimeSeconds = Number.isFinite(params.notificationLeadTime)
            ? Number(params.notificationLeadTime)
            : this.notificationSettings?.leadTimeSeconds ?? 1;

        const countdownSeconds = Number.isFinite(params.countdownSeconds)
            ? Number(params.countdownSeconds)
            : this.notificationSettings?.countdownSeconds ?? leadTimeSeconds;

        const scoreData = params.scoreData
            ? this.cloneScoreData(params.scoreData)
            : this.notificationSettings?.scoreData
                ? this.cloneScoreData(this.notificationSettings.scoreData)
                : null;

        const scoreStrategy = this.buildDynamicScoreStrategy(params, scoreData);

        const sectionLabel = this.currentSection
            ? (this.composition.sections.find(sec => sec.id === this.currentSection)?.name ?? this.currentSection)
            : null;

        const blockWindows = Array.isArray(params.blockWindows)
            ? params.blockWindows
                .map((window: any) => ({
                    startSeconds: Number(window?.startSeconds),
                    endSeconds: Number(window?.endSeconds),
                }))
                .filter((window) => Number.isFinite(window.startSeconds) && Number.isFinite(window.endSeconds))
            : undefined;

        this.randomScheduler?.stop('restarting with new configuration');

        this.randomScheduler = new RandomPerformanceScheduler({
            messenger: this.messenger,
            performers: targets,
            timing: baseTiming,
            leadTimeSeconds,
            countdownSeconds,
            sectionId: this.currentSection,
            sectionName: sectionLabel,
            scoreData: scoreStrategy.sharedScoreData ?? scoreData ?? null,
            perPerformerScoreData: scoreStrategy.perPerformerScoreData ?? null,
            scoreGenerator: scoreStrategy.scoreGenerator,
            blockWindows,
            onPerformanceTriggered: (performerId) => this.handlePerformerPlayNow(performerId),
        });

        // Section Aの場合、初回演奏後に一時停止モードを有効化
        // ただし、初回トーンが既に再生済みの場合は有効化しない
        if (this.currentSection === 'section_a_intro' && !this.sectionAFirstTonePlayed) {
            console.log('[CompositionPlayer] Enabling pause-after-first-performance mode for Section A');
            this.randomScheduler.setPauseAfterFirstPerformance(true);
        }

        this.randomScheduler.start();
    }

    private updateRandomSchedulerTiming(event: CompositionEvent): void {
        if (!this.randomScheduler) {
            return;
        }

        const params = event.parameters ?? {};
        const current = this.randomScheduler.getTiming();

        const nextTiming: TimingParameters = {
            minInterval: Number.isFinite(params.minInterval) ? Number(params.minInterval) : current.minInterval,
            maxInterval: Number.isFinite(params.maxInterval) ? Number(params.maxInterval) : current.maxInterval,
            distribution: (params.distribution ?? current.distribution) as TimingParameters['distribution'],
        };

        this.randomScheduler.updateTiming(nextTiming);
    }

    private updateRandomSchedulerScoreStrategy(event: CompositionEvent): void {
        if (!this.randomScheduler) {
            console.warn('[CompositionPlayer] No active random scheduler to update score strategy');
            return;
        }

        const params = event.parameters ?? {};
        const strategy = this.buildDynamicScoreStrategy(params, undefined);

        const nextOptions: {
            sharedScoreData?: any;
            perPerformerScoreData?: Record<string, any> | null;
            scoreGenerator?: (performer: PerformerTarget) => any;
        } = {};

        if (strategy.sharedScoreData !== undefined) {
            nextOptions.sharedScoreData = strategy.sharedScoreData;
        }

        if (strategy.perPerformerScoreData !== undefined) {
            nextOptions.perPerformerScoreData = strategy.perPerformerScoreData ?? null;
        }

        if (Object.prototype.hasOwnProperty.call(params, 'dynamicScore')) {
            nextOptions.scoreGenerator = strategy.scoreGenerator;
        }

        this.randomScheduler.updateDynamicScoreStrategy(nextOptions);
    }

    private stopRandomPerformanceScheduler(reason: string): void {
        if (!this.randomScheduler) {
            return;
        }

        this.randomScheduler.stop(reason);
        this.randomScheduler = null;
    }

    private normalizeTimingParameters(raw: any, fallback: TimingParameters): TimingParameters {
        if (!raw || typeof raw !== 'object') {
            return { ...fallback };
        }

        const min = Number(raw.minInterval);
        const max = Number(raw.maxInterval);
        const distribution = (raw.distribution ?? fallback.distribution) as TimingParameters['distribution'];

        const resolvedMin = Number.isFinite(min) ? min : fallback.minInterval;
        const resolvedMax = Number.isFinite(max) ? Math.max(resolvedMin, max) : Math.max(resolvedMin, fallback.maxInterval);

        return {
            minInterval: resolvedMin,
            maxInterval: resolvedMax,
            distribution,
        };
    }

    private mapPerformerTargets(ids: readonly string[]): PerformerTarget[] {
        const performersMeta = this.composition.performers ?? [];
        const sourceIds = ids.length ? ids : performersMeta.map(p => p.id);
        const seen = new Set<string>();
        const targets: PerformerTarget[] = [];

        for (const performerId of sourceIds) {
            if (!performerId || seen.has(performerId)) {
                continue;
            }
            seen.add(performerId);

            const playerNumber = this.extractPlayerNumber(performerId);
            if (!playerNumber) {
                console.warn('[CompositionPlayer] Unable to resolve player number for performer id', performerId);
                continue;
            }

            const meta = performersMeta.find(p => p.id === performerId);
            targets.push({
                performerId,
                playerNumber,
                label: meta?.name ?? meta?.instrument ?? performerId,
            });
        }

        return targets;
    }

    private extractPlayerNumber(performerId: string): string | null {
        if (!performerId) {
            return null;
        }

        const direct = performerId.match(/player?(\d+)/i);
        if (direct && direct[1]) {
            return direct[1];
        }

        if (/^\d+$/.test(performerId)) {
            return performerId;
        }

        return null;
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
