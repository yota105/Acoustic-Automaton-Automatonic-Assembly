/**
 * TestSignalManager - テスト信号生成管理
 * Tone / Noise / Impulse 信号を Logic Input へ注入する
 */

interface TestSignalSpec {
    type: 'tone' | 'noise' | 'impulse';
    id: string;
    startedAt: number;
    nodes: AudioNode[];
    duration: number;
}

interface TestSignalOptions {
    frequency?: number;  // tone用 (デフォルト: 440Hz)
    amplitude?: number;  // 振幅 (デフォルト: type依存)
    duration?: number;   // 再生時間秒 (デフォルト: type依存)
}

export class TestSignalManager {
    private activeSignals = new Map<string, TestSignalSpec>();
    private ctx: AudioContext;
    private noiseBuffer: AudioBuffer | null = null;

    constructor(audioContext: AudioContext) {
        this.ctx = audioContext;
        this.preloadNoiseBuffer();
    }

    /**
     * ホワイトノイズバッファを事前生成
     */
    private async preloadNoiseBuffer(): Promise<void> {
        const sampleRate = this.ctx.sampleRate;
        const bufferLength = Math.floor(sampleRate * 1.0); // 1秒分
        const buffer = this.ctx.createBuffer(1, bufferLength, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferLength; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.25; // 振幅0.25のホワイトノイズ
        }

        this.noiseBuffer = buffer;
        console.log("[TestSignalManager] Noise buffer preloaded");
    }

    /**
     * テスト信号開始
     */
    async start(type: 'tone' | 'noise' | 'impulse', logicInputId: string, options: TestSignalOptions = {}): Promise<void> {
        // 既存信号停止
        this.stop(logicInputId);

        // Logic Input の GainNode 取得
        const inputGainNode = await this.ensureInputGain(logicInputId);
        if (!inputGainNode) {
            console.warn(`[TestSignalManager] Cannot get input gain for Logic Input: ${logicInputId}`);
            return;
        }

        console.log(`[TestSignalManager] Starting ${type} signal for Logic Input: ${logicInputId}`);
        console.log(`[TestSignalManager] InputGainNode:`, inputGainNode);
        console.log(`[TestSignalManager] AudioContext state:`, this.ctx.state);
        console.log(`[TestSignalManager] Output gain:`, window.outputGainNode?.gain.value);

        // AudioContext が suspended の場合は resume
        if (this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
                console.log(`[TestSignalManager] AudioContext resumed for ${type} signal`);
            } catch (error) {
                console.error(`[TestSignalManager] Failed to resume AudioContext:`, error);
                throw error;
            }
        }

        const currentTime = this.ctx.currentTime;
        const spec: TestSignalSpec = {
            type,
            id: logicInputId,
            startedAt: currentTime,
            nodes: [],
            duration: this.getDefaultDuration(type, options.duration)
        };

