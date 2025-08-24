// 音響的オートマトン - パフォーマンススクリプト
// 第1部: 導入部の実装

export interface PerformanceConfig {
    targetNote: number; // B4 = 493.88 Hz
    reverbSettings: {
        roomSize: number;
        damping: number;
        wetLevel: number;
        dryLevel: number;
    };
    sustainLevel: number; // 減衰後の保続レベル
    maxInstances: number; // 保持する音響インスタンスの最大数
}

export interface SoundInstance {
    id: string;
    sourceType: 'acoustic' | 'electronic';
    frequency: number;
    startTime: number;
    gainNode: GainNode;
    sustainGain: GainNode;
    oscillator?: OscillatorNode;
    position: { x: number; y: number; z: number };
    active: boolean;
}

export class AcousticAutomatonPerformance {
    private audioContext: AudioContext;
    private reverbNode: ConvolverNode | null = null;
    private masterGain: GainNode;
    private instances: Map<string, SoundInstance> = new Map();
    private config: PerformanceConfig;
    private instanceCounter = 0;

    // 音程検出用
    private pitchDetector: AnalyserNode | null = null;
    private detectionBuffer: Float32Array | null = null;

    constructor(audioContext: AudioContext, config: PerformanceConfig) {
        this.audioContext = audioContext;
        this.config = config;
        this.masterGain = audioContext.createGain();
        this.masterGain.connect(audioContext.destination);

        this.initializeReverb();
        this.setupPitchDetection();
    }

    private async initializeReverb(): Promise<void> {
        try {
            // インパルスレスポンスを生成（リバーブ効果）
            const length = this.audioContext.sampleRate * 2; // 2秒のリバーブ
            const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);

            for (let channel = 0; channel < 2; channel++) {
                const channelData = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    const decay = Math.pow(1 - i / length, 2);
                    channelData[i] = (Math.random() * 2 - 1) * decay * 0.1;
                }
            }

            this.reverbNode = this.audioContext.createConvolver();
            this.reverbNode.buffer = impulse;
            this.reverbNode.connect(this.masterGain);

