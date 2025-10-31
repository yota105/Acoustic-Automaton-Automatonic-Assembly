/**
 * グラニュラーシンセシスプレイヤー
 * 
 * 録音されたマイク入力をグラニュラーシンセシスで引き伸ばして再生
 * タイムストレッチ・ピッチ保持・テクスチャ変化を実現
 */

import type { RecordedPerformance } from './micRecordingManager';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface GranularSettings {
    grainSize: number;
    grainDensity: number;
    grainSpray: number;
    pitchVariation: number;
    ampVariation: number;
    pan: number;
    loop: boolean;
    targetDuration: number;
    positionJitter?: number; // 0.0-1.0: どれだけソース内の位置をランダム化するか
}

export interface GranularVoice {
    id: string;
    recordingId: string;
    performerId: string;
    sourceNode: AudioBufferSourceNode | null;
    gainNode: GainNode;
    outputNode: AudioNode;
    startTime: number;
    targetDuration: number;
    isPlaying: boolean;
    grainCount: number;
}

/**
 * グラニュラーシンセシスプレイヤー
 * Web Audio APIのみを使用した実装（Faustなし）
 */
export class GranularPlayer {
    private audioContext: AudioContext;
    private voices: Map<string, GranularVoice> = new Map();
    private grainSchedulers: Map<string, number> = new Map(); // setInterval IDs

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;
    }

    /**
     * グラニュラー再生を開始
     * @param recording 録音データ
     * @param destination 出力先ノード
     * @param settings グラニュラー設定
     * @returns ボイスID
     */
    playGranular(
        recording: RecordedPerformance,
        destination: AudioNode,
        settings: GranularSettings
    ): string {
        const voiceId = `grain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = this.audioContext.currentTime;

        console.log(`[GranularPlayer] Starting granular playback: ${voiceId}`);
        console.log(`  Source: ${recording.id} (${recording.duration.toFixed(2)}s)`);
        console.log(`  Target duration: ${settings.targetDuration}s`);
        console.log(`  Stretch factor: ${(settings.targetDuration / recording.duration).toFixed(2)}x`);

        // ボイス用のゲインノード
        const voiceGain = this.audioContext.createGain();
        voiceGain.gain.value = 0.85; // 音量を上げて明確に
        voiceGain.connect(destination);

        const voice: GranularVoice = {
            id: voiceId,
            recordingId: recording.id,
            performerId: recording.performerId,
            sourceNode: null,
            gainNode: voiceGain,
            outputNode: destination,
            startTime,
            targetDuration: settings.targetDuration,
            isPlaying: true,
            grainCount: 0
        };

        this.voices.set(voiceId, voice);

        // グレインの再生スケジューラーを開始
        // 停止はスケジューラー内の時間チェックで自動的に行われる
        this.scheduleGrains(voiceId, recording.audioBuffer, settings);

        return voiceId;
    }

    /**
     * グレインをスケジュール
     */
    private scheduleGrains(
        voiceId: string,
        sourceBuffer: AudioBuffer,
        settings: GranularSettings
    ): void {
        const voice = this.voices.get(voiceId);
        if (!voice) return;

        // グレイン間隔を計算（ms単位）
        const grainIntervalMs = (1000 / settings.grainDensity);

        let playbackPosition = 0; // ソースバッファ内の位置（秒）
        const stretchFactor = settings.targetDuration / sourceBuffer.duration; // 引き伸ばし倍率
        const grainAdvanceTime = settings.grainSize / 1000; // グレインの進行時間（秒）

        const voiceStartTime = this.audioContext.currentTime;
        const voiceEndTime = voiceStartTime + settings.targetDuration;

        console.log(`[GranularPlayer] Stretch setup:`);
        console.log(`  Source duration: ${sourceBuffer.duration.toFixed(2)}s`);
        console.log(`  Target duration: ${settings.targetDuration}s`);
        console.log(`  Stretch factor: ${stretchFactor.toFixed(2)}x`);
        console.log(`  Grain size: ${settings.grainSize}ms, Density: ${settings.grainDensity}/s`);
        console.log(`  Voice will stop at: ${voiceEndTime.toFixed(2)}s (audio context time)`);
        console.log(`  Grain interval: ${grainIntervalMs.toFixed(1)}ms`);
        console.log(`  🎵 Starting grain scheduler...`);

        const scheduleNextGrain = () => {
            // 時間切れチェック
            const now = this.audioContext.currentTime;
            if (now >= voiceEndTime || !voice.isPlaying) {
                console.log(`[GranularPlayer] Voice ${voiceId} time expired or stopped (${now.toFixed(2)}s >= ${voiceEndTime.toFixed(2)}s)`);
                this.stopVoice(voiceId, 1.0);
                return;
            }

            // グレインを生成（playbackPositionは秒単位）
            this.createGrain(voiceId, sourceBuffer, playbackPosition, settings);

            // 再生位置を進める（ストレッチを考慮）
            // 引き伸ばす = ゆっくり進む
            const positionBefore = playbackPosition;
            playbackPosition += grainAdvanceTime / stretchFactor;

            // 最初の数グレインの進行を詳細ログ
            const grainNum = this.voices.get(voiceId)?.grainCount || 0;
            if (grainNum <= 3) {
                console.log(`[GranularPlayer] 📍 Position advance: ${positionBefore.toFixed(3)}s → ${playbackPosition.toFixed(3)}s (delta: ${(grainAdvanceTime / stretchFactor).toFixed(3)}s)`);
            }

            // ループ設定がある場合は巻き戻し
            if (settings.loop && playbackPosition >= sourceBuffer.duration) {
                playbackPosition = playbackPosition % sourceBuffer.duration;
                console.log(`[GranularPlayer] Voice ${voiceId} looped back to start`);
            }

            // 次のグレインをスケジュール
            const jitter = settings.grainSpray * grainIntervalMs * (Math.random() - 0.5);
            const nextInterval = Math.max(10, grainIntervalMs + jitter);

            const timeoutId = window.setTimeout(scheduleNextGrain, nextInterval);
            this.grainSchedulers.set(voiceId, timeoutId);
        };

        // 最初のグレインを開始
        scheduleNextGrain();
    }

    /**
     * 個別のグレインを作成して再生
     */
    private createGrain(
        voiceId: string,
        sourceBuffer: AudioBuffer,
        position: number,
        settings: GranularSettings
    ): void {
        const voice = this.voices.get(voiceId);
        if (!voice || !voice.isPlaying) return;

        const now = this.audioContext.currentTime;

        // 最初のグレイン生成時に通知
        if (voice.grainCount === 0) {
            console.log(`[GranularPlayer] 🎵 First grain created for ${voiceId}`);
            console.log(`  Position: ${position.toFixed(3)}s, Now: ${now.toFixed(3)}s`);
        }

        // AudioBufferSourceNodeを作成
        const grainSource = this.audioContext.createBufferSource();
        grainSource.buffer = sourceBuffer;

        // グレイン用のゲインノード（エンベロープ）
        const grainGain = this.audioContext.createGain();

        // ピッチ変化（設定に応じて）
        const pitchVariation = settings.pitchVariation * (Math.random() - 0.5) / 100;
        grainSource.playbackRate.value = 1.0 + pitchVariation;

        // 音量変化
        const ampVariation = 1.0 - (settings.ampVariation * Math.random());
        const grainVolume = 0.35 * ampVariation; // 連続した質感になるよう少し抑える

        // エンベロープ（フェードイン・フェードアウト）
        const grainDuration = settings.grainSize / 1000; // ミリ秒から秒へ
        const fadeTime = grainDuration * 0.25; // 25%をフェードに使用（よりスムーズ）

        grainGain.gain.setValueAtTime(0, now);
        grainGain.gain.linearRampToValueAtTime(grainVolume, now + fadeTime);
        grainGain.gain.setValueAtTime(grainVolume, now + grainDuration - fadeTime);
        grainGain.gain.linearRampToValueAtTime(0, now + grainDuration);

        // 接続
        grainSource.connect(grainGain);
        grainGain.connect(voice.gainNode);

        // 再生位置を設定（positionは秒単位）
        const jitterRatio = settings.positionJitter ?? 0;
        const jitterWindow = jitterRatio > 0 ? jitterRatio * sourceBuffer.duration : 0;
        const randomJitter = jitterWindow > 0 ? (Math.random() - 0.5) * jitterWindow : 0;
        const proposedStart = position + randomJitter;
        const maxStart = Math.max(0, sourceBuffer.duration - grainDuration);
        const startOffset = clamp(proposedStart, 0, maxStart);

        // デバッグ: 最初の数グレインの詳細を出力
        if (voice.grainCount < 3) {
            console.log(`[GranularPlayer] 🔍 Grain #${voice.grainCount + 1} details:`);
            console.log(`  Buffer duration: ${sourceBuffer.duration.toFixed(3)}s`);
            console.log(`  Start offset: ${startOffset.toFixed(3)}s`);
            console.log(`  Grain duration: ${grainDuration.toFixed(3)}s`);
            console.log(`  Position in source (pre-jitter): ${position.toFixed(3)}s`);
            console.log(`  Position jitter window: ±${(jitterWindow / 2).toFixed(3)}s`);
            console.log(`  Will play from ${startOffset.toFixed(3)}s to ${(startOffset + grainDuration).toFixed(3)}s`);
        }

        // グレインの開始（第3引数でグレイン長を指定）
        grainSource.start(now, startOffset, grainDuration);

        // 安全のため、指定時間後に明示的に停止
        grainSource.stop(now + grainDuration);

        // 自動クリーンアップ
        grainSource.onended = () => {
            grainSource.disconnect();
            grainGain.disconnect();
        };

        voice.grainCount++;

        // 最初は詳細ログ、その後は20グレインごと
        if (voice.grainCount <= 10 || voice.grainCount % 20 === 0) {
            console.log(`[GranularPlayer] Voice ${voiceId}: ${voice.grainCount} grains, position: ${position.toFixed(3)}s`);
        }
    }

    /**
     * ボイスを停止
     */
    stopVoice(voiceId: string, fadeOutDuration: number = 1.0): void {
        const voice = this.voices.get(voiceId);
        if (!voice) {
            console.log(`[GranularPlayer] Voice ${voiceId} already removed`);
            return;
        }

        if (!voice.isPlaying) {
            console.log(`[GranularPlayer] Voice ${voiceId} already stopping`);
            return;
        }

        console.log(`[GranularPlayer] Stopping voice ${voiceId} (${voice.grainCount} grains played)`);
        voice.isPlaying = false;

        // スケジューラーを停止
        const schedulerId = this.grainSchedulers.get(voiceId);
        if (schedulerId !== undefined) {
            clearTimeout(schedulerId);
            this.grainSchedulers.delete(voiceId);
            console.log(`[GranularPlayer] Scheduler cleared for ${voiceId}`);
        }

        // フェードアウト
        const now = this.audioContext.currentTime;
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
        voice.gainNode.gain.linearRampToValueAtTime(0, now + fadeOutDuration);

        // クリーンアップ
        setTimeout(() => {
            try {
                voice.gainNode.disconnect();
            } catch (e) {
                // Already disconnected
            }
            this.voices.delete(voiceId);
            console.log(`[GranularPlayer] Voice ${voiceId} removed (total grains: ${voice.grainCount})`);
        }, fadeOutDuration * 1000 + 100);
    }

    /**
     * 全ボイスを停止
     */
    stopAll(fadeOutDuration: number = 1.0): void {
        console.log(`[GranularPlayer] Stopping all voices`);
        this.voices.forEach((_, voiceId) => {
            this.stopVoice(voiceId, fadeOutDuration);
        });
    }

    /**
     * ボイス情報を取得
     */
    getVoice(voiceId: string): GranularVoice | undefined {
        return this.voices.get(voiceId);
    }

    /**
     * アクティブなボイス数
     */
    getActiveVoiceCount(): number {
        return Array.from(this.voices.values()).filter(v => v.isPlaying).length;
    }

    /**
     * 統計情報
     */
    getStats(): {
        totalVoices: number;
        activeVoices: number;
        voicesByPerformer: Record<string, number>;
    } {
        const voicesByPerformer: Record<string, number> = {};

        this.voices.forEach(voice => {
            if (voice.isPlaying) {
                voicesByPerformer[voice.performerId] = (voicesByPerformer[voice.performerId] || 0) + 1;
            }
        });

        return {
            totalVoices: this.voices.size,
            activeVoices: this.getActiveVoiceCount(),
            voicesByPerformer
        };
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        this.stopAll(0);
        this.voices.clear();
        this.grainSchedulers.clear();
        console.log('[GranularPlayer] Disposed');
    }
}

// グローバルインスタンス
let globalGranularPlayer: GranularPlayer | null = null;

/**
 * グローバルなGranularPlayerを取得
 */
export function getGlobalGranularPlayer(): GranularPlayer {
    if (!globalGranularPlayer) {
        throw new Error('GranularPlayer not initialized');
    }
    return globalGranularPlayer;
}

/**
 * グローバルなGranularPlayerを初期化
 */
export function initializeGranularPlayer(audioContext: AudioContext): GranularPlayer {
    if (!globalGranularPlayer) {
        globalGranularPlayer = new GranularPlayer(audioContext);
        console.log('[GranularPlayer] Global instance initialized');
    }
    return globalGranularPlayer;
}
