/**
 * VisualSyncManager - ビジュアルと音響の時間同期管理
 * 
 * 責務:
 * - BroadcastChannelから再生状態・ビジュアルイベントを受信
 * - AudioContext時間との同期を管理
 * - フレーム間の時間補間
 * - p5.js / Three.js ビジュアライザーへの制御コマンド発行
 */

import type { P5Visualizer } from './p5Visualizer';
import type { ThreeJSVisualizer } from './threeJSVisualizer';

/**
 * 受信するメッセージの型定義
 */
interface PlaybackStateMessage {
    type: 'playback-state';
    state: 'playing' | 'paused' | 'stopped';
    audioContextTime: number;
    musicalTime: {
        bar: number;
        beat: number;
        tempo: number;
    };
    sectionId: string | null;
    timestamp: number;
}

interface VisualEventMessage {
    type: 'visual-event';
    eventId: string;
    action: string;
    parameters?: Record<string, any>;
    target?: any;
    audioContextTime: number;
    musicalTime: {
        bar: number;
        beat: number;
        tempo: number;
    };
    sectionId: string | null;
    timestamp: number;
}

interface VisualEnableMessage {
    type: 'visual-enable';
    enabled: boolean;
    timestamp: number;
}

interface DisplayModeMessage {
    type: 'display-mode';
    mode: 'fullscreen' | 'preview';
    timestamp: number;
}

interface ParticleCountMessage {
    type: 'particle-count';
    count: number;
    timestamp: number;
}

interface ShowCoordinatesMessage {
    type: 'show-coordinates';
    show: boolean;
    timestamp: number;
}

interface CoordinateDisplayModeMessage {
    type: 'coordinate-display-mode';
    mode: 'panel' | 'inline';
    timestamp: number;
}

interface AttractionStrengthMessage {
    type: 'attraction-strength';
    multiplier: number;
    timestamp: number;
}

interface InvertColorsMessage {
    type: 'invert-colors';
    invert: boolean;
    timestamp: number;
}

interface CountdownPayload {
    secondsRemaining?: number;
    message?: string;
    sectionId?: string | null;
    sectionName?: string | null;
    performerId?: string;
    scoreData?: any;
}

interface CountdownMessage {
    type: 'countdown';
    data?: CountdownPayload;
    target?: any;
    timestamp: number;
}

type SyncMessage = PlaybackStateMessage | VisualEventMessage | VisualEnableMessage | DisplayModeMessage | ParticleCountMessage | ShowCoordinatesMessage | CoordinateDisplayModeMessage | AttractionStrengthMessage | InvertColorsMessage | CountdownMessage;

/**
 * ビジュアルタイミングログ（デバッグ用）
 */
interface VisualTimingLog {
    eventId: string;
    scheduledAudioTime: number;
    actualReceiveTime: number;
    actualRenderTime: number;
    latencyMs: number;
}

interface PerformerPulseContext {
    performerId?: string;
    sectionId?: string | null;
    sectionName?: string | null;
}

/**
 * VisualSyncManager
 */
export class VisualSyncManager {
    private channel: BroadcastChannel;

    // 時間同期
    private audioContextTime: number = 0;
    private lastSyncTimestamp: number = 0;

    // 再生状態
    private isEnabled: boolean = true; // 初期状態で有効化
    private isPlaying: boolean = false;

    // 音楽的時間
    private currentBar: number = 1;
    private currentBeat: number = 1;
    private currentTempo: number = 60;

    // ビジュアライザー参照
    private p5Visualizer: P5Visualizer | null = null;
    private threeVisualizer: ThreeJSVisualizer | null = null;

    // ディスプレイモード
    private currentDisplayMode: 'fullscreen' | 'preview' = 'fullscreen';

    // デバッグ用
    private timingLogs: VisualTimingLog[] = [];
    private maxLogs: number = 100;
    private eventCount: number = 0;
    private performerColors: Record<string, number> = {
        player1: 0x4caf50,
        player2: 0x2196f3,
        player3: 0xff9800
    };
    private lastPerformerPulseAt: Map<string, number> = new Map();
    private performerPulseCooldownMs = 180;

