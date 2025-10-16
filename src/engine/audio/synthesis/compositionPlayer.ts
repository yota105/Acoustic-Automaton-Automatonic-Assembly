/**
 * CompositionPlayer
 * 楽曲全体の再生を管理するクラス
 * Play/Pause/Stop を処理し、MusicalTimeManager と連携
 */

import { PlaySynthController } from './playSynthController';
import { ensureBaseAudio, resumeAudio } from '../core/audioCore';

export type PlayerState = 'stopped' | 'playing' | 'paused';

export interface CompositionPlayerOptions {
    autoConnect?: boolean; // 自動的にバスへ接続するか
}

export class CompositionPlayer {
    private audioCtx: AudioContext | null = null;
    private synth: PlaySynthController | null = null;
    private state: PlayerState = 'stopped';
    private musicalTimeManager: any = null; // MusicalTimeManager のインスタンス

    constructor(private options: CompositionPlayerOptions = {}) {
        this.options.autoConnect = this.options.autoConnect !== false; // デフォルト true
    }

    /**
     * 初期化（BaseAudio + DSP ロード）
     */
    async initialize(): Promise<void> {
        console.log('[CompositionPlayer] Initializing...');

        try {
            // 1. BaseAudio を確保
            await ensureBaseAudio();
            this.audioCtx = window.audioCtx!;
            console.log('[CompositionPlayer] ✅ Base Audio ready');

            // 2. PlaySynth を初期化
            this.synth = new PlaySynthController(this.audioCtx);
            await this.synth.initialize();
            console.log('[CompositionPlayer] ✅ PlaySynth ready');

            // 3. バスへ接続
            if (this.options.autoConnect && this.synth.getNode()) {
                const synthNode = this.synth.getNode()!;
                const busManager = window.busManager!;
                const synthBus = busManager.getSynthInputNode();

                synthNode.connect(synthBus);
                console.log('[CompositionPlayer] ✅ Connected to synthBus');
            }

            // 4. MusicalTimeManager を取得（存在すれば）
            this.musicalTimeManager = (window as any).musicalTimeManager || null;
            if (this.musicalTimeManager) {
                console.log('[CompositionPlayer] ✅ MusicalTimeManager available');
            } else {
                console.warn('[CompositionPlayer] ⚠️ MusicalTimeManager not available');
            }

            console.log('[CompositionPlayer] ✅ Initialization complete');
        } catch (error) {
            console.error('[CompositionPlayer] ❌ Initialization failed:', error);
            throw error;
        }
    }

    /**
     * 再生開始
     */
    async play(): Promise<void> {
        if (this.state === 'playing') {
            console.warn('[CompositionPlayer] Already playing');
            return;
        }

        try {
            // AudioContext を resume
            await resumeAudio();

            if (this.state === 'paused') {
                // Pause から Resume
                console.log('[CompositionPlayer] ▶️ Resuming...');
                if (this.musicalTimeManager && typeof this.musicalTimeManager.resume === 'function') {
                    this.musicalTimeManager.resume();
                }
                this.state = 'playing';
            } else {
                // 新規再生開始
                console.log('[CompositionPlayer] ▶️ Starting playback...');

                // MusicalTimeManager を開始
                if (this.musicalTimeManager && typeof this.musicalTimeManager.start === 'function') {
                    this.musicalTimeManager.start();
                }

                this.state = 'playing';

                // テスト: シンプルなシーケンスを再生
                this.playTestSequence();
            }

            console.log('[CompositionPlayer] ✅ Playback started');
        } catch (error) {
            console.error('[CompositionPlayer] ❌ Play failed:', error);
            throw error;
        }
    }

    /**
     * 一時停止
     */
    async pause(): Promise<void> {
        if (this.state !== 'playing') {
            console.warn('[CompositionPlayer] Not playing');
            return;
        }

        console.log('[CompositionPlayer] ⏸️ Pausing...');

        if (this.musicalTimeManager && typeof this.musicalTimeManager.pause === 'function') {
            this.musicalTimeManager.pause();
        }

        this.state = 'paused';
        console.log('[CompositionPlayer] ✅ Paused');
    }

    /**
     * 停止
     */
    async stop(): Promise<void> {
        if (this.state === 'stopped') {
            console.warn('[CompositionPlayer] Already stopped');
            return;
        }

        console.log('[CompositionPlayer] ⏹️ Stopping...');

        // MusicalTimeManager を停止
        if (this.musicalTimeManager && typeof this.musicalTimeManager.stop === 'function') {
            this.musicalTimeManager.stop();
        }

        // シンセの音を止める
        if (this.synth) {
            this.synth.noteOff();
        }

        this.state = 'stopped';
        console.log('[CompositionPlayer] ✅ Stopped');
    }

    /**
     * 現在の状態を取得
     */
    getState(): PlayerState {
        return this.state;
    }

    /**
     * テスト用シーケンス再生
     */
    private async playTestSequence(): Promise<void> {
        if (!this.synth) return;

        console.log('[CompositionPlayer] 🎵 Playing test sequence...');

        // C4, E4, G4, C5 (Cメジャーコード)
        const notes = [261.63, 329.63, 392.00, 523.25];

        // 非同期でシーケンスを再生（再生中でも他の操作可能）
        setTimeout(async () => {
            try {
                await this.synth!.playSequence(notes, 0.5);
                console.log('[CompositionPlayer] ✅ Test sequence complete');
            } catch (error) {
                console.error('[CompositionPlayer] Test sequence error:', error);
            }
        }, 100);
    }

    /**
     * シンセにアクセス（外部から直接制御する場合）
     */
    getSynth(): PlaySynthController | null {
        return this.synth;
    }

    /**
     * クリーンアップ
     */
    cleanup(): void {
        this.stop();

        if (this.synth) {
            this.synth.cleanup();
            this.synth = null;
        }

        console.log('[CompositionPlayer] Cleaned up');
    }
}

// グローバルインスタンスをエクスポート（シングルトン的に使用）
let globalPlayer: CompositionPlayer | null = null;

export function getGlobalCompositionPlayer(): CompositionPlayer {
    if (!globalPlayer) {
        globalPlayer = new CompositionPlayer();
    }
    return globalPlayer;
}

export function resetGlobalCompositionPlayer(): void {
    if (globalPlayer) {
        globalPlayer.cleanup();
        globalPlayer = null;
    }
}