            console.log('[Performance] Reverb initialized');
        } catch (error) {
            console.error('[Performance] Failed to initialize reverb:', error);
        }
    }

    private setupPitchDetection(): void {
        this.pitchDetector = this.audioContext.createAnalyser();
        this.pitchDetector.fftSize = 4096;
        this.pitchDetector.smoothingTimeConstant = 0.8;
        this.detectionBuffer = new Float32Array(this.pitchDetector.frequencyBinCount);
    }

    /**
     * マイク入力を音程検出に接続
     */
    connectMicrophoneInput(micGainNode: GainNode): void {
        if (this.pitchDetector) {
            micGainNode.connect(this.pitchDetector);
            console.log('[Performance] Microphone connected for pitch detection');
        }
    }

    /**
     * B4音程の検出とトリガー処理
     */
    detectAndTriggerNote(instrumentId: 'horn1' | 'horn2' | 'trombone'): void {
        if (!this.pitchDetector || !this.detectionBuffer) return;

        const buffer = new Float32Array(this.pitchDetector.frequencyBinCount);
        this.pitchDetector.getFloatFrequencyData(buffer);

        // 簡易的な音程検出（実際にはより高精度なアルゴリズムが必要）
        const targetFreq = this.config.targetNote;

        // フーリエ変換結果から該当周波数成分を探す
        const binSize = this.audioContext.sampleRate / this.pitchDetector.fftSize;
        const targetBin = Math.round(targetFreq / binSize);

        if (targetBin < buffer.length) {
            const magnitude = buffer[targetBin];

            // 閾値を超えた場合にトリガー
            if (magnitude > -30) { // dB閾値（調整が必要）
                this.triggerAcousticNote(instrumentId, targetFreq);
            }
        }
    }

    /**
     * アコースティック楽器の音符トリガー
     */
    triggerAcousticNote(instrumentId: string, frequency: number): void {
        const instanceId = `acoustic_${instrumentId}_${this.instanceCounter++}`;

        // リバーブ処理
        const inputGain = this.audioContext.createGain();
        const sustainGain = this.audioContext.createGain();

        // 初期ゲイン設定
        inputGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);
        sustainGain.gain.setValueAtTime(0, this.audioContext.currentTime);

        // 減衰カーブ
        const decayTime = 1.0;
        const currentTime = this.audioContext.currentTime;

        inputGain.gain.linearRampToValueAtTime(0.1, currentTime + decayTime);
        sustainGain.gain.setValueAtTime(this.config.sustainLevel, currentTime + decayTime);

        // リバーブに接続
        if (this.reverbNode) {
            inputGain.connect(this.reverbNode);
            sustainGain.connect(this.reverbNode);
        }

        // インスタンス作成
        const instance: SoundInstance = {
            id: instanceId,
            sourceType: 'acoustic',
            frequency,
            startTime: currentTime,
            gainNode: inputGain,
            sustainGain,
            position: { x: 0, y: 0, z: 0 },
            active: true
        };

        this.instances.set(instanceId, instance);

        // 最大インスタンス数を超えた場合、古いものを削除
        this.cleanupOldInstances();

        console.log(`[Performance] Triggered acoustic note: ${instanceId}, freq: ${frequency}Hz`);

        // 映像システムに通知
        this.notifyVisualSystem('acoustic_trigger', { instrumentId, frequency, instanceId });
    }

    /**
     * 電子音の生成とトリガー
     */
    triggerElectronicNote(frequency: number): void {
        const instanceId = `electronic_${this.instanceCounter++}`;

        // オシレーター作成
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const sustainGain = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

        // 音量エンベロープ
        const currentTime = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0.3, currentTime);
        gainNode.gain.linearRampToValueAtTime(0.05, currentTime + 1.0);
        sustainGain.gain.setValueAtTime(this.config.sustainLevel, currentTime + 1.0);

        // 接続
        oscillator.connect(gainNode);
        gainNode.connect(sustainGain);

        if (this.reverbNode) {
            sustainGain.connect(this.reverbNode);
        }

        oscillator.start(currentTime);

        // インスタンス記録
        const instance: SoundInstance = {
            id: instanceId,
            sourceType: 'electronic',
            frequency,
            startTime: currentTime,
            gainNode,
            sustainGain,
            oscillator,
            position: { x: 0, y: 0, z: 0 },
            active: true
        };

        this.instances.set(instanceId, instance);
        this.cleanupOldInstances();

        console.log(`[Performance] Triggered electronic note: ${instanceId}, freq: ${frequency}Hz`);

        // 映像システムに通知（軸のみ動かす）
        this.notifyVisualSystem('electronic_trigger', { frequency, instanceId });
    }

    /**
     * 古いインスタンスのクリーンアップ
     */
    private cleanupOldInstances(): void {
        if (this.instances.size <= this.config.maxInstances) return;

        // 開始時間順にソート
        const sortedInstances = Array.from(this.instances.entries())
            .sort(([, a], [, b]) => a.startTime - b.startTime);

        // 古いインスタンスを削除
        const toRemove = sortedInstances.slice(0, this.instances.size - this.config.maxInstances);

        toRemove.forEach(([id]) => {
            this.stopInstance(id);
        });
    }

    /**
     * インスタンスの停止
     */
    stopInstance(instanceId: string): void {
        const instance = this.instances.get(instanceId);
        if (!instance) return;

        try {
            if (instance.oscillator) {
                instance.oscillator.stop();
                instance.oscillator.disconnect();
            }

            instance.gainNode.disconnect();
            instance.sustainGain.disconnect();
            instance.active = false;

            this.instances.delete(instanceId);

            console.log(`[Performance] Stopped instance: ${instanceId}`);
        } catch (error) {
            console.error(`[Performance] Error stopping instance ${instanceId}:`, error);
        }
    }

    /**
     * 映像システムへの通知
     */
    private notifyVisualSystem(eventType: string, data: any): void {
        // カスタムイベントで映像システムに通知
        document.dispatchEvent(new CustomEvent('performance-event', {
            detail: { type: eventType, data }
        }));
    }

    /**
     * 全インスタンスの情報を取得
     */
    getActiveInstances(): SoundInstance[] {
        return Array.from(this.instances.values()).filter(instance => instance.active);
    }

    /**
     * パフォーマンスのクリーンアップ
     */
    dispose(): void {
        // 全インスタンスを停止
        for (const [id] of this.instances) {
            this.stopInstance(id);
        }

        if (this.reverbNode) {
            this.reverbNode.disconnect();
        }

        this.masterGain.disconnect();

        console.log('[Performance] Performance disposed');
    }
}

// デフォルト設定
export const defaultPerformanceConfig: PerformanceConfig = {
    targetNote: 493.88, // B4
    reverbSettings: {
        roomSize: 0.7,
        damping: 0.3,
        wetLevel: 0.4,
        dryLevel: 0.6
    },
    sustainLevel: 0.15,
    maxInstances: 20
};
