/**
 * TestSignalManagerV2 - AudioWorklet版
 * High-performance test signal generation using AudioWorklet
 */

interface TestSignalOptions {
    frequency?: number;  // tone用 (デフォルト: 440Hz)
    amplitude?: number;  // 振幅 (デフォルト: type依存)
    duration?: number;   // 再生時間秒 (デフォルト: type依存)
}

interface ActiveSignal {
    type: 'tone' | 'noise' | 'impulse';
    logicInputId: string;
    workletNode: AudioWorkletNode;
    startedAt: number;
    options: TestSignalOptions;
}

export class TestSignalManagerV2 {
    private ctx: AudioContext;
    private activeSignals = new Map<string, ActiveSignal>();
    private workletLoaded = false;
    private loadingPromise: Promise<void> | null = null;

    constructor(audioContext: AudioContext) {
        this.ctx = audioContext;
    }

    /**
     * AudioWorkletを初期化
     */
    async initialize(): Promise<void> {
        if (this.workletLoaded) return;
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = this.loadWorklet();
        await this.loadingPromise;
        this.workletLoaded = true;
    }

    private async loadWorklet(): Promise<void> {
        try {
            // AudioWorkletモジュールをロード
            await this.ctx.audioWorklet.addModule('/audio/worklets/testSignalProcessor.js');
            console.log('[TestSignalManagerV2] AudioWorklet module loaded successfully');
        } catch (error) {
            console.error('[TestSignalManagerV2] Failed to load AudioWorklet module:', error);
            throw new Error(`AudioWorklet loading failed: ${error}`);
        }
    }

    /**
     * テスト信号開始 (AudioWorklet版)
     */
    async start(
        type: 'tone' | 'noise' | 'impulse',
        logicInputId: string,
        options: TestSignalOptions = {}
    ): Promise<void> {
        // AudioWorklet初期化確認
        await this.initialize();

        // 既存信号停止
        this.stop(logicInputId);

        // Logic Input の GainNode 取得
        const inputGainNode = await this.ensureInputGain(logicInputId);
        if (!inputGainNode) {
            console.warn(`[TestSignalManagerV2] Cannot get input gain for Logic Input: ${logicInputId}`);
            return;
        }

        console.log(`[TestSignalManagerV2] Starting ${type} signal for Logic Input: ${logicInputId}`);

        // AudioContext が suspended の場合は resume
        if (this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
                console.log(`[TestSignalManagerV2] AudioContext resumed for ${type} signal`);
            } catch (error) {
                console.error(`[TestSignalManagerV2] Failed to resume AudioContext:`, error);
                throw error;
            }
        }

        try {
            // AudioWorkletNode作成
            const workletNode = new AudioWorkletNode(this.ctx, 'test-signal-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [1]
            });

            // メッセージハンドリング
            workletNode.port.onmessage = (event) => {
                this.handleWorkletMessage(logicInputId, event.data);
            };

            // AudioWorkletNodeをLogic Inputに接続
            workletNode.connect(inputGainNode);

            // 信号情報を記録
            const signal: ActiveSignal = {
                type,
                logicInputId,
                workletNode,
                startedAt: this.ctx.currentTime,
                options
            };

            this.activeSignals.set(logicInputId, signal);

            // AudioWorkletに信号開始を指示
            workletNode.port.postMessage({
                type: 'startSignal',
                data: {
                    type,
                    id: logicInputId,
                    params: {
                        frequency: options.frequency || 440,
                        amplitude: options.amplitude || this.getDefaultAmplitude(type),
                        duration: options.duration || this.getDefaultDuration(type)
                    }
                }
            });

