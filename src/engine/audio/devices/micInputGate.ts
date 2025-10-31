/**
 * Mic Input Gate Controller
 * 
 * 演奏キューに応じて自動的にマイク入力をフェードイン/アウトするゲート制御
 * Logic InputsのUI音量調整とは独立して動作
 * 
 * 各パフォーマンスキュー(合図)ごとに独立したゲートを作成し、
 * PerformanceTrackManagerと連携して別トラック扱いにする
 */

import { getGlobalPerformanceTrackManager } from './performanceTrackManager';
import { getGlobalMicRecordingManager } from './micRecordingManager';

export interface MicInputGateController {
    performerId: string;
    gateNode: GainNode;
    trackId?: string;  // 関連付けられたトラックID
    isOpen: boolean;
    currentFade: 'idle' | 'fadein' | 'open' | 'fadeout';
}

export interface PerformerMicSource {
    performerId: string;
    micSourceNode: MediaStreamAudioSourceNode;
    deviceId?: string;
}

export class MicInputGateManager {
    private gates: Map<string, MicInputGateController> = new Map();
    private audioContext: AudioContext | null = null;
    private performerMicSources: Map<string, PerformerMicSource> = new Map();
    private destinationNode: AudioNode | null = null;

    /**
     * 初期化
     */
    initialize(audioContext: AudioContext, destinationNode: AudioNode): void {
        this.audioContext = audioContext;
        this.destinationNode = destinationNode;
        console.log('[MicInputGate] Manager initialized with destination');
    }

    /**
     * 演奏者のマイク入力ソースを登録
     */
    registerPerformerMic(performerId: string, micSource: MediaStreamAudioSourceNode, deviceId?: string): void {
        this.performerMicSources.set(performerId, {
            performerId,
            micSourceNode: micSource,
            deviceId
        });
        console.log(`[MicInputGate] Registered mic source for ${performerId}`);
    }

    /**
     * 演奏者用のゲートを作成(旧バージョン - 互換性のため残す)
     * @deprecated 新しいopenGateForPerformanceが自動的にトラックを作成します
     */
    createGate(performerId: string, micInput: AudioNode): GainNode {
        if (!this.audioContext) {
            throw new Error('[MicInputGate] AudioContext not initialized');
        }

        // ゲートノードを作成(初期値は0 = 閉じた状態)
        const gateNode = this.audioContext.createGain();
        gateNode.gain.value = 0;

        const controller: MicInputGateController = {
            performerId,
            gateNode,
            isOpen: false,
            currentFade: 'idle'
        };

        this.gates.set(performerId, controller);

        // マイク入力をゲートノードに接続
        micInput.connect(gateNode);

        console.log(`[MicInputGate] Gate created for ${performerId}`);
        return gateNode;
    }