    constructor() {
        this.channel = new BroadcastChannel('performance-control');
        this.setupEventListeners();
        this.setupWindowResizeListener();
        this.lastSyncTimestamp = performance.now();

        console.log('[VISUAL_SYNC_MANAGER] Initialized');

        // 初期化後にウィンドウサイズにリサイズ（フルスクリーンモードがデフォルト）
        setTimeout(() => {
            console.log(`[VISUAL_SYNC_MANAGER] Initial resize to ${window.innerWidth}x${window.innerHeight}`);
            this.resizeVisualizers(window.innerWidth, window.innerHeight);
        }, 100);
    }

    /**
     * イベントリスナーを設定
     */
    private setupEventListeners(): void {
        this.channel.addEventListener('message', (event) => {
            this.handleMessage(event.data);
        });
    }

    /**
     * ウィンドウリサイズリスナーを設定
     */
    private setupWindowResizeListener(): void {
        window.addEventListener('resize', () => {
            // フルスクリーンモードの時のみ、ウィンドウサイズに追従
            if (this.currentDisplayMode === 'fullscreen') {
                console.log(`[VISUAL_SYNC] Window resized: ${window.innerWidth}x${window.innerHeight}`);
                this.resizeVisualizers(window.innerWidth, window.innerHeight);
            }
        });
    }

    /**
     * メッセージハンドラー
     */
    private handleMessage(message: SyncMessage): void {
        console.log('[VISUAL_SYNC] Received message:', message.type, message);

        switch (message.type) {
            case 'playback-state':
                this.handlePlaybackState(message);
                break;
            case 'visual-event':
                this.handleVisualEvent(message);
                break;
            case 'visual-enable':
                this.handleVisualEnable(message);
                break;
            case 'display-mode':
                this.handleDisplayMode(message);
                break;
            case 'particle-count':
                this.handleParticleCount(message);
                break;
            case 'show-coordinates':
                this.handleShowCoordinates(message);
                break;
            case 'coordinate-display-mode':
                this.handleCoordinateDisplayMode(message);
                break;
            case 'attraction-strength':
                this.handleAttractionStrength(message);
                break;
            case 'invert-colors':
                this.handleInvertColors(message);
                break;
            case 'countdown':
                this.handleCountdown(message);
                break;
        }
    }

    /**
     * 再生状態の処理
     */
    private handlePlaybackState(message: PlaybackStateMessage): void {
        console.log(`[VISUAL_SYNC] Playback state: ${message.state}`);
        console.log(`[VISUAL_SYNC] isEnabled: ${this.isEnabled}, current isPlaying: ${this.isPlaying}`);

        // 時間同期
        this.syncTime(message.audioContextTime);

        // 音楽的時間を更新
        this.currentBar = message.musicalTime.bar;
        this.currentBeat = message.musicalTime.beat;
        this.currentTempo = message.musicalTime.tempo;

        // 再生状態を更新
        switch (message.state) {
            case 'playing':
                this.isPlaying = true;
                if (this.isEnabled) {
                    console.log('[VISUAL_SYNC] Starting visuals (enabled and playing)');
                    this.startVisuals();
                } else {
                    console.log('[VISUAL_SYNC] Not starting visuals (not enabled)');
                }
                break;
            case 'paused':
                this.isPlaying = false;
                console.log('[VISUAL_SYNC] Pausing visuals');
                this.pauseVisuals();
                break;
            case 'stopped':
                this.isPlaying = false;
                console.log('[VISUAL_SYNC] Stopping visuals');
                this.stopVisuals();
                break;
        }
    }    /**
     * ビジュアルイベントの処理
     */
    private handleVisualEvent(message: VisualEventMessage): void {
        if (!this.isEnabled) {
            console.log('[VISUAL_SYNC] Visuals disabled, ignoring event');
            return;
        }

        const receiveTime = performance.now();

        console.log(`[VISUAL_SYNC] Visual event: ${message.action}`, message.parameters);

        // 時間同期
        this.syncTime(message.audioContextTime);

        // イベント実行
        this.executeVisualEvent(message);

        // タイミングログ（デバッグ用）
        const renderTime = performance.now();
        const latency = renderTime - message.timestamp;

        this.logTiming({
            eventId: message.eventId,
            scheduledAudioTime: message.audioContextTime,
            actualReceiveTime: receiveTime,
            actualRenderTime: renderTime,
            latencyMs: latency
        });

        this.eventCount++;
    }

