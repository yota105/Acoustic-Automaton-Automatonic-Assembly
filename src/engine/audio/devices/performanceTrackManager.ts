/**
 * パフォーマンストラックマネージャー
 * 各奏者への合図(パフォーマンスキュー)ごとに独立したトラックを作成・管理
 * 将来的なグラニュラー処理やピッチシフトに対応できる構造
 */

export interface PerformanceTrack {
    id: string;                           // トラックID (performerId + タイムスタンプ)
    performerId: string;                  // 奏者ID
    micSourceNode: AudioNode;             // マイク入力ソース
    gateNode: GainNode;                   // ゲート制御用
    trackGainNode: GainNode;              // トラック全体の音量制御
    effectsChain: AudioNode[];            // エフェクトチェーン(将来的にグラニュラー等)
    outputNode: AudioNode;                // 最終出力ノード
    startTime: number;                    // トラック開始時刻
    endTime?: number;                     // トラック終了時刻
    isActive: boolean;                    // アクティブ状態
}

export interface TrackCreationParams {
    performerId: string;
    micInput: AudioNode;
    gateNode: GainNode;
    destinationNode: AudioNode;           // 最終出力先(リバーブ等)
}

/**
 * パフォーマンストラックマネージャー
 * 各合図ごとに独立したオーディオ処理チェーンを作成
 */