            console.log(`[TestSignalManagerV2] AudioWorklet ${type} signal started for Logic Input: ${logicInputId}`);

        } catch (error) {
            console.error(`[TestSignalManagerV2] Failed to create AudioWorklet ${type} signal:`, error);
            throw error;
        }
    }

    /**
     * 特定Logic Inputのテスト信号停止
     */
    stop(logicInputId: string): void {
        const signal = this.activeSignals.get(logicInputId);
        if (!signal) return;

        try {
            // AudioWorkletに停止を指示
            signal.workletNode.port.postMessage({
                type: 'stopSignal',
                data: { id: logicInputId }
            });

            // AudioWorkletNodeを切断・破棄
            signal.workletNode.disconnect();

            this.activeSignals.delete(logicInputId);

            console.log(`[TestSignalManagerV2] Stopped ${signal.type} signal for Logic Input: ${logicInputId}`);

        } catch (error) {
            console.error(`[TestSignalManagerV2] Error stopping signal for ${logicInputId}:`, error);
        }
    }

    /**
     * 全テスト信号停止
     */
    stopAll(): void {
        console.log(`[TestSignalManagerV2] Stopping all signals (${this.activeSignals.size} active)`);

        for (const logicInputId of this.activeSignals.keys()) {
            this.stop(logicInputId);
        }
    }

    /**
     * アクティブな信号の情報取得
     */
    getActiveSignals(): Array<{
        logicInputId: string;
        type: 'tone' | 'noise' | 'impulse';
        startedAt: number;
        elapsed: number;
        options: TestSignalOptions;
    }> {
        const currentTime = this.ctx.currentTime;
        return Array.from(this.activeSignals.values()).map(signal => ({
            logicInputId: signal.logicInputId,
            type: signal.type,
            startedAt: signal.startedAt,
            elapsed: currentTime - signal.startedAt,
            options: signal.options
        }));
    }

    /**
     * パフォーマンス統計取得
     */
    getPerformanceStats(): {
        activeSignalCount: number;
        audioContextState: string;
        workletLoaded: boolean;
        latencyHint: string;
    } {
        return {
            activeSignalCount: this.activeSignals.size,
            audioContextState: this.ctx.state,
            workletLoaded: this.workletLoaded,
            latencyHint: this.ctx.baseLatency ? `${(this.ctx.baseLatency * 1000).toFixed(2)}ms` : 'unknown'
        };
    }

    /**
     * AudioWorkletからのメッセージ処理
     */
    private handleWorkletMessage(logicInputId: string, message: { type: string; data: any }): void {
        switch (message.type) {
            case 'signalStarted':
                console.log(`[TestSignalManagerV2] AudioWorklet confirmed signal start: ${message.data.type} for ${logicInputId}`);
                break;
            case 'signalStopped':
                console.log(`[TestSignalManagerV2] AudioWorklet confirmed signal stop for ${logicInputId}`);
                break;
            case 'noiseBufferReady':
                console.log(`[TestSignalManagerV2] AudioWorklet noise buffer ready: ${message.data.size} samples`);
                break;
            case 'performanceTiming':
                console.log(`[TestSignalManagerV2] AudioWorklet Performance Timing for ${logicInputId}:`, {
                    processingTime: `${message.data.processingTime.toFixed(3)}ms`,
                    sampleTime: `${message.data.sampleTime.toFixed(3)}ms`,
                    processedSamples: message.data.processedSamples,
                    elapsed: `${message.data.elapsed.toFixed(3)}ms`
                });
                break;
            case 'error':
                console.error(`[TestSignalManagerV2] AudioWorklet error for ${logicInputId}:`, message.data);
                break;
            default:
                console.log(`[TestSignalManagerV2] Unknown message from AudioWorklet:`, message);
        }

        // カスタムイベントを発火
        window.dispatchEvent(new CustomEvent('test-signal-worklet-message', {
            detail: { logicInputId, message }
        }));
    }

    /**
     * Logic Input の GainNode を取得/作成
     */
    private async ensureInputGain(logicInputId: string): Promise<GainNode | null> {
        // Base Audioが初期化されているか確認
        if (!window.busManager) {
            console.error('[TestSignalManagerV2] busManager not available - call ensureBaseAudio() first');
            return null;
        }

        try {
            // Logic Inputが存在しない場合は自動作成
            if (!window.logicInputManagerInstance) {
                console.error('[TestSignalManagerV2] logicInputManagerInstance not available');
                return null;
            }

            // Logic Inputが存在するかチェック
            const existingInput = window.logicInputManagerInstance.list().find((input: any) => input.id === logicInputId);
            if (!existingInput) {
                console.log(`[TestSignalManagerV2] Creating Logic Input: ${logicInputId}`);

                // Logic Inputを自動作成
                const newInput = window.logicInputManagerInstance.add({
                    id: logicInputId,
                    label: `Test Signal ${logicInputId}`,
                    assignedDeviceId: null,
                    routing: { synth: true, effects: false, monitor: true },
                    gain: 1.0,
                    enabled: true
                });

                console.log(`[TestSignalManagerV2] Created Logic Input:`, newInput);

                // BusManagerに接続を作成
                const connection = window.busManager.ensureInput(newInput);
                console.log(`[TestSignalManagerV2] BusManager connection:`, connection);
            } else {
                console.log(`[TestSignalManagerV2] Logic Input already exists:`, existingInput);
                // 既存のLogic Inputでも接続を確認
                const connection = window.busManager.ensureInput(existingInput);
                console.log(`[TestSignalManagerV2] Ensured BusManager connection:`, connection);
            }

            const gainNode = window.busManager.getInputGainNode(logicInputId);
            console.log(`[TestSignalManagerV2] GainNode lookup for ${logicInputId}:`, gainNode);

            if (!gainNode) {
                // inputConnections の状態をチェック
                const connections = (window.busManager as any).inputConnections;
                console.log(`[TestSignalManagerV2] Available connections:`, Array.from(connections.keys()));
                console.error(`[TestSignalManagerV2] Failed to get gain node for Logic Input: ${logicInputId}`);
                return null;
            }

            // 一時的なルーティング設定（既存の実装と同じロジック）
            await this.ensureTemporaryRouting(logicInputId);

            return gainNode;
        } catch (error) {
            console.error(`[TestSignalManagerV2] Error getting input gain node:`, error);
            return null;
        }
    }

    /**
     * 一時的なルーティング設定
     */
    private async ensureTemporaryRouting(logicInputId: string): Promise<void> {
        if (!window.busManager || !window.logicInputManagerInstance) return;

        try {
            const logicInputs = window.logicInputManagerInstance.list();
            const logicInput = logicInputs.find((input: any) => input.id === logicInputId);
            if (!logicInput) {
                console.warn(`[TestSignalManagerV2] Logic Input not found: ${logicInputId}`);
                return;
            }

            // モニターが無効の場合、一時的に有効化
            if (!logicInput.routing?.monitor) {
                console.log(`[TestSignalManagerV2] Temporarily enabling monitor for Logic Input: ${logicInputId}`);
                logicInput.routing.monitor = true;

                // 将来的な復元のための情報保存
                window.dispatchEvent(new CustomEvent('test-signal-routing-changed', {
                    detail: { logicInputId, temporaryMonitor: true }
                }));
            }

        } catch (error) {
            console.error(`[TestSignalManagerV2] Error setting up temporary routing:`, error);
        }
    }

    /**
     * タイプ別デフォルト振幅
     */
    private getDefaultAmplitude(type: 'tone' | 'noise' | 'impulse'): number {
        switch (type) {
            case 'tone': return 0.35;
            case 'noise': return 0.25;
            case 'impulse': return 0.8;
            default: return 0.35;
        }
    }

    /**
     * タイプ別デフォルト再生時間
     */
    private getDefaultDuration(type: 'tone' | 'noise' | 'impulse'): number {
        switch (type) {
            case 'tone':
            case 'noise':
                return 0.6;
            case 'impulse':
                return 0.1;
            default:
                return 0.6;
        }
    }

    /**
     * リソースクリーンアップ
     */
    dispose(): void {
        console.log('[TestSignalManagerV2] Disposing...');
        this.stopAll();

        // 追加のクリーンアップは不要（AudioWorkletNodeはGCされる）
    }
}

// グローバル型拡張
declare global {
    interface Window {
        testSignalManagerV2?: TestSignalManagerV2;
    }
}
