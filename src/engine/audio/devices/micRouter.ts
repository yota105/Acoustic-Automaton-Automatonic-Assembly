/**
 * マイクルーター - 複数マイクの同時使用とルーティング機能
 */

import { getGlobalMicInputGateManager } from './micInputGate';

export interface MicInput {
    id: string;
    label: string;
    deviceId?: string;
    channelIndex?: number; // 0=L/Mono, 1=R, 2=CH3, etc.
    stream?: MediaStream;
    source?: MediaStreamAudioSourceNode;
    gainNode?: GainNode;
    channelSplitter?: ChannelSplitterNode; // ステレオ分離用
    analyser?: AnalyserNode; // メーター用
    enabled: boolean;
    volume: number;
}

export interface MicRoute {
    micId: string;
    destinationId: string;
    gain: number;
}

export class MicRouter {
    private audioContext: AudioContext;
    private micInputs: Map<string, MicInput> = new Map();
    private routes: MicRoute[] = [];
    private mixerNode?: GainNode;
    private outputNode?: AudioNode;

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;
        this.mixerNode = audioContext.createGain();

        // 重要: mixerNodeはどこにも接続しない
        // 新システムでは、マイク入力はPerformanceTrackManagerを通してのみルーティングされる
        console.log('[MicRouter] Initialized with isolated mixer (track-based routing only)');
    }

    /**
     * マイク入力を追加
     */
    async addMicInput(id: string, label: string, deviceId?: string, channelIndex?: number): Promise<void> {
        try {
            const channelLabel = channelIndex !== undefined ? ` [CH${channelIndex + 1}]` : '';
            console.log(`[MicRouter] Adding mic input: ${id} (${label}${channelLabel})`);

            // MediaStreamを取得
            const constraints: MediaStreamConstraints = {
                audio: deviceId ? {
                    deviceId: { exact: deviceId },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100
                    // channelCountを削除 - デバイスのネイティブチャンネル数を使用
                } : {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100
                },
                video: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // 実際のデバイス情報を取得してラベルを更新
            let actualLabel = label;
            if (deviceId) {
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const device = devices.find(d => d.deviceId === deviceId && d.kind === 'audioinput');
                    if (device && device.label) {
                        actualLabel = device.label + channelLabel;
                        console.log(`[MicRouter] Updated label from "${label}" to "${actualLabel}"`);
                    }
                } catch (e) {
                    console.warn(`[MicRouter] Could not get device label for ${deviceId}:`, e);
                }
            }

            // AudioNodeを作成
            const source = this.audioContext.createMediaStreamSource(stream);
            const gainNode = this.audioContext.createGain();

            // メーター用Analyserを作成(音は出さず、レベルだけモニター)
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser); // Analyserに接続(メーターのみ、出力には接続しない)

            // 重要: sourceはどこにも接続しない!
            // マイクソースは、PerformanceTrackManagerによって作成されるトラックを通してのみ音が出る
            // トラックシステムがsourceを直接使用するため、ここでは接続を作らない

            let channelSplitter: ChannelSplitterNode | undefined;
            // チャンネル分離の情報のみ記録(実際の接続は行わない)
            if (channelIndex !== undefined && source.channelCount > 1) {
                console.log(`[MicRouter] Mic has ${source.channelCount} channels, channel ${channelIndex} will be used by tracks`);
            }

            console.log(`[MicRouter] ⚠️ IMPORTANT: Mic source NOT connected to any output (track-based routing only)`);
            console.log(`[MicRouter] ✓ Analyser connected for level monitoring (no audio output)`);

            const micInput: MicInput = {
                id,
                label: actualLabel,  // 実際のデバイス名を使用
                deviceId,
                channelIndex,
                stream,
                source,
                gainNode,
                channelSplitter,
                analyser,
                enabled: true,
                volume: 1.0
            };

            this.micInputs.set(id, micInput);
            console.log(`[MicRouter] Successfully added mic input: ${id} with label "${actualLabel}"`);

            // MicInputGateManagerにマイクソースを登録
            // Logic Input ID (mic1, mic2, mic3) を performerId (player1, player2, player3) に変換
            try {
                const gateManager = getGlobalMicInputGateManager();
                // "mic1" → "player1", "mic2" → "player2", etc.
                const performerId = id.replace(/^mic/, 'player');
                gateManager.registerPerformerMic(performerId, source, deviceId);
                console.log(`[MicRouter] Registered mic source: ${id} → ${performerId}`);
            } catch (error) {
                console.warn(`[MicRouter] Could not register mic with gate manager:`, error);
            }

        } catch (error) {
            console.error(`[MicRouter] Failed to add mic input ${id}:`, error);
            throw error;
        }
    }

    /**
     * 指定されたIDのマイク入力を取得
     */
    getMicInput(id: string): MicInput | undefined {
        return this.micInputs.get(id);
    }

    /**
     * マイク入力を削除
     */
    removeMicInput(id: string): void {
        const micInput = this.micInputs.get(id);
        if (micInput) {
            // ストリームを停止
            if (micInput.stream) {
                micInput.stream.getTracks().forEach(track => track.stop());
            }

            // オーディオノードを切断
            if (micInput.source) {
                micInput.source.disconnect();
            }
            if (micInput.gainNode) {
                micInput.gainNode.disconnect();
            }

            this.micInputs.delete(id);
            console.log(`[MicRouter] Removed mic input: ${id}`);
        }
    }

    /**
     * マイクの音量を設定
     * 注: 新システムでは、マイクソースは直接出力に接続されていません。
     * 音量制御はトラックごとに行われます。このメソッドは後方互換性のために残されています。
     */
    setMicVolume(id: string, volume: number): void {
        const micInput = this.micInputs.get(id);
        if (micInput && micInput.gainNode) {
            micInput.gainNode.gain.value = volume;
            micInput.volume = volume;
            console.log(`[MicRouter] ⚠️ Set mic ${id} volume to ${volume} (legacy method, not used in new track system)`);
        }
    }

    /**
     * マイクの有効/無効を切り替え
     * 注: 新システムでは、マイクソースは直接出力に接続されていません。
     * 音が出るのはパフォーマンストラックのゲートが開いている時のみです。
     * このメソッドは後方互換性のために残されており、実質的な効果はありません。
     */
    setMicEnabled(id: string, enabled: boolean): void {
        const micInput = this.micInputs.get(id);
        if (micInput) {
            micInput.enabled = enabled;
            console.log(`[MicRouter] ⚠️ Set mic ${id} enabled: ${enabled} (legacy method, audio routing controlled by track gates)`);

            if (enabled) {
                console.log(`[MicRouter] ℹ️ Mic ${id} is registered. Audio will play only when performance cues trigger track gates.`);
            }
        }
    }

    /**
     * 出力ノードを接続
     * 注意: 新システムでは、マイクは直接出力に接続されません。
     * このメソッドは後方互換性のために残されていますが、実際の接続は行いません。
     */
    connectOutput(outputNode: AudioNode): void {
        console.log(`[MicRouter] ⚠️ connectOutput called but IGNORED (new track-based routing system)`);
        console.log(`[MicRouter] ℹ️ Mics will route through PerformanceTrackManager instead`);
        this.outputNode = outputNode; // 記録のみ
    }

    /**
     * 出力ノードを切断
     */
    disconnectOutput(): void {
        console.log(`[MicRouter] ⚠️ disconnectOutput called (no-op in new system)`);
        this.outputNode = undefined;
    }

    /**
     * ルーティング設定を追加
     */
    addRoute(micId: string, destinationId: string, gain: number = 1.0): void {
        const existingRoute = this.routes.find(r => r.micId === micId && r.destinationId === destinationId);
        if (existingRoute) {
            existingRoute.gain = gain;
        } else {
            this.routes.push({ micId, destinationId, gain });
        }
        console.log(`[MicRouter] Added route: ${micId} -> ${destinationId} (gain: ${gain})`);
    }

    /**
     * ルーティング設定を削除
     */
    removeRoute(micId: string, destinationId: string): void {
        this.routes = this.routes.filter(r => !(r.micId === micId && r.destinationId === destinationId));
        console.log(`[MicRouter] Removed route: ${micId} -> ${destinationId}`);
    }

    /**
     * マイク一覧を取得
     */
    getMicInputs(): MicInput[] {
        return Array.from(this.micInputs.values());
    }

    /**
     * ルーティング設定一覧を取得
     */
    getRoutes(): MicRoute[] {
        return [...this.routes];
    }

    /**
     * マイクルーターをクリーンアップ
     */
    dispose(): void {
        console.log(`[MicRouter] Disposing router`);

        // すべてのマイク入力を削除
        for (const id of this.micInputs.keys()) {
            this.removeMicInput(id);
        }

        // ミキサーノードを切断
        if (this.mixerNode) {
            this.mixerNode.disconnect();
        }

        this.routes = [];
    }

    /**
     * ミキサーノードを取得(DSPチェーンに接続するため)
     */
    getMixerNode(): GainNode | undefined {
        return this.mixerNode;
    }

    /**
     * AudioContextを取得
     */
    getAudioContext(): AudioContext {
        return this.audioContext;
    }

    /**
     * マイク入力のレベルを取得(メーター表示用)
     */
    getMicInputLevels(): { id: string; level: number }[] {
        const out: { id: string; level: number }[] = [];
        const tmp = new Uint8Array(256);

        // デバッグ: 初回のみログ出力
        if (!(window as any)._getMicInputLevelsInitialized) {
            console.log(`[MicRouter.getMicInputLevels] Starting level monitoring for ${this.micInputs.size} inputs`);
            (window as any)._getMicInputLevelsInitialized = true;
        }

        for (const [id, micInput] of this.micInputs.entries()) {
            // Analyserが存在し、ストリームがアクティブならレベルを計測
            if (micInput.analyser && micInput.stream && micInput.stream.active) {
                try {
                    micInput.analyser.getByteTimeDomainData(tmp);
                    let sum = 0;
                    for (let i = 0; i < tmp.length; i++) {
                        const v = (tmp[i] - 128) / 128; // -1..1
                        sum += v * v;
                    }
                    const rms = Math.sqrt(sum / tmp.length); // 0..1
                    const level = Math.min(1, Math.pow(rms, 0.5));
                    out.push({ id, level });
                } catch (error) {
                    // Analyserからデータ取得失敗時は0を返す
                    console.warn(`[MicRouter] Failed to get level for ${id}:`, error);
                    out.push({ id, level: 0 });
                }
            } else {
                // Analyserがない、またはストリームが非アクティブな場合は0
                out.push({ id, level: 0 });
            }
        }

        return out;
    }
}