export class PerformanceTrackManager {
    private audioContext: AudioContext;
    private tracks: Map<string, PerformanceTrack> = new Map();
    private activeTracksByPerformer: Map<string, Set<string>> = new Map();

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;
    }

    /**
     * 新しいパフォーマンストラックを作成
     * @param params トラック作成パラメータ
     * @returns 作成されたトラックID
     */
    createTrack(params: TrackCreationParams): string {
        const trackId = `${params.performerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const currentTime = this.audioContext.currentTime;

        console.log(`[PerformanceTrackManager] Creating track ${trackId} for ${params.performerId}`);

        // トラック専用のゲインノード(音量制御用)
        const trackGainNode = this.audioContext.createGain();
        trackGainNode.gain.value = 1.0;

        // オーディオチェーンを構築: source → gate → trackGain → destination
        // 注: micInputは既に他のトラックで使われている可能性があるため、
        // ゲートノードから始めて、ゲートノードを共有しない構造にする
        params.gateNode.connect(trackGainNode);
        trackGainNode.connect(params.destinationNode);

        const track: PerformanceTrack = {
            id: trackId,
            performerId: params.performerId,
            micSourceNode: params.micInput,
            gateNode: params.gateNode,
            trackGainNode,
            effectsChain: [],  // 将来的にグラニュラー等を追加
            outputNode: params.destinationNode,
            startTime: currentTime,
            isActive: true
        };

        this.tracks.set(trackId, track);

        // 奏者ごとのアクティブトラックリストに追加
        if (!this.activeTracksByPerformer.has(params.performerId)) {
            this.activeTracksByPerformer.set(params.performerId, new Set());
        }
        this.activeTracksByPerformer.get(params.performerId)!.add(trackId);

        console.log(`[PerformanceTrackManager] Track ${trackId} created and active`);
        return trackId;
    }

    /**
     * トラックを終了(ゲートが閉じた後に呼び出す)
     * @param trackId トラックID
     */
    endTrack(trackId: string): void {
        const track = this.tracks.get(trackId);
        if (!track) {
            console.warn(`[PerformanceTrackManager] Track ${trackId} not found`);
            return;
        }

        if (!track.isActive) {
            console.log(`[PerformanceTrackManager] Track ${trackId} already ended`);
            return;
        }

        track.endTime = this.audioContext.currentTime;
        track.isActive = false;

        // アクティブトラックリストから削除
        const performerTracks = this.activeTracksByPerformer.get(track.performerId);
        if (performerTracks) {
            performerTracks.delete(trackId);
        }

        console.log(`[PerformanceTrackManager] Track ${trackId} ended at ${track.endTime}`);
    }

    /**
     * トラックを完全に削除(メモリ解放)
     * @param trackId トラックID
     */
    removeTrack(trackId: string): void {
        const track = this.tracks.get(trackId);
        if (!track) {
            return;
        }

        // オーディオノードを切断
        try {
            // マイクソース → ゲートの接続を切断
            track.micSourceNode.disconnect(track.gateNode);

            // ゲート → トラックゲインの接続を切断
            track.gateNode.disconnect();
            track.trackGainNode.disconnect();

            // エフェクトチェーンの切断
            track.effectsChain.forEach(node => {
                node.disconnect();
            });
        } catch (e) {
            console.warn(`[PerformanceTrackManager] Error disconnecting track ${trackId}:`, e);
        }

        // マップから削除
        this.tracks.delete(trackId);

        const performerTracks = this.activeTracksByPerformer.get(track.performerId);
        if (performerTracks) {
            performerTracks.delete(trackId);
            if (performerTracks.size === 0) {
                this.activeTracksByPerformer.delete(track.performerId);
            }
        }

        console.log(`[PerformanceTrackManager] Track ${trackId} removed from memory`);
    }

    /**
     * トラックの音量を設定
     * @param trackId トラックID
     * @param volume 音量(0.0-1.0)
     */
    setTrackVolume(trackId: string, volume: number): void {
        const track = this.tracks.get(trackId);
        if (track) {
            track.trackGainNode.gain.value = volume;
        }
    }

    /**
     * 指定した奏者のアクティブなトラック数を取得
     * @param performerId 奏者ID
     * @returns アクティブトラック数
     */
    getActiveTrackCount(performerId: string): number {
        return this.activeTracksByPerformer.get(performerId)?.size ?? 0;
    }

    /**
     * 指定した奏者のアクティブなトラックIDリストを取得
     * @param performerId 奏者ID
     * @returns トラックIDの配列
     */
    getActiveTrackIds(performerId: string): string[] {
        const trackSet = this.activeTracksByPerformer.get(performerId);
        return trackSet ? Array.from(trackSet) : [];
    }

    /**
     * トラック情報を取得
     * @param trackId トラックID
     * @returns トラック情報
     */
    getTrack(trackId: string): PerformanceTrack | undefined {
        return this.tracks.get(trackId);
    }

    /**
     * 全てのアクティブトラックを取得
     * @returns アクティブなトラックの配列
     */
    getAllActiveTracks(): PerformanceTrack[] {
        return Array.from(this.tracks.values()).filter(track => track.isActive);
    }

    /**
     * 古いトラックをクリーンアップ(定期的に呼び出す)
     * @param maxAge 最大保持時間(秒)
     */
    cleanupOldTracks(maxAge: number = 60): void {
        const currentTime = this.audioContext.currentTime;
        const tracksToRemove: string[] = [];

        this.tracks.forEach((track, trackId) => {
            // 非アクティブで、終了から一定時間経過したトラックを削除
            if (!track.isActive && track.endTime) {
                const age = currentTime - track.endTime;
                if (age > maxAge) {
                    tracksToRemove.push(trackId);
                }
            }
        });

        tracksToRemove.forEach(trackId => this.removeTrack(trackId));

        if (tracksToRemove.length > 0) {
            console.log(`[PerformanceTrackManager] Cleaned up ${tracksToRemove.length} old tracks`);
        }
    }

    /**
     * 統計情報を取得
     */
    getStats(): {
        totalTracks: number;
        activeTracks: number;
        tracksByPerformer: Record<string, number>;
    } {
        const activeTracks = this.getAllActiveTracks();
        const tracksByPerformer: Record<string, number> = {};

        this.activeTracksByPerformer.forEach((trackSet, performerId) => {
            tracksByPerformer[performerId] = trackSet.size;
        });

        return {
            totalTracks: this.tracks.size,
            activeTracks: activeTracks.length,
            tracksByPerformer
        };
    }
}

// グローバルシングルトンインスタンス
let globalPerformanceTrackManager: PerformanceTrackManager | null = null;

/**
 * グローバルなパフォーマンストラックマネージャーを取得
 */
export function getGlobalPerformanceTrackManager(): PerformanceTrackManager {
    if (!globalPerformanceTrackManager) {
        throw new Error('PerformanceTrackManager not initialized. Call initializePerformanceTrackManager first.');
    }
    return globalPerformanceTrackManager;
}

/**
 * グローバルなパフォーマンストラックマネージャーを初期化
 */
export function initializePerformanceTrackManager(audioContext: AudioContext): PerformanceTrackManager {
    if (!globalPerformanceTrackManager) {
        globalPerformanceTrackManager = new PerformanceTrackManager(audioContext);
        console.log('[PerformanceTrackManager] Global instance initialized');
    }
    return globalPerformanceTrackManager;
}
