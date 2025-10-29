/**
 * マイク録音マネージャー
 * 
 * パフォーマンストラック中のマイク入力を録音し、
 * 後でグラニュラーシンセシスによる引き伸ばし再生に使用
 */

export interface RecordedPerformance {
    id: string;
    performerId: string;
    audioBuffer: AudioBuffer;
    recordedAt: number;
    duration: number;
    trackId: string;
}

export interface RecordingOptions {
    maxDuration: number;  // 最大録音時間（秒）
    sampleRate?: number;  // サンプリングレート（未指定時はAudioContextのレート）
}

/**
 * マイク録音マネージャー
 * ScriptProcessorNode（非推奨）の代わりにAudioWorkletを使った録音システム
 */
export class MicRecordingManager {
    private audioContext: AudioContext;
    private recordings: Map<string, RecordedPerformance> = new Map();
    private activeRecordings: Map<string, {
        performerId: string;
        trackId: string;
        buffer: Float32Array[];
        startTime: number;
        sourceNode: AudioNode;
        recorderNode: AudioWorkletNode | null;
    }> = new Map();
    private isWorkletLoaded = false;

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;
    }

    /**
     * 録音用AudioWorkletを初期化
     */
    async initializeWorklet(): Promise<void> {
        if (this.isWorkletLoaded) {
            return;
        }

        try {
            // TODO: AudioWorklet recorder の実装
            // 現時点では代替手段として MediaRecorder を使用する方式を検討
            console.log('[MicRecordingManager] Worklet initialization deferred - will use fallback recording method');
            this.isWorkletLoaded = true;
        } catch (error) {
            console.error('[MicRecordingManager] Failed to initialize recording worklet:', error);
            throw error;
        }
    }

    /**
     * 録音を開始（トラック作成時に呼び出される）
     */
    async startRecording(
        trackId: string,
        performerId: string,
        sourceNode: AudioNode,
        options: RecordingOptions = { maxDuration: 3.0 }
    ): Promise<void> {
        if (this.activeRecordings.has(trackId)) {
            console.warn(`[MicRecordingManager] Recording already active for track ${trackId}`);
            return;
        }

        console.log(`[MicRecordingManager] Starting recording for ${performerId} (track: ${trackId})`);

        // ScriptProcessorNodeを使った簡易録音（後でAudioWorkletに置き換え）
        const bufferSize = 4096;
        const channels = 1; // モノラル録音
        const buffers: Float32Array[] = [];

        // ScriptProcessorNodeを作成（非推奨だが動作確認用）
        const scriptNode = this.audioContext.createScriptProcessor(bufferSize, channels, channels);

        scriptNode.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            const chunk = new Float32Array(inputData);
            buffers.push(chunk);

            // 最大時間チェック
            const recordedSamples = buffers.reduce((sum, buf) => sum + buf.length, 0);
            const recordedDuration = recordedSamples / this.audioContext.sampleRate;
            if (recordedDuration >= options.maxDuration) {
                this.stopRecording(trackId);
            }
        };

        // 接続: sourceNode → scriptNode → destination (silent)
        const silentGain = this.audioContext.createGain();
        silentGain.gain.value = 0; // 録音中は音を出さない
        sourceNode.connect(scriptNode);
        scriptNode.connect(silentGain);
        silentGain.connect(this.audioContext.destination);

        this.activeRecordings.set(trackId, {
            performerId,
            trackId,
            buffer: buffers,
            startTime: this.audioContext.currentTime,
            sourceNode,
            recorderNode: null // ScriptProcessorNodeは AudioWorkletNode ではないが、後で置き換え
        });

        console.log(`[MicRecordingManager] Recording started for track ${trackId}`);
    }

    /**
     * 録音を停止してバッファを保存
     */
    stopRecording(trackId: string): RecordedPerformance | null {
        const recording = this.activeRecordings.get(trackId);
        if (!recording) {
            console.warn(`[MicRecordingManager] No active recording found for track ${trackId}`);
            return null;
        }

        console.log(`[MicRecordingManager] Stopping recording for track ${trackId}`);

        // バッファを結合してAudioBufferに変換
        const totalLength = recording.buffer.reduce((sum, chunk) => sum + chunk.length, 0);
        const audioBuffer = this.audioContext.createBuffer(
            1, // モノラル
            totalLength,
            this.audioContext.sampleRate
        );

        const channelData = audioBuffer.getChannelData(0);
        let offset = 0;
        for (const chunk of recording.buffer) {
            channelData.set(chunk, offset);
            offset += chunk.length;
        }

        const recordedPerf: RecordedPerformance = {
            id: `rec_${trackId}`,
            performerId: recording.performerId,
            audioBuffer,
            recordedAt: recording.startTime,
            duration: audioBuffer.duration,
            trackId
        };

        this.recordings.set(recordedPerf.id, recordedPerf);
        this.activeRecordings.delete(trackId);

        console.log(`[MicRecordingManager] Recording saved: ${recordedPerf.id} (${recordedPerf.duration.toFixed(2)}s)`);
        return recordedPerf;
    }

    /**
     * 録音を強制停止（エラー時など）
     */
    cancelRecording(trackId: string): void {
        const recording = this.activeRecordings.get(trackId);
        if (recording) {
            console.log(`[MicRecordingManager] Cancelling recording for track ${trackId}`);
            this.activeRecordings.delete(trackId);
        }
    }

    /**
     * 特定のperformerIdの録音を取得
     */
    getRecordingsByPerformer(performerId: string): RecordedPerformance[] {
        return Array.from(this.recordings.values())
            .filter(rec => rec.performerId === performerId)
            .sort((a, b) => b.recordedAt - a.recordedAt); // 新しい順
    }

    /**
     * 録音IDで取得
     */
    getRecording(recordingId: string): RecordedPerformance | undefined {
        return this.recordings.get(recordingId);
    }

    /**
     * 古い録音を削除（メモリ管理）
     */
    cleanupOldRecordings(maxAge: number = 300): void {
        const now = this.audioContext.currentTime;
        const toDelete: string[] = [];

        this.recordings.forEach((rec, id) => {
            const age = now - rec.recordedAt;
            if (age > maxAge) {
                toDelete.push(id);
            }
        });

        toDelete.forEach(id => this.recordings.delete(id));

        if (toDelete.length > 0) {
            console.log(`[MicRecordingManager] Cleaned up ${toDelete.length} old recordings`);
        }
    }

    /**
     * 全録音数を取得
     */
    getRecordingCount(): number {
        return this.recordings.size;
    }

    /**
     * 統計情報
     */
    getStats(): {
        totalRecordings: number;
        activeRecordings: number;
        recordingsByPerformer: Record<string, number>;
    } {
        const recordingsByPerformer: Record<string, number> = {};

        this.recordings.forEach(rec => {
            recordingsByPerformer[rec.performerId] = (recordingsByPerformer[rec.performerId] || 0) + 1;
        });

        return {
            totalRecordings: this.recordings.size,
            activeRecordings: this.activeRecordings.size,
            recordingsByPerformer
        };
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        // 全アクティブ録音を停止
        this.activeRecordings.forEach((_, trackId) => {
            this.cancelRecording(trackId);
        });

        this.recordings.clear();
        console.log('[MicRecordingManager] Disposed');
    }
}

// グローバルインスタンス
let globalMicRecordingManager: MicRecordingManager | null = null;

/**
 * グローバルなMicRecordingManagerを取得
 */
export function getGlobalMicRecordingManager(): MicRecordingManager {
    if (!globalMicRecordingManager) {
        throw new Error('MicRecordingManager not initialized');
    }
    return globalMicRecordingManager;
}

/**
 * グローバルなMicRecordingManagerを初期化
 */
export function initializeMicRecordingManager(audioContext: AudioContext): MicRecordingManager {
    if (!globalMicRecordingManager) {
        globalMicRecordingManager = new MicRecordingManager(audioContext);
        console.log('[MicRecordingManager] Global instance initialized');
    }
    return globalMicRecordingManager;
}