        try {
            switch (type) {
                case 'tone':
                    this.createToneSignal(spec, inputGainNode, options);
                    break;
                case 'noise':
                    this.createNoiseSignal(spec, inputGainNode, options);
                    break;
                case 'impulse':
                    this.createImpulseSignal(spec, inputGainNode, options);
                    break;
            }

            this.activeSignals.set(logicInputId, spec);

            // 自動停止タイマー
            setTimeout(() => {
                this.stop(logicInputId);
            }, spec.duration * 1000);

            console.log(`[TestSignalManager] Started ${type} signal for Logic Input: ${logicInputId}`);

        } catch (error) {
            console.error(`[TestSignalManager] Failed to create ${type} signal:`, error);
            this.cleanupNodes(spec.nodes);
        }
    }

    /**
     * 特定Logic Inputのテスト信号停止
     */
    stop(logicInputId: string): void {
        const spec = this.activeSignals.get(logicInputId);
        if (!spec) return;

        this.cleanupNodes(spec.nodes);
        this.activeSignals.delete(logicInputId);

        console.log(`[TestSignalManager] Stopped ${spec.type} signal for Logic Input: ${logicInputId}`);
    }

    /**
     * 全テスト信号停止
     */
    stopAll(): void {
        for (const logicInputId of this.activeSignals.keys()) {
            this.stop(logicInputId);
        }
    }

    /**
     * Tone信号作成 (440Hz 0.6s)
     */
    private createToneSignal(spec: TestSignalSpec, gainNode: GainNode, options: TestSignalOptions): void {
        const frequency = options.frequency || 440;
        const amplitude = options.amplitude || 0.35;

        const oscillator = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();

        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);

        // エンベロープ: 10ms フェードイン、90%再生、50ms フェードアウト
        const startTime = this.ctx.currentTime;
        const fadeInTime = 0.01;
        const fadeOutTime = 0.05;
        const sustainTime = spec.duration - fadeInTime - fadeOutTime;

        oscGain.gain.setValueAtTime(0, startTime);
        oscGain.gain.linearRampToValueAtTime(amplitude, startTime + fadeInTime);
        oscGain.gain.setValueAtTime(amplitude, startTime + fadeInTime + sustainTime);
        oscGain.gain.linearRampToValueAtTime(0, startTime + spec.duration);

        oscillator.connect(oscGain);
        oscGain.connect(gainNode);

        oscillator.start(startTime);
        oscillator.stop(startTime + spec.duration);

        spec.nodes.push(oscillator, oscGain);
    }

    /**
     * Noise信号作成 (ホワイトノイズ 0.6s)
     */
    private createNoiseSignal(spec: TestSignalSpec, gainNode: GainNode, options: TestSignalOptions): void {
        if (!this.noiseBuffer) {
            console.warn("[TestSignalManager] Noise buffer not ready");
            return;
        }

        const amplitude = options.amplitude || 0.25;

        const source = this.ctx.createBufferSource();
        const noiseGain = this.ctx.createGain();

        source.buffer = this.noiseBuffer;

        // エンベロープ適用
        const startTime = this.ctx.currentTime;
        const fadeInTime = 0.01;
        const fadeOutTime = 0.05;
        const sustainTime = spec.duration - fadeInTime - fadeOutTime;

        noiseGain.gain.setValueAtTime(0, startTime);
        noiseGain.gain.linearRampToValueAtTime(amplitude, startTime + fadeInTime);
        noiseGain.gain.setValueAtTime(amplitude, startTime + fadeInTime + sustainTime);
        noiseGain.gain.linearRampToValueAtTime(0, startTime + spec.duration);

        source.connect(noiseGain);
        noiseGain.connect(gainNode);

        source.start(startTime);
        source.stop(startTime + spec.duration);

        spec.nodes.push(source, noiseGain);
    }

    /**
     * Impulse信号作成 (インパルス 0.1s)
     */
    private createImpulseSignal(spec: TestSignalSpec, gainNode: GainNode, options: TestSignalOptions): void {
        const amplitude = options.amplitude || 0.5;

        // 短いインパルスバッファ作成
        const bufferLength = Math.floor(this.ctx.sampleRate * 0.001); // 1ms
        const buffer = this.ctx.createBuffer(1, bufferLength, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        data[0] = amplitude; // 最初のサンプルだけ振幅

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        source.connect(gainNode);

        const startTime = this.ctx.currentTime;
        source.start(startTime);
        source.stop(startTime + spec.duration);

        spec.nodes.push(source);
    }

    /**
     * Logic Input の GainNode 取得・確保
     */
    private async ensureInputGain(logicInputId: string): Promise<GainNode | null> {
        try {
            // BusManager 確認
            if (!window.busManager) {
                console.warn("[TestSignalManager] BusManager not available");
                return null;
            }

            // LogicInputManager 確認
            if (!window.logicInputManagerInstance) {
                console.warn("[TestSignalManager] LogicInputManagerInstance not available");
                return null;
            }

            // LogicInput 取得 (list()メソッドでリストを取得してfindで検索)
            const logicInputManager = window.logicInputManagerInstance;
            const logicInputs = logicInputManager.list ? logicInputManager.list() : logicInputManager.getInputs();
            let logicInput = logicInputs.find((input: any) => input.id === logicInputId);

            // LogicInputが存在しない場合は自動作成
            if (!logicInput) {
                console.log(`[TestSignalManager] Creating Logic Input: ${logicInputId}`);

                logicInput = logicInputManager.add({
                    id: logicInputId,
                    label: `Test Signal ${logicInputId}`,
                    assignedDeviceId: null,
                    routing: { synth: true, effects: false, monitor: true },
                    gain: 1.0,
                    enabled: true
                });
            }

            // BusManager で connection 確保 & GainNode 取得
            const busManager = window.busManager;
            busManager.ensureInput(logicInput);
            const gainNode = busManager.getInputGainNode(logicInputId);

            return gainNode || null;

        } catch (error) {
            console.error("[TestSignalManager] Failed to ensure input gain:", error);
            return null;
        }
    }

    /**
     * type に応じたデフォルト再生時間
     */
    private getDefaultDuration(type: 'tone' | 'noise' | 'impulse', userDuration?: number): number {
        if (userDuration !== undefined) return userDuration;

        switch (type) {
            case 'tone': return 0.6;   // 0.6秒
            case 'noise': return 0.6;  // 0.6秒  
            case 'impulse': return 0.1; // 0.1秒
            default: return 0.5;
        }
    }

    /**
     * AudioNode クリーンアップ
     */
    private cleanupNodes(nodes: AudioNode[]): void {
        for (const node of nodes) {
            try {
                if ('stop' in node && typeof node.stop === 'function') {
                    (node as any).stop();
                }
                node.disconnect();
            } catch (error) {
                // 既に停止済みの場合は無視
            }
        }
    }

    /**
     * 現在アクティブな信号数
     */
    getActiveSignalCount(): number {
        return this.activeSignals.size;
    }

    /**
     * 特定Logic Inputの信号状態
     */
    isActive(logicInputId: string): boolean {
        return this.activeSignals.has(logicInputId);
    }
}

// Window グローバル拡張
declare global {
    interface Window {
        testSignalManager?: TestSignalManager;
        logicInputManagerInstance?: any; // LogicInputManager instance
    }
}