    /**
     * ビジュアル有効/無効の処理
     */
    private handleVisualEnable(message: VisualEnableMessage): void {
        console.log(`[VISUAL_SYNC] Visuals ${message.enabled ? 'enabled' : 'disabled'}`);
        console.log(`[VISUAL_SYNC] isPlaying: ${this.isPlaying}, isEnabled: ${this.isEnabled}`);

        this.isEnabled = message.enabled;

        if (!this.isEnabled) {
            // ビジュアルを無効化 → 黒画面
            console.log('[VISUAL_SYNC] Disabling visuals - clearing screen');
            this.stopVisuals();
            this.clearScreen();
        } else if (this.isPlaying) {
            // 有効化して再生中なら開始
            console.log('[VISUAL_SYNC] Enabling visuals - starting (already playing)');
            this.startVisuals();
        } else {
            console.log('[VISUAL_SYNC] Visuals enabled but not playing yet');
        }
    }

    /**
     * ディスプレイモードの処理
     */
    private handleDisplayMode(message: DisplayModeMessage): void {
        console.log(`[VISUAL_SYNC] Display mode: ${message.mode}`);

        this.currentDisplayMode = message.mode;
        const container = document.getElementById('visualizer-container');

        if (message.mode === 'fullscreen') {
            // フルスクリーンモード - ウィンドウ全体を使用
            if (container) {
                container.classList.remove('preview-mode');
            }
            this.resizeVisualizers(window.innerWidth, window.innerHeight);
        } else if (message.mode === 'preview') {
            // プレビューモード - 800x600
            if (container) {
                container.classList.add('preview-mode');
            }
            this.resizeVisualizers(800, 600);
        }
    }

    /**
     * パーティクル数の処理
     */
    private handleParticleCount(message: ParticleCountMessage): void {
        console.log(`[VISUAL_SYNC] Particle count: ${message.count}`);

        if (this.threeVisualizer) {
            this.threeVisualizer.setParticleCount(message.count);
        } else {
            console.warn('[VISUAL_SYNC] Three.js visualizer not initialized');
        }
    }

    /**
     * 座標表示の処理
     */
    private handleShowCoordinates(message: ShowCoordinatesMessage): void {
        console.log(`[VISUAL_SYNC] Show coordinates: ${message.show}`);

        if (this.threeVisualizer) {
            this.threeVisualizer.setShowCoordinates(message.show);
        } else {
            console.warn('[VISUAL_SYNC] Three.js visualizer not initialized');
        }
    }

    /**
     * 座標表示モードの処理
     */
    private handleCoordinateDisplayMode(message: CoordinateDisplayModeMessage): void {
        console.log(`[VISUAL_SYNC] Coordinate display mode: ${message.mode}`);

        if (this.threeVisualizer) {
            this.threeVisualizer.setCoordinateDisplayMode(message.mode);
        } else {
            console.warn('[VISUAL_SYNC] Three.js visualizer not initialized');
        }

        if (this.p5Visualizer) {
            this.p5Visualizer.setCoordinateDisplayMode(message.mode);
        }
    }

    /**
     * 引き寄せ強度の処理
     */
    private handleAttractionStrength(message: AttractionStrengthMessage): void {
        console.log(`[VISUAL_SYNC] Attraction strength: ${message.multiplier}`);

        if (this.threeVisualizer) {
            this.threeVisualizer.setAttractionStrength(message.multiplier);
        } else {
            console.warn('[VISUAL_SYNC] Three.js visualizer not initialized');
        }
    }

