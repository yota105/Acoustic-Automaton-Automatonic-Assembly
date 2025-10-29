/**
 * グラニュラーシンセシスプレイヤー
 * 
 * 録音されたマイク入力をグラニュラーシンセシスで引き伸ばして再生
 * タイムストレッチ・ピッチ保持・テクスチャ変化を実現
 */

import type { RecordedPerformance } from './micRecordingManager';

export interface GranularSettings {
    grainSize: number;
    grainDensity: number;
    grainSpray: number;
    pitchVariation: number;
    ampVariation: number;
    pan: number;
    loop: boolean;
    targetDuration: number;
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

        // ボイス用のゲインノード
        const voiceGain = this.audioContext.createGain();
        voiceGain.gain.value = 0.7; // 初期音量
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
        this.scheduleGrains(voiceId, recording.audioBuffer, settings);

        // 指定時間後に自動停止
        setTimeout(() => {
            this.stopVoice(voiceId);
        }, settings.targetDuration * 1000);

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

        let playbackPosition = 0; // ソースバッファ内の位置（0.0〜1.0）
        const playbackSpeed = sourceBuffer.duration / settings.targetDuration; // 再生速度調整

        const scheduleNextGrain = () => {
            if (!voice.isPlaying) {
                return;
            }

            // グレインを生成
            this.createGrain(voiceId, sourceBuffer, playbackPosition, settings);

            // 再生位置を進める
            playbackPosition += playbackSpeed * (settings.grainSize / 1000);

            // ループ設定がある場合は巻き戻し
            if (settings.loop && playbackPosition >= 1.0) {
                playbackPosition = playbackPosition % 1.0;
            }

            // 次のグレインをスケジュール
            if (playbackPosition < 1.0 || settings.loop) {
                const jitter = settings.grainSpray * grainIntervalMs * (Math.random() - 0.5);
                const nextInterval = Math.max(10, grainIntervalMs + jitter);

                const timeoutId = window.setTimeout(scheduleNextGrain, nextInterval);
                this.grainSchedulers.set(voiceId, timeoutId);
            } else {
                console.log(`[GranularPlayer] Voice ${voiceId} reached end of source`);
                this.stopVoice(voiceId);
            }
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
        const grainVolume = 0.3 * ampVariation; // 基本音量 * 変動

        // エンベロープ（フェードイン・フェードアウト）
        const grainDuration = settings.grainSize / 1000; // ミリ秒から秒へ
        const fadeTime = grainDuration * 0.3; // 30%をフェードに使用

        grainGain.gain.setValueAtTime(0, now);
        grainGain.gain.linearRampToValueAtTime(grainVolume, now + fadeTime);
        grainGain.gain.setValueAtTime(grainVolume, now + grainDuration - fadeTime);
        grainGain.gain.linearRampToValueAtTime(0, now + grainDuration);

        // 接続
        grainSource.connect(grainGain);
        grainGain.connect(voice.gainNode);

        // 再生位置を設定
        const startOffset = position * sourceBuffer.duration;
        grainSource.start(now, startOffset, grainDuration);

        // 自動クリーンアップ
        grainSource.onended = () => {
            grainSource.disconnect();
            grainGain.disconnect();
        };

        voice.grainCount++;

        if (voice.grainCount % 10 === 0) {
            console.log(`[GranularPlayer] Voice ${voiceId}: ${voice.grainCount} grains played`);
        }
    }

    /**
     * ボイスを停止
     */
    stopVoice(voiceId: string, fadeOutDuration: number = 1.0): void {
        const voice = this.voices.get(voiceId);
        if (!voice) return;

        console.log(`[GranularPlayer] Stopping voice ${voiceId}`);
        voice.isPlaying = false;

        // スケジューラーを停止
        const schedulerId = this.grainSchedulers.get(voiceId);
        if (schedulerId !== undefined) {
            clearTimeout(schedulerId);
            this.grainSchedulers.delete(voiceId);
        }

        // フェードアウト
        const now = this.audioContext.currentTime;
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
        voice.gainNode.gain.linearRampToValueAtTime(0, now + fadeOutDuration);

        // クリーンアップ
        setTimeout(() => {
            voice.gainNode.disconnect();
            this.voices.delete(voiceId);
            console.log(`[GranularPlayer] Voice ${voiceId} removed`);
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