    /**
     * 演奏キュー受信時: 新しいトラックを作成してフェードインを開始
     * @param performerId 演奏者ID
     * @param countdownDuration カウントダウン時間(秒)
     * @param holdDuration 演奏持続時間(秒)
     * @param fadeOutDuration フェードアウト時間(秒)
     * @returns 作成されたトラックID
     */
    openGateForPerformance(
        performerId: string,
        countdownDuration: number = 1.0,
        holdDuration: number = 1.0,
        fadeOutDuration: number = 0.8
    ): string | null {
        if (!this.audioContext || !this.destinationNode) {
            console.error(`[MicInputGate] AudioContext or destination not initialized`);
            return null;
        }

        // 演奏者のマイクソースを取得
        const micSource = this.performerMicSources.get(performerId);
        if (!micSource) {
            console.warn(`[MicInputGate] No mic source registered for ${performerId}`);
            return null;
        }

        // 既にこのperformerIdでアクティブなゲートがあるかチェック
        const existingActiveGates = Array.from(this.gates.values()).filter(
            gate => gate.performerId === performerId && gate.isOpen
        );
        if (existingActiveGates.length > 0) {
            console.log(`[MicInputGate] ⚠️ Performer ${performerId} already has ${existingActiveGates.length} active gate(s), skipping`);
            return null;
        }

        const now = this.audioContext.currentTime;

        // 新しいゲートノードを作成(この合図専用)
        const gateNode = this.audioContext.createGain();
        gateNode.gain.value = 0;

        // 重要: マイクソースをゲートに接続
        micSource.micSourceNode.connect(gateNode);
        console.log(`[MicInputGate] Connected mic source to gate node`);

        console.log(`[MicInputGate] Creating new track for ${performerId}`);
        console.log(`  Countdown: ${countdownDuration}s, Hold: ${holdDuration}s, FadeOut: ${fadeOutDuration}s`);

        // PerformanceTrackManagerを使って新しいトラックを作成
        const trackManager = getGlobalPerformanceTrackManager();
        const trackId = trackManager.createTrack({
            performerId,
            micInput: micSource.micSourceNode,
            gateNode,
            destinationNode: this.destinationNode
        });

        // 録音を開始（グラニュラー引き伸ばしに使用）
        const recordingManager = getGlobalMicRecordingManager();
        const recordingMaxDuration = countdownDuration + holdDuration; // 録音時間 = カウントダウン + 演奏時間
        recordingManager.startRecording(
            trackId,
            performerId,
            micSource.micSourceNode,
            { maxDuration: recordingMaxDuration }
        ).then(() => {
            console.log(`[MicInputGate] Recording started for track ${trackId} (max ${recordingMaxDuration.toFixed(1)}s)`);
        }).catch(err => {
            console.error(`[MicInputGate] Recording failed for track ${trackId}:`, err);
        });

        // ゲートコントローラーを作成(このトラック専用)
        const controller: MicInputGateController = {
            performerId,
            gateNode,
            trackId,
            isOpen: false,
            currentFade: 'idle'
        };

        // トラックIDをキーとして保存
        this.gates.set(trackId, controller);

        const gateParam = gateNode.gain;

        // フェーズ1: フェードイン (カウントダウン中)
        gateParam.setValueAtTime(0, now);
        gateParam.linearRampToValueAtTime(1.0, now + countdownDuration);
        controller.currentFade = 'fadein';

        // フェーズ2: 全開 (演奏中)
        const openStartTime = now + countdownDuration;
        const openEndTime = openStartTime + holdDuration;
        controller.currentFade = 'open';
        controller.isOpen = true;

        // フェーズ3: フェードアウト (演奏終了後)
        gateParam.setValueAtTime(1.0, openEndTime);
        gateParam.linearRampToValueAtTime(0.0, openEndTime + fadeOutDuration);

        // フェードアウト完了後の処理
        const totalDuration = countdownDuration + holdDuration + fadeOutDuration;
        setTimeout(() => {
            controller.isOpen = false;
            controller.currentFade = 'idle';

            // 録音を停止して保存
            const recording = recordingManager.stopRecording(trackId);
            if (recording) {
                console.log(`[MicInputGate] Recording saved: ${recording.id}, duration: ${recording.duration.toFixed(2)}s`);
            }

            // トラックを終了
            trackManager.endTrack(trackId);

            // リバーブテールを完全に鳴らし切るための待機時間(12秒)
            setTimeout(() => {
                this.gates.delete(trackId);
                trackManager.removeTrack(trackId);
                console.log(`[MicInputGate] Track ${trackId} cleaned up after reverb tail`);
            }, 12000);

        }, totalDuration * 1000);

        console.log(`[MicInputGate] Track ${trackId} created and gate opened`);
        return trackId;
    }

    /**
     * 手動でゲートを開く(トラックIDベース)
     */
    manualOpen(trackId: string, duration: number = 0.1): void {
        const controller = this.gates.get(trackId);
        if (!controller || !this.audioContext) return;

        const now = this.audioContext.currentTime;
        const gateParam = controller.gateNode.gain;

        gateParam.cancelScheduledValues(now);
        gateParam.setValueAtTime(gateParam.value, now);
        gateParam.linearRampToValueAtTime(1.0, now + duration);

        controller.isOpen = true;
        console.log(`[MicInputGate] Manual open for track ${trackId}`);
    }

    /**
     * 手動でゲートを閉じる(トラックIDベース)
     */
    manualClose(trackId: string, duration: number = 0.1): void {
        const controller = this.gates.get(trackId);
        if (!controller || !this.audioContext) return;

        const now = this.audioContext.currentTime;
        const gateParam = controller.gateNode.gain;

        gateParam.cancelScheduledValues(now);
        gateParam.setValueAtTime(gateParam.value, now);
        gateParam.linearRampToValueAtTime(0.0, now + duration);

        controller.isOpen = false;
        console.log(`[MicInputGate] Manual close for track ${trackId}`);
    }

    /**
     * 全ゲートを閉じる
     */
    closeAllGates(duration: number = 0.5): void {
        for (const [trackId, controller] of this.gates.entries()) {
            if (controller.isOpen) {
                this.manualClose(trackId, duration);
            }
        }
        console.log(`[MicInputGate] All gates closing`);
    }

    /**
     * ゲートノードを取得(トラックIDベース)
     */
    getGateNode(trackId: string): GainNode | null {
        return this.gates.get(trackId)?.gateNode || null;
    }

    /**
     * ゲート状態を取得(トラックIDベース)
     */
    getGateState(trackId: string): MicInputGateController | null {
        return this.gates.get(trackId) || null;
    }

    /**
     * クリーンアップ
     */
    cleanup(): void {
        for (const controller of this.gates.values()) {
            try {
                controller.gateNode.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
        }
        this.gates.clear();
        console.log('[MicInputGate] Cleanup complete');
    }
}

// グローバルインスタンス
let globalMicInputGateManager: MicInputGateManager | null = null;

/**
 * グローバルMicInputGateManagerを取得
 */
export function getGlobalMicInputGateManager(): MicInputGateManager {
    if (!globalMicInputGateManager) {
        globalMicInputGateManager = new MicInputGateManager();
    }
    return globalMicInputGateManager;
}