    /**
     * 色反転の処理
     */
    private handleInvertColors(message: InvertColorsMessage): void {
        console.log(`[VISUAL_SYNC] Invert colors: ${message.invert}`);

        if (this.threeVisualizer) {
            this.threeVisualizer.setInvertColors(message.invert);
        } else {
            console.warn('[VISUAL_SYNC] Three.js visualizer not initialized');
        }
    }

    private handleCountdown(message: CountdownMessage): void {
        if (!this.isEnabled) {
            return;
        }

        const payload = message.data ?? {};
        const secondsRemaining = payload.secondsRemaining;
        if (secondsRemaining === undefined || secondsRemaining > 0.05) {
            return;
        }

        const performerId = payload.performerId ?? 'unknown';
        const now = performance.now();
        const last = this.lastPerformerPulseAt.get(performerId) ?? -Infinity;
        if (now - last < this.performerPulseCooldownMs) {
            return;
        }

        this.lastPerformerPulseAt.set(performerId, now);

        this.triggerPerformerPulse({
            performerId,
            sectionId: payload.sectionId ?? null,
            sectionName: payload.sectionName ?? null
        });
    }

    private triggerPerformerPulse(context: PerformerPulseContext): void {
        if (!this.threeVisualizer) {
            return;
        }

        const color = this.getPerformerColor(context.performerId);
        this.threeVisualizer.triggerPerformerPulse({
            performerId: context.performerId,
            color,
            intensity: 1.0,
            decaySeconds: 2.6,
            attractionMultiplier: 3.8,
            screenPulseStrength: 0.32,
            screenPulseDuration: 0.9
        });
    }

    private getPerformerColor(performerId?: string): number {
        if (!performerId) {
            return 0xffffff;
        }
        return this.performerColors[performerId] ?? 0xffffff;
    }

    /**
     * ビジュアルイベントの実行
     */
    private executeVisualEvent(message: VisualEventMessage): void {
        const { action, parameters } = message;

        // アクションに応じた処理
        switch (action) {
            case 'start_rotation':
                this.startRotation(parameters);
                break;
            case 'stop_rotation':
                this.stopRotation();
                break;
            case 'change_color':
                this.changeColor(parameters);
                break;
            case 'change_scene':
                this.changeScene(parameters);
                break;
            case 'set_intensity':
                this.setIntensity(parameters);
                break;
            default:
                console.warn(`[VISUAL_SYNC] Unknown action: ${action}`);
        }
    }

    /**
     * 時間同期
     */
    private syncTime(audioContextTime: number): void {
        this.audioContextTime = audioContextTime;
        this.lastSyncTimestamp = performance.now();
    }

    /**
     * 現在の推定AudioContext時間を取得
     */
    public getCurrentAudioTime(): number {
        const elapsedMs = performance.now() - this.lastSyncTimestamp;
        return this.audioContextTime + (elapsedMs / 1000);
    }

    /**
     * 現在の音楽的時間を取得
     */
    public getMusicalTime(): { bar: number; beat: number; tempo: number } {
        return {
            bar: this.currentBar,
            beat: this.currentBeat,
            tempo: this.currentTempo
        };
    }

    /**
     * ビジュアライザー参照を設定
     */
    public setVisualizers(p5: P5Visualizer, three: ThreeJSVisualizer): void {
        this.p5Visualizer = p5;
        this.threeVisualizer = three;
        console.log('[VISUAL_SYNC] Visualizers attached');
    }

    /**
     * ビジュアル開始
     */
    private startVisuals(): void {
        console.log('[VISUAL_SYNC] Starting visuals');
        console.log('[VISUAL_SYNC] p5Visualizer:', this.p5Visualizer);
        console.log('[VISUAL_SYNC] threeVisualizer:', this.threeVisualizer);

        if (this.threeVisualizer) {
            this.threeVisualizer.startAnimation();
            console.log('[VISUAL_SYNC] Three.js animation started');
        }

        if (this.p5Visualizer) {
            this.p5Visualizer.start();
            console.log('[VISUAL_SYNC] p5.js animation started');
        }
    }

