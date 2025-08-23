/**
 * マイクルーター - 複数マイクの同時使用とルーティング機能
 */

export interface MicInput {
    id: string;
    label: string;
    deviceId?: string;
    stream?: MediaStream;
    source?: MediaStreamAudioSourceNode;
    gainNode?: GainNode;
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
    }

    /**
     * マイク入力を追加
     */
    async addMicInput(id: string, label: string, deviceId?: string): Promise<void> {
        try {
            console.log(`[MicRouter] Adding mic input: ${id} (${label})`);

        // MediaStreamを取得
        const constraints: MediaStreamConstraints = {
            audio: deviceId ? { 
                deviceId: { exact: deviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 44100
            } : {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 44100
            },
            video: false
        };            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // 実際のデバイス情報を取得してラベルを更新
            let actualLabel = label;
            if (deviceId) {
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const device = devices.find(d => d.deviceId === deviceId && d.kind === 'audioinput');
                    if (device && device.label) {
                        actualLabel = device.label;
                        console.log(`[MicRouter] Updated label from "${label}" to "${actualLabel}"`);
                    }
                } catch (e) {
                    console.warn(`[MicRouter] Could not get device label for ${deviceId}:`, e);
                }
            }

            // AudioNodeを作成
            const source = this.audioContext.createMediaStreamSource(stream);
            const gainNode = this.audioContext.createGain();

            // チェーンを構築
            source.connect(gainNode);
            gainNode.connect(this.mixerNode!);

            const micInput: MicInput = {
                id,
                label: actualLabel,  // 実際のデバイス名を使用
                deviceId,
                stream,
                source,
                gainNode,
                enabled: true,
                volume: 1.0
            };

            this.micInputs.set(id, micInput);
            console.log(`[MicRouter] Successfully added mic input: ${id} with label "${actualLabel}"`);

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
     */
    setMicVolume(id: string, volume: number): void {
        const micInput = this.micInputs.get(id);
        if (micInput && micInput.gainNode) {
            micInput.gainNode.gain.value = volume;
            micInput.volume = volume;
            console.log(`[MicRouter] Set mic ${id} volume to ${volume}`);
        }
    }

    /**
     * マイクの有効/無効を切り替え
     */
    setMicEnabled(id: string, enabled: boolean): void {
        const micInput = this.micInputs.get(id);
        if (micInput) {
            if (micInput.gainNode) {
                micInput.gainNode.gain.value = enabled ? micInput.volume : 0;
            }
            micInput.enabled = enabled;
            console.log(`[MicRouter] Set mic ${id} enabled: ${enabled}`);
        }
    }

    /**
     * 出力ノードを接続
     */
    connectOutput(outputNode: AudioNode): void {
        if (this.mixerNode) {
            this.mixerNode.connect(outputNode);
            this.outputNode = outputNode;
            console.log(`[MicRouter] Connected to output node`);
        }
    }

    /**
     * 出力ノードを切断
     */
    disconnectOutput(): void {
        if (this.mixerNode && this.outputNode) {
            this.mixerNode.disconnect(this.outputNode);
            this.outputNode = undefined;
            console.log(`[MicRouter] Disconnected from output node`);
        }
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
     * ミキサーノードを取得（DSPチェーンに接続するため）
     */
    getMixerNode(): GainNode | undefined {
        return this.mixerNode;
    }
}