    /**
     * ビジュアル一時停止
     */
    private pauseVisuals(): void {
        console.log('[VISUAL_SYNC] Pausing visuals');
        this.threeVisualizer?.stopAnimation();
        this.p5Visualizer?.stop();
    }

    /**
     * ビジュアル停止
     */
    private stopVisuals(): void {
        console.log('[VISUAL_SYNC] Stopping visuals');
        this.threeVisualizer?.stopAnimation();
        this.p5Visualizer?.stop();
        this.clearScreen();
    }

    /**
     * 黒画面表示
     */
    private clearScreen(): void {
        console.log('[VISUAL_SYNC] Clearing to black');
        this.threeVisualizer?.clearToBlack();
        this.p5Visualizer?.clearToBlack();
    }

    /**
     * ビジュアライザーのリサイズ
     */
    private resizeVisualizers(width: number, height: number): void {
        console.log(`[VISUAL_SYNC] Resizing visualizers to ${width}x${height}`);
        this.threeVisualizer?.resize(width, height);
        this.p5Visualizer?.resize(width, height);
    }

    // ========== ビジュアル制御メソッド ==========

    private startRotation(parameters?: Record<string, any>): void {
        console.log('[VISUAL_SYNC] Start rotation', parameters);
        // TODO: Three.jsで回転開始
    }

    private stopRotation(): void {
        console.log('[VISUAL_SYNC] Stop rotation');
        // TODO: Three.jsで回転停止
    }

    private changeColor(parameters?: Record<string, any>): void {
        console.log('[VISUAL_SYNC] Change color', parameters);
        // TODO: 色変更処理
    }

    private changeScene(parameters?: Record<string, any>): void {
        console.log('[VISUAL_SYNC] Change scene', parameters);
        // TODO: シーン切り替え
    }

    private setIntensity(parameters?: Record<string, any>): void {
        console.log('[VISUAL_SYNC] Set intensity', parameters);
        // TODO: 強度設定
    }

    // ========== デバッグ機能 ==========

    /**
     * タイミングログを記録
     */
    private logTiming(log: VisualTimingLog): void {
        this.timingLogs.push(log);

        // 最大数を超えたら古いものを削除
        if (this.timingLogs.length > this.maxLogs) {
            this.timingLogs.shift();
        }

        // コンソールに出力
        if (log.latencyMs > 50) {
            console.warn(`[VISUAL_SYNC] High latency: ${log.latencyMs.toFixed(2)}ms for event ${log.eventId}`);
        }
    }

    /**
     * 統計情報を取得
     */
    public getStats(): {
        eventCount: number;
        meanLatency: number;
        maxLatency: number;
        minLatency: number;
        currentAudioTime: number;
    } {
        if (this.timingLogs.length === 0) {
            return {
                eventCount: this.eventCount,
                meanLatency: 0,
                maxLatency: 0,
                minLatency: 0,
                currentAudioTime: this.getCurrentAudioTime()
            };
        }

        const latencies = this.timingLogs.map(log => log.latencyMs);
        const sum = latencies.reduce((a, b) => a + b, 0);
        const mean = sum / latencies.length;
        const max = Math.max(...latencies);
        const min = Math.min(...latencies);

        return {
            eventCount: this.eventCount,
            meanLatency: mean,
            maxLatency: max,
            minLatency: min,
            currentAudioTime: this.getCurrentAudioTime()
        };
    }

    /**
     * ビジュアライザーを登録
     */
    public registerVisualizers(p5Visualizer: P5Visualizer, threeVisualizer: ThreeJSVisualizer): void {
        this.p5Visualizer = p5Visualizer;
        this.threeVisualizer = threeVisualizer;

        // ThreeVisualizerにp5Visualizerへの参照を設定
        threeVisualizer.setP5Visualizer(p5Visualizer);

        console.log('[VISUAL_SYNC_MANAGER] Visualizers registered and linked');
    }

    /**
     * クリーンアップ
     */
    public destroy(): void {
        this.channel.close();
        console.log('[VISUAL_SYNC_MANAGER] Destroyed');
    }
}
